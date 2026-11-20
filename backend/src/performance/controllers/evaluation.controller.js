import mongoose from 'mongoose';
import DailyEvaluation from '../models/DailyEvaluation.js';
import PerformanceQuestion from '../models/PerformanceQuestion.js';
import GradeSalaryConfig from '../models/GradeSalaryConfig.js';
import Worker from '../../attendance/models/Worker.js';
import AttendanceSession from '../../attendance/models/AttendanceSession.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// Helper: Calculate daily score and grade based on variable points scale
function calculateDailyPerformance(answers, config, attendanceStatus) {
  let hasCriticalViolation = false;
  let totalPoints = 0;
  let maxPossiblePoints = 0;

  for (const ans of answers) {
    const weight = Number(ans.weightSnapshot || 1);
    maxPossiblePoints += weight;

    if (ans.isCriticalViolationSnapshot && ans.answer === 'NO') {
      hasCriticalViolation = true;
    }

    if (ans.answer === 'YES') {
      totalPoints += weight;
    }
  }

  // Daily score directly in points earned
  let dailyScore = totalPoints;

  // Dynamically calculate grade thresholds based on total points of active questions and admin-configured percentages:
  // Grade A: >= x% of total points (default 80%)
  // Grade B: >= y% of total points (default 50%)
  // Grade C: < y% of total points or Critical Violation
  const effectiveMax = maxPossiblePoints || 10;
  const percentA = config?.gradeRules?.gradeA?.minPercentage ?? 80;
  const percentB = config?.gradeRules?.gradeB?.minPercentage ?? 50;
  const minGradeA = Math.round(effectiveMax * (percentA / 100));
  const minGradeB = Math.round(effectiveMax * (percentB / 100));

  let grade = 'C';
  if (hasCriticalViolation) {
    grade = config.criticalViolationGrade || 'C';
  } else if (dailyScore >= minGradeA) {
    grade = 'A';
  } else if (dailyScore >= minGradeB) {
    grade = 'B';
  } else {
    grade = 'C';
  }

  return { dailyScore, dailyGrade: grade, hasCriticalViolation, maxPossiblePoints };
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

  // Auto-seed/sync the 8 questions (6 normal @ 1pt + 2 critical @ 2pts = 10 pts)
  const defaultQuestions = [
    { questionText: 'क्या कर्मचारी आज समय पर काम पर आया?', displayOrder: 1, weight: 1, isCriticalViolation: false },
    { questionText: 'क्या कर्मचारी शराब पीकर काम पर तो नहीं आया?', displayOrder: 2, weight: 2, isCriticalViolation: true },
    { questionText: 'क्या कर्मचारी ने आज किसी से लड़ाई-झगड़ा तो नहीं किया?', displayOrder: 3, weight: 2, isCriticalViolation: true },
    { questionText: 'क्या कर्मचारी ने आज उसे सौंपे गए सारे काम पूरे किए?', displayOrder: 4, weight: 1, isCriticalViolation: false },
    { questionText: 'क्या कर्मचारी ने काम के दौरान लापरवाही नहीं की?', displayOrder: 5, weight: 1, isCriticalViolation: false },
    { questionText: 'क्या कर्मचारी ने अपने सीनियर के निर्देशों का पालन किया?', displayOrder: 6, weight: 1, isCriticalViolation: false },
    { questionText: 'क्या कर्मचारी ने फार्म व शेड में साफ-सफाई रखी?', displayOrder: 7, weight: 1, isCriticalViolation: false },
    { questionText: 'क्या कर्मचारी ने बायो-सिक्योरिटी व सुरक्षा नियमों का पालन किया?', displayOrder: 8, weight: 1, isCriticalViolation: false },
  ];

  const questionCount = await PerformanceQuestion.countDocuments();
  if (questionCount < 8) {
    for (const q of defaultQuestions) {
      await PerformanceQuestion.findOneAndUpdate(
        { displayOrder: q.displayOrder },
        { ...q, createdBy: req.user._id, firmApplicability: 'ALL', appliesToHalfDay: true, active: true },
        { upsert: true }
      );
    }
  }

  // 1. Parallel fetch: active questions, active config, workers, attendance sessions, existing evaluations
  const [questions, config, workers, sessions, existingEvaluations] = await Promise.all([
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
      .select('worker workedMinutes status dutyIn dutyOut')
      .lean(),
    DailyEvaluation.find({ firm: firmId, evaluationDate: date }).lean(),
  ]);

  // Map sessions by workerId to classify attendance status
  const sessionMap = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!sessionMap.has(wId)) sessionMap.set(wId, []);
    sessionMap.get(wId).push(s);
  }

  // Map existing evaluations by workerId
  const evaluationMap = new Map();
  for (const ev of existingEvaluations) {
    evaluationMap.set(String(ev.worker), ev);
  }

  // Find workers who do NOT have an evaluation for 'date',
  // and fetch their latest evaluation strictly before 'date' to carry forward their answers as the default template
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

    if (workerSessions.length > 0) {
      for (const sess of workerSessions) {
        if (sess.status === 'PRESENT') hasOpenSession = true;
        totalWorkedMinutes += sess.workedMinutes || 0;
      }

      if (hasOpenSession || totalWorkedMinutes >= 475) {
        status = 'PRESENT';
      } else if (totalWorkedMinutes >= 235) {
        status = 'HALF_DAY';
      } else {
        status = 'ABSENT';
      }
    }

    const workerPayload = {
      workerId: w._id,
      workerCode: w.workerCode,
      workerName: w.fullName,
      designationName: w.designation?.name || '—',
      attendanceStatus: status,
      totalWorkedMinutes,
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

  res.json({
    success: true,
    date,
    firm,
    summary: {
      total: workers.length,
      present: presentWorkers.length,
      halfDay: halfDayWorkers.length,
      absent: absentWorkers.length,
    },
    questions,
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

  const [firm, config, activeQuestions] = await Promise.all([
    Firm.findById(firmId).select('name code').lean(),
    GradeSalaryConfig.findOne({ $or: [{ firm: firmId }, { firm: null }], active: true })
      .sort({ firm: -1 })
      .lean() || {},
    PerformanceQuestion.find({ active: true }).lean(),
  ]);

  if (!firm) throw notFoundError('Firm not found.');
  const questionMap = new Map(activeQuestions.map((q) => [String(q._id), q]));

  const results = [];

  for (const item of evaluations) {
    const { workerId, workerCode, workerName, attendanceStatus, answers } = item;

    // Rule: Absent workers MUST NOT be evaluated
    if (attendanceStatus === 'ABSENT') {
      continue;
    }

    // Build question answer snapshots
    const answerSnapshots = [];
    for (const ans of answers) {
      const q = questionMap.get(String(ans.questionId));
      if (q) {
        answerSnapshots.push({
          questionId: q._id,
          questionTextSnapshot: q.questionText,
          answer: ans.answer === 'NO' ? 'NO' : 'YES', // Default is YES
          weightSnapshot: q.weight || 1,
          isCriticalViolationSnapshot: Boolean(q.isCriticalViolation),
        });
      }
    }

    const { dailyScore, dailyGrade, hasCriticalViolation } = calculateDailyPerformance(
      answerSnapshots,
      config,
      attendanceStatus
    );

    const doc = await DailyEvaluation.findOneAndUpdate(
      { worker: workerId, evaluationDate: date },
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
        submittedBy: req.user._id,
        submittedByNameSnapshot: req.user.name,
      },
      { upsert: true, new: true, runValidators: true }
    );

    results.push(doc);
  }

  res.json({ success: true, count: results.length, evaluations: results });
}