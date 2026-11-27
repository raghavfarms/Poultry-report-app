import mongoose from 'mongoose';
import DailyEvaluation from '../models/DailyEvaluation.js';
import PerformanceQuestion from '../models/PerformanceQuestion.js';
import GradeSalaryConfig from '../models/GradeSalaryConfig.js';
import MonthlyWorkerGrade from '../models/MonthlyWorkerGrade.js';
import WorkerSalary from '../models/WorkerSalary.js';
import Worker from '../../attendance/models/Worker.js';
import AttendanceSession from '../../attendance/models/AttendanceSession.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError, forbiddenError } from '../../utils/http.js';
import { evaluateDutyInPunctuality, evaluateLunchInPunctuality } from '../utils/attendancePunctuality.js';
import { getComputedMonthlyGradesMap } from './salary.controller.js';

// Helper: Detect if a worker role is Driver or Night Guard
function isDriverOrNightGuard(designationName) {
  const d = (designationName || '').toLowerCase();
  return (
    d.includes('driver') ||
    d.includes('ड्राइवर') ||
    d.includes('night') ||
    d.includes('नाईट') ||
    d.includes('security') ||
    d.includes('सिक्योरिटी') ||
    d.includes('guard') ||
    d.includes('गार्ड')
  );
}

// Helper: Identify questions NOT applicable to Driver & Night Guard
// (Lunch, दाना, AI, अंडा are not applicable; whereas समय पर आया, आदेश, सफाई/काम, बिना शराब, झगड़ा नहीं ARE applicable = exactly 5 questions)
function isNonApplicableForDriverOrNight(q) {
  const text = q?.questionText || q?.questionTextSnapshot || '';
  return text.includes('लंच') ||
         text.includes('दाना') ||
         text.includes('AI') ||
         text.includes('अंडा');
}

// Helper: Calculate daily score and grade based on variable points scale and attendance
function calculateDailyPerformance(answers, config, attendanceStatus, isDriverOrNight = false) {
  const isAbsent = attendanceStatus === 'ABSENT';

  if (isAbsent) {
    // For Absent workers, ONLY Question 4 ("छुट्टी बता कर करी?") is applicable
    const leaveAns = answers.find(
      (a) => a.displayOrderSnapshot === 4 || a.questionTextSnapshot?.includes('छुट्टी')
    );
    const didInform = leaveAns ? leaveAns.answer === 'YES' : true;

    if (didInform) {
      // Approved leave (Informed): Neutral Day (0 deduction, Grade protected)
      return {
        dailyScore: 0,
        dailyGrade: 'NOT_APPLICABLE',
        hasCriticalViolation: false,
        maxPossiblePoints: 0,
        isApprovedLeave: true,
      };
    } else {
      // Uninformed / Overstayed leave: Penalty Day! Score 0, triggers violation & gets Grade D
      return {
        dailyScore: 0,
        dailyGrade: 'D',
        hasCriticalViolation: true,
        maxPossiblePoints: 9,
        isApprovedLeave: false,
      };
    }
  }

  // For Present / Half Day workers:
  // Evaluate ONLY operational farm questions (exclude Question 4 "छुट्टी बता कर करी?")
  let hasCriticalViolation = false;
  let totalPoints = 0;
  let maxPossiblePoints = 0;

  for (const ans of answers) {
    const isLeaveQ = ans.displayOrderSnapshot === 4 || ans.questionTextSnapshot?.includes('छुट्टी');
    if (isLeaveQ) continue; // Skip leave question for present workers

    const weight = Number(ans.weightSnapshot || 1);
    maxPossiblePoints += weight;

    if (ans.isCriticalViolationSnapshot && ans.answer === 'NO') {
      hasCriticalViolation = true;
    }

    if (ans.answer === 'YES') {
      totalPoints += weight;
    }
  }

  // For Driver & Night Guard / Security: 5 active questions are evaluated.
  // The remaining 4 non-applicable questions receive neutral credit (+4 points) to scale to universal 9-point system.
  if (isDriverOrNight && maxPossiblePoints > 0 && maxPossiblePoints < 9) {
    const neutralCredit = 9 - maxPossiblePoints;
    totalPoints += neutralCredit;
    maxPossiblePoints += neutralCredit;
  }

  // Daily score directly in points earned
  let dailyScore = totalPoints;

  // Dynamically calculate grade thresholds based on total points of active operational questions
  const effectiveMax = maxPossiblePoints || 9;
  const percentA = config?.gradeRules?.gradeA?.minPercentage || 85;
  const percentB = config?.gradeRules?.gradeB?.minPercentage || 77;
  const percentC = (config?.gradeRules?.gradeC?.minPercentage > 0) ? config.gradeRules.gradeC.minPercentage : 50;
  const minGradeA = Math.round(effectiveMax * (percentA / 100));
  const minGradeB = Math.round(effectiveMax * (percentB / 100));
  const minGradeC = Math.round(effectiveMax * (percentC / 100));

  let grade = 'D';
  if (hasCriticalViolation) {
    grade = config?.criticalViolationGrade || 'D';
  } else if (dailyScore >= minGradeA) {
    grade = 'A';
  } else if (dailyScore >= minGradeB) {
    grade = 'B';
  } else if (dailyScore >= minGradeC) {
    grade = 'C';
  } else {
    grade = 'D';
  }

  return { dailyScore, dailyGrade: grade, hasCriticalViolation, maxPossiblePoints, isApprovedLeave: false };
}

// ==========================================
// GET DAILY EVALUATION MATRIX
// ==========================================
export async function getDailyEvaluationMatrix(req, res) {
  const { firmId, date } = req.query;
  if (!firmId) throw badRequest('Firm ID is required.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Valid date (YYYY-MM-DD) is required.');

  const firm = await Firm.findById(firmId).select('name code').lean();
  if (!firm) throw notFoundError('Firm not found.');

  // Calculate previous month string (e.g., '2026-10' for date in '2026-11')
  const currentMonth = date.slice(0, 7);
  const [cYear, cMonth] = currentMonth.split('-').map(Number);
  const prevMonthDate = new Date(Date.UTC(cYear, cMonth - 2, 1));
  const previousMonth = prevMonthDate.toISOString().slice(0, 7);

  // 1. Parallel fetch: active questions, active config, workers, attendance sessions, existing evaluations, past grades, salaries
  const [questions, config, workers, sessions, existingEvaluations, pastGrades, salaries, computedPastGradeMap] = await Promise.all([
    PerformanceQuestion.find({ active: true }).sort({ displayOrder: 1, createdAt: 1 }).lean(),
    GradeSalaryConfig.findOne({ $or: [{ firm: firmId }, { firm: null }], active: true })
      .sort({ firm: -1 })
      .lean() || {},
    Worker.find({ firm: firmId, active: true })
      .select('fullName workerCode designation dateOfJoining')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),
    // Strictly READ-ONLY attendance sessions query
    AttendanceSession.find({ firm: firmId, date })
      .select('worker workedMinutes status dutyIn dutyOut lunchIn lunchOut')
      .lean(),
    // Evaluators strictly see ONLY their own ratings on their device
    DailyEvaluation.find({ firm: firmId, evaluationDate: date, submittedBy: req.user._id }).lean(),
    // Fetch last month's saved/overridden grades
    MonthlyWorkerGrade.find({ firm: firmId, month: previousMonth }).lean(),
    // Fetch worker salary / baseline grades
    WorkerSalary.find({ firm: firmId }).lean(),
    // Auto-compute last month's grades from Tab 3 logic starting from December 2026 onwards
    // (For December 2026, previousMonth is '2026-11', which keeps Admin's one-time baseline grades)
    previousMonth >= '2026-12' ? getComputedMonthlyGradesMap(firmId, previousMonth) : Promise.resolve(new Map()),
  ]);

  const pastGradeMap = new Map(pastGrades.map((g) => [String(g.worker), g]));
  const salaryMap = new Map(salaries.map((s) => [String(s.worker), s]));

  // Map sessions by workerId to classify attendance status
  const sessionMap = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!sessionMap.has(wId)) sessionMap.set(wId, []);
    sessionMap.get(wId).push(s);
  }

  // Map existing evaluations by workerId for this evaluator
  const evaluationMap = new Map();
  for (const ev of existingEvaluations) {
    evaluationMap.set(String(ev.worker), ev);
  }

  // Find workers who do NOT have an evaluation for 'date' by this evaluator,
  // and fetch their latest evaluation strictly before 'date' by THIS evaluator to carry forward their template
  const unevaluatedWorkerIds = workers
    .filter((w) => !evaluationMap.has(String(w._id)))
    .map((w) => w._id);

  const previousAnswersMap = new Map();
  if (unevaluatedWorkerIds.length > 0) {
    const pastEvals = await DailyEvaluation.aggregate([
      {
        $match: {
          firm: new mongoose.Types.ObjectId(firmId),
          worker: { $in: unevaluatedWorkerIds },
          evaluationDate: { $lt: date },
          submittedBy: new mongoose.Types.ObjectId(req.user._id),
        },
      },
      { $sort: { evaluationDate: -1 } },
      {
        $group: {
          _id: '$worker',
          latestAnswers: { $first: '$answers' },
          latestEvalDate: { $first: '$evaluationDate' },
        },
      },
    ]);

    for (const p of pastEvals) {
      previousAnswersMap.set(String(p._id), {
        answers: p.latestAnswers,
        date: p.latestEvalDate,
      });
    }
  }

  // 2. Classify workers into Present, Half Day, Absent
  const presentWorkers = [];
  const halfDayWorkers = [];
  const absentWorkers = [];

  for (const w of workers) {
    const wId = String(w._id);
    const workerSessions = sessionMap.get(wId) || [];
    const existingEval = evaluationMap.get(wId) || null;
    const pastEvalData = previousAnswersMap.get(wId);

    let status = 'ABSENT';  
    let totalWorkedMinutes = 0;
    let hasOpenSession = false;
    let dutyInDate = null;
    let lunchInDate = null;
    let lunchOutDate = null;

    if (workerSessions.length > 0) {
      for (const sess of workerSessions) {
        if (sess.status === 'PRESENT') hasOpenSession = true;
        totalWorkedMinutes += sess.workedMinutes || 0;
        if (!dutyInDate && sess.dutyIn) dutyInDate = sess.dutyIn;
        if (!lunchInDate && sess.lunchIn) lunchInDate = sess.lunchIn;
        if (!lunchOutDate && sess.lunchOut) lunchOutDate = sess.lunchOut;
      }

      if (hasOpenSession || totalWorkedMinutes >= 475) {
        status = 'PRESENT';
      } else if (totalWorkedMinutes >= 235) {
        status = 'HALF_DAY';
      } else {
        status = 'ABSENT';
      }
    }

    const desName = (w.designation?.name || '').toLowerCase();
    const isNightWorker = desName.includes('night') || desName.includes('नाईट');
    const dutyInPunctuality = evaluateDutyInPunctuality(dutyInDate, isNightWorker);
    const lunchInPunctuality = evaluateLunchInPunctuality(lunchInDate, lunchOutDate, isNightWorker);

    const pastGradeDoc = pastGradeMap.get(wId);
    const computedPastGrade = computedPastGradeMap.get(wId);
    const salaryDoc = salaryMap.get(wId);
    const lastMonthGrade =
      pastGradeDoc?.overrideGrade ||
      (pastGradeDoc?.finalGrade && pastGradeDoc.finalGrade !== 'NO_DATA' ? pastGradeDoc.finalGrade : null) ||
      (computedPastGrade && computedPastGrade !== 'NO_DATA' ? computedPastGrade : null) ||
      salaryDoc?.baselineGrade ||
      null;

    const workerPayload = {
      workerId: w._id,
      workerCode: w.workerCode,
      workerName: w.fullName,     
      designationName: w.designation?.name || '—',
      attendanceStatus: status,
      totalWorkedMinutes,
      lastMonthGrade,
      attendancePunctuality: {
        dutyIn: dutyInPunctuality,
        lunchIn: lunchInPunctuality,
      },
      isEvaluated: Boolean(existingEval),
      dailyGrade: existingEval?.dailyGrade || null,
      dailyScore: existingEval?.dailyScore ?? null,
      answers: existingEval ? existingEval.answers : null, // If submitted today, return saved snapshot
      previousAnswers: !existingEval && pastEvalData ? pastEvalData.answers : null,
      previousEvaluationDate: !existingEval && pastEvalData ? pastEvalData.date : null,
    };

    if (status === 'PRESENT') presentWorkers.push(workerPayload);
    else if (status === 'HALF_DAY') halfDayWorkers.push(workerPayload);
    else absentWorkers.push(workerPayload);
  }

  // Identify automated attendance questions (Q1: Duty In <= 8:30 AM, Q3: Lunch In <= 1:10 PM) and Leave question (Q4)
  const processedQuestions = questions.map((q) => {
    let automatedType = null;
    if (q.displayOrder === 1) automatedType = 'DUTY_IN';
    else if (q.displayOrder === 3) automatedType = 'LUNCH_IN';
    const isLeaveQuestion = q.displayOrder === 4 || q.questionText?.includes('छुट्टी');
    return {
      ...q,
      automatedType, 
      isLeaveQuestion,    
    };
  });

  const userRole = String(req.user?.role?.name || req.user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'developer', 'superadmin'].includes(userRole);
  const evaluatedCount = existingEvaluations.length;
  // Non-admins (Supervisor, Incharge) are locked once submitted. Admin/Developer can edit and resubmit anytime.
  const isAlreadySubmitted = !isAdmin && evaluatedCount > 0;

  res.json({
    success: true,
    date,
    firm,
    isAlreadySubmitted,
    evaluatedCount,
    isAdmin,
    summary: {
      total: workers.length,
      present: presentWorkers.length,
      halfDay: halfDayWorkers.length,
      absent: absentWorkers.length,
    },
    questions: processedQuestions,
    workers: {
      present: presentWorkers,
      halfDay: halfDayWorkers,
      absent: absentWorkers,
    },
  });
}

// ==========================================
// SUBMIT DAILY EVALUATION
// ==========================================
export async function submitDailyEvaluation(req, res) {
  const { firmId, date, evaluations } = req.body;
  if (!firmId || !date) throw badRequest('Firm ID and Date are required.');
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    throw badRequest('Evaluations list cannot be empty.');
  }

  const userRole = String(req.user?.role?.name || req.user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'developer', 'superadmin'].includes(userRole);

  // Strict one-time submission rule for non-admins (Supervisor, Incharge).
  // Admin and Developer can submit and update multiple times.
  if (!isAdmin) {
    const existingCount = await DailyEvaluation.countDocuments({
      firm: firmId,
      evaluationDate: date,
      submittedBy: req.user._id,
    });
    if (existingCount > 0) {
      throw forbiddenError(
        'Daily ratings for this date have already been submitted. Re-submission is not allowed.'
      );
    }
  }

  const [firm, config, activeQuestions] = await Promise.all([
    Firm.findById(firmId).select('name code').lean(),
    GradeSalaryConfig.findOne({ $or: [{ firm: firmId }, { firm: null }], active: true })
      .sort({ firm: -1 })
      .lean() || {},
    PerformanceQuestion.find({ active: true }).lean(),
  ]);

  if (!firm) throw notFoundError('Firm not found.');
  const questionMap = new Map(activeQuestions.map((q) => [String(q._id), q]));

  // Fetch read-only attendance sessions to enforce automatic punctuality for Q1 and Q3
  const workerIds = evaluations.map((e) => e.workerId).filter(Boolean);
  const [sessions, workerDocs] = await Promise.all([
    AttendanceSession.find({
      worker: { $in: workerIds },
      date: date,
    }).lean(),
    Worker.find({ _id: { $in: workerIds } })
      .select('designation')
      .populate('designation', 'name')
      .lean(),
  ]);

  const workerDocMap = new Map(workerDocs.map((w) => [String(w._id), w]));
  const workerSessionMap = new Map();
  for (const s of sessions) {
    const wid = String(s.worker);
    if (!workerSessionMap.has(wid)) workerSessionMap.set(wid, []);
    workerSessionMap.get(wid).push(s);
  }

  const results = [];

  for (const item of evaluations) {
    const { workerId, workerCode, workerName, attendanceStatus, answers } = item;
    const workerDoc = workerDocMap.get(String(workerId));
    const desName = (workerDoc?.designation?.name || '').toLowerCase();
    const isDriverOrNight = isDriverOrNightGuard(desName);
    const isNightWorker = desName.includes('night') || desName.includes('नाईट');

    // Build question answer snapshots: Only evaluate applicable questions with YES / NO (omit N/A questions!)
    const answerSnapshots = [];
    for (const ans of answers) {
      const q = questionMap.get(String(ans.questionId));
      if (!q) continue;

      const isNonApplicable = isNonApplicableForDriverOrNight(q);
      const isLeaveQ = q.displayOrder === 4 || q.questionText?.includes('छुट्टी');

      // Skip questions that are N/A (jiska NA rahe uska chhod):
      if (attendanceStatus !== 'ABSENT' && isLeaveQ) continue;
      if (isDriverOrNight && isNonApplicable) continue;
      if (attendanceStatus === 'ABSENT' && !isLeaveQ) continue;

      let finalAnswer = ans.answer === 'NO' ? 'NO' : 'YES';
      if (attendanceStatus !== 'ABSENT' && (q.displayOrder === 1 || q.displayOrder === 3)) {
        const wSessions = workerSessionMap?.get(String(workerId)) || [];
        let dutyInDate = null;
        let lunchInDate = null;
        let lunchOutDate = null;
        for (const sess of wSessions) {
          if (!dutyInDate && sess.dutyIn) dutyInDate = sess.dutyIn;
          if (!lunchInDate && sess.lunchIn) lunchInDate = sess.lunchIn;
          if (!lunchOutDate && sess.lunchOut) lunchOutDate = sess.lunchOut;
        }

        if (q.displayOrder === 1) {
          finalAnswer = evaluateDutyInPunctuality(dutyInDate, isNightWorker).answer;
        } else if (q.displayOrder === 3) {
          finalAnswer = evaluateLunchInPunctuality(lunchInDate, lunchOutDate, isNightWorker).answer;
        }
      }

      answerSnapshots.push({
        questionId: q._id,
        questionTextSnapshot: q.questionText,
        displayOrderSnapshot: q.displayOrder,
        answer: finalAnswer,
        weightSnapshot: q.weight || 1,
        isCriticalViolationSnapshot: Boolean(q.isCriticalViolation),
      });
    }

    const { dailyScore, dailyGrade, hasCriticalViolation, isApprovedLeave } = calculateDailyPerformance(
      answerSnapshots,
      config,
      attendanceStatus,
      isDriverOrNight
    );

    const userRoleName = req.user.role?.name || (typeof req.user.role === 'string' ? req.user.role : 'Supervisor');

    const doc = await DailyEvaluation.findOneAndUpdate(
      { worker: workerId, evaluationDate: date, submittedBy: req.user._id },
      {
        worker: workerId,
        workerCodeSnapshot: workerCode,
        workerNameSnapshot: workerName,
        firm: firmId,
        firmNameSnapshot: firm.name,
        evaluationDate: date,
        attendanceStatusSnapshot: attendanceStatus,
        answers: answerSnapshots,
        dailyScore,
        dailyGrade,
        hasCriticalViolation,
        isApprovedLeave: Boolean(isApprovedLeave),
        submittedBy: req.user._id,
        submittedByNameSnapshot: req.user.name,
        submittedByRoleSnapshot: userRoleName,
      },
      { upsert: true, new: true, runValidators: true }
    );

    results.push(doc);
  }

  res.json({ success: true, count: results.length, evaluations: results });
}

// ==========================================
// SET WORKER BASELINE / LAST MONTH GRADE (Admin Only)
// ==========================================
export async function setWorkerBaselineGrade(req, res) {
  const { workerId, firmId, grade, month } = req.body;
  if (!workerId || !firmId || !grade) {
    throw badRequest('workerId, firmId, and grade are required.');
  }

  if (!['A', 'B', 'C', 'D'].includes(grade)) {
    throw badRequest('Invalid grade. Must be A, B, C, or D.');
  }

  const [worker, firm] = await Promise.all([
    Worker.findById(workerId).select('fullName workerCode designation').populate('designation', 'name').lean(),
    Firm.findById(firmId).select('name code').lean(),
  ]);

  if (!worker) throw notFoundError('Worker not found.');
  if (!firm) throw notFoundError('Firm not found.');

  const targetMonth = month || (() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    return prevDate.toISOString().slice(0, 7);
  })();

  // 1. Update or create WorkerSalary baselineGrade
  await WorkerSalary.findOneAndUpdate(
    { worker: workerId },
    {
      $set: {
        worker: workerId,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: firmId,
        designation: worker.designation?._id || null,
        baselineGrade: grade,
      },
    },
    { upsert: true, new: true }
  );

  // 2. Update or create MonthlyWorkerGrade for targetMonth
  await MonthlyWorkerGrade.findOneAndUpdate( 
    { worker: workerId, month: targetMonth },    
    {  
      $set: {
        worker: workerId,
        workerCodeSnapshot: worker.workerCode,    
        workerNameSnapshot: worker.fullName,
        firm: firmId,
        firmNameSnapshot: firm.name,
        designation: worker.designation?._id || null,
        designationNameSnapshot: worker.designation?.name || '',
        month: targetMonth,
        finalGrade: grade,
        overrideGrade: grade,
        remarks: 'Admin set baseline grade',
        overrideBy: req.user._id,
        overrideAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  res.json({
    success: true,
    workerId,
    grade,
    month: targetMonth,
    message: `Worker grade successfully set to Grade ${grade}`,
  });
}


