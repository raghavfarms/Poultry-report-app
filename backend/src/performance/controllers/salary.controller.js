import DailyEvaluation from '../models/DailyEvaluation.js';
import MonthlyWorkerGrade from '../models/MonthlyWorkerGrade.js';
import WorkerSalary from '../models/WorkerSalary.js';
import SalaryPayment from '../models/SalaryPayment.js';
import GradeSalaryConfig from '../models/GradeSalaryConfig.js';
import PerformanceQuestion from '../models/PerformanceQuestion.js';
import Worker from '../../attendance/models/Worker.js';
import AttendanceSession from '../../attendance/models/AttendanceSession.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';
import { standardizeCategoryName } from './master.controller.js';

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

function computeWorkerMonthlyStats({
  w,
  sessionsForWorker,
  workerEvals,
  gradeDoc,
  totalMaxPoints,
  minGradeAScore,
  minGradeBScore,
  minGradeCScore,
  month,
  daysInMonth,
  todayDate,
}) {
  // 1. Attendance Counts (100% Synchronized with Attendance Module)
  const effectiveJoining = w.dateOfJoining
    || (w.createdAt ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(w.createdAt)) : null);
  let presentDays = 0;
  let halfDays = 0;
  let absentDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const fullDateStr = `${month}-${dayStr}`;

    if (fullDateStr > todayDate) {
      continue;
    }

    if (effectiveJoining && fullDateStr < effectiveJoining) {
      continue;
    }

    if (sessionsForWorker.has(fullDateStr)) {
      const daySessions = sessionsForWorker.get(fullDateStr);
      let dayMinutes = 0;
      let isOpen = false;

      for (const sess of daySessions) {
        if (sess.status === 'PRESENT') {
          isOpen = true;
        }
        dayMinutes += (sess.workedMinutes || 0);
      }

      if (isOpen && fullDateStr === todayDate) {
        presentDays += 1;
      } else if (isOpen || dayMinutes >= 475) {
        presentDays += 1;
      } else if (dayMinutes >= 235) {
        halfDays += 1;
        presentDays += 0.5;
        absentDays += 0.5;
      } else {
        absentDays += 1;
      }
    } else {
      absentDays += 1;
    }
  }

  // 2. Evaluation Days & Numerical Average
  const evalsByDate = new Map();
  for (const ev of workerEvals) {
    if (!evalsByDate.has(ev.evaluationDate)) evalsByDate.set(ev.evaluationDate, []);
    evalsByDate.get(ev.evaluationDate).push(ev);
  }

  let dailyAveragesSum = 0;
  let effectiveEvaluationDays = 0;
  let hasWorkingRating = false;
  const isDriverOrNight = isDriverOrNightGuard(w.designation?.name);

  for (const [, dayList] of evalsByDate) {
    const allApprovedLeave = dayList.every((ev) => ev.isApprovedLeave || ev.dailyGrade === 'NOT_APPLICABLE');
    if (allApprovedLeave) {
      continue;
    }

    const activeEvals = dayList.filter((ev) => !ev.isApprovedLeave && ev.dailyGrade !== 'NOT_APPLICABLE');
    const evalsToScore = activeEvals.length > 0 ? activeEvals : dayList;

    if (evalsToScore.some((ev) => ev.attendanceStatusSnapshot !== 'ABSENT')) {
      hasWorkingRating = true;
    }

    const daySum = evalsToScore.reduce((acc, ev) => {
      let score = Number(ev.dailyScore || 0);
      if (isDriverOrNight && ev.attendanceStatusSnapshot !== 'ABSENT' && !ev.isApprovedLeave && score <= 5) {
        score = Math.min(9, score + 4);
      }
      return acc + score;
    }, 0);

    dailyAveragesSum += daySum / evalsToScore.length;
    effectiveEvaluationDays += 1;
  }

  // Until a worker has been present and rated at least once, keep their rating as '—'
  const evaluationDays = hasWorkingRating ? effectiveEvaluationDays : 0;
  let averageScore = 0;
  let totalEarnedPoints = 0;
  let totalPossiblePoints = 0;
  if (hasWorkingRating && effectiveEvaluationDays > 0) {
    averageScore = Math.round((dailyAveragesSum / effectiveEvaluationDays) * 10) / 10;
    totalEarnedPoints = Math.round(dailyAveragesSum * 10) / 10;
    totalPossiblePoints = effectiveEvaluationDays * totalMaxPoints;
  }

  let finalGrade = 'NO_DATA';
  if (gradeDoc?.overrideGrade) {
    finalGrade = gradeDoc.overrideGrade;
  } else if (hasWorkingRating && effectiveEvaluationDays > 0) {
    if (averageScore >= minGradeAScore) {
      if (absentDays <= 1) {
        finalGrade = 'A';
      } else {
        finalGrade = 'B';
      }
    } else if (averageScore >= minGradeBScore) {
      finalGrade = 'B';
    } else if (averageScore >= minGradeCScore) {
      finalGrade = 'C';
    } else {
      finalGrade = 'D';
    }
  }

  return {
    presentDays,
    halfDays,
    absentDays,
    evaluationDays,
    averageScore,
    totalEarnedPoints,
    totalPossiblePoints,
    finalGrade,
  };
}

// ==========================================
// HELPER: COMPUTE MONTHLY GRADES MAP FOR ANY MONTH (Used by Tab 1 Last Month Grade)
// ==========================================
export async function getComputedMonthlyGradesMap(firmId, month) {
  if (!firmId || !month || !/^\d{4}-\d{2}$/.test(month)) return new Map();

  const [config, workers, activeQuestions] = await Promise.all([
    GradeSalaryConfig.findOne({ $or: [{ firm: firmId }, { firm: null }], active: true })
      .sort({ firm: -1 })
      .lean() || {},
    Worker.find({ firm: firmId, active: true })
      .select('designation dateOfJoining createdAt')
      .populate('designation', 'name')
      .lean(),
    PerformanceQuestion.find({ active: true }).lean(),
  ]);

  const operationalQuestions = (activeQuestions || []).filter(
    (q) => q.displayOrder !== 4 && !q.questionText?.includes('छुट्टी')
  );
  const totalMaxPoints = operationalQuestions.reduce((acc, q) => acc + (q.weight || 1), 0) || 9;
  const percentA = config.gradeRules?.gradeA?.minPercentage || 85;
  const percentB = config.gradeRules?.gradeB?.minPercentage || 77;
  const percentC = (config.gradeRules?.gradeC?.minPercentage > 0) ? config.gradeRules.gradeC.minPercentage : 50;
  const minGradeAScore = Math.round(totalMaxPoints * (percentA / 100));
  const minGradeBScore = Math.round(totalMaxPoints * (percentB / 100));
  const minGradeCScore = Math.round(totalMaxPoints * (percentC / 100));

  const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [yearStr, monthStr] = month.split('-');
  const daysInMonth = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10), 0).getDate();

  const monthRegex = new RegExp(`^${month}`);
  const [sessions, evaluations, monthlyGrades] = await Promise.all([
    AttendanceSession.find({ firm: firmId, date: monthRegex }).select('worker date workedMinutes status').lean(),
    DailyEvaluation.find({ firm: firmId, evaluationDate: monthRegex }).lean(),
    MonthlyWorkerGrade.find({ firm: firmId, month }).lean(),
  ]);

  const gradeMap = new Map(monthlyGrades.map((g) => [String(g.worker), g]));
  const sessionsByWorker = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!sessionsByWorker.has(wId)) sessionsByWorker.set(wId, new Map());
    const dateMap = sessionsByWorker.get(wId);
    if (!dateMap.has(s.date)) dateMap.set(s.date, []);
    dateMap.get(s.date).push(s);
  }

  const evalsByWorker = new Map();
  for (const ev of evaluations) {
    const wId = String(ev.worker);
    if (!evalsByWorker.has(wId)) evalsByWorker.set(wId, []);
    evalsByWorker.get(wId).push(ev);
  }

  const resultMap = new Map();
  for (const w of workers) {
    const wId = String(w._id);
    const stats = computeWorkerMonthlyStats({
      w,
      sessionsForWorker: sessionsByWorker.get(wId) || new Map(),
      workerEvals: evalsByWorker.get(wId) || [],
      gradeDoc: gradeMap.get(wId),
      totalMaxPoints,
      minGradeAScore,
      minGradeBScore,
      minGradeCScore,
      month,
      daysInMonth,
      todayDate,
    });
    resultMap.set(wId, stats.finalGrade);
  }

  return resultMap;
}

// ==========================================
// 1. GET MONTHLY WORKERS & SALARY SUMMARY
// ==========================================
export async function getMonthlySalarySummary(req, res) {
  const { firmId, month, search, designationId, gradeFilter } = req.query;
  if (!firmId) throw badRequest('Firm ID is required.');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw badRequest('Month must be in YYYY-MM format.');

  const [firm, config, workers, activeQuestions] = await Promise.all([
    Firm.findById(firmId).select('name code').lean(),
    GradeSalaryConfig.findOne({ $or: [{ firm: firmId }, { firm: null }], active: true })
      .sort({ firm: -1 })
      .lean() || {},
    Worker.find({ firm: firmId, active: true })
      .select('fullName workerCode designation dateOfJoining createdAt')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),
    PerformanceQuestion.find({ active: true }).lean(),
  ]);

  if (!firm) throw notFoundError('Firm not found.');

  // Variable maximum points based on active operational questions (excluding Question 4 leave question) and admin-configured percentages
  const operationalQuestions = (activeQuestions || []).filter(
    (q) => q.displayOrder !== 4 && !q.questionText?.includes('छुट्टी')
  );
  const totalMaxPoints = operationalQuestions.reduce((acc, q) => acc + (q.weight || 1), 0) || 9;
  const percentA = config.gradeRules?.gradeA?.minPercentage || 85;
  const percentB = config.gradeRules?.gradeB?.minPercentage || 77;
  const percentC = (config.gradeRules?.gradeC?.minPercentage > 0) ? config.gradeRules.gradeC.minPercentage : 50;
  const minGradeAScore = Math.round(totalMaxPoints * (percentA / 100));
  const minGradeBScore = Math.round(totalMaxPoints * (percentB / 100));
  const minGradeCScore = Math.round(totalMaxPoints * (percentC / 100));

  // Fetch all attendance sessions in this month strictly read-only
  const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, m, 0).getDate();

  const monthRegex = new RegExp(`^${month}`);
  const [sessions, evaluations, monthlyGrades, salaries, payments] = await Promise.all([
    AttendanceSession.find({ firm: firmId, date: monthRegex }).select('worker date workedMinutes status').lean(),
    DailyEvaluation.find({ firm: firmId, evaluationDate: monthRegex }).lean(),
    MonthlyWorkerGrade.find({ firm: firmId, month }).lean(),
    WorkerSalary.find({ firm: firmId }).lean(),
    SalaryPayment.find({ firm: firmId, month }).lean(),
  ]);

  const gradeMap = new Map(monthlyGrades.map((g) => [String(g.worker), g]));

  // Group attendance sessions by worker and unique date
  const sessionsByWorker = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!sessionsByWorker.has(wId)) sessionsByWorker.set(wId, new Map());
    const dateMap = sessionsByWorker.get(wId);
    if (!dateMap.has(s.date)) dateMap.set(s.date, []);
    dateMap.get(s.date).push(s);
  }

  const evalsByWorker = new Map();
  for (const ev of evaluations) {
    const wId = String(ev.worker);
    if (!evalsByWorker.has(wId)) evalsByWorker.set(wId, []);
    evalsByWorker.get(wId).push(ev);
  }

  const salaryMap = new Map(salaries.map((s) => [String(s.worker), s]));
  const paymentMap = new Map(payments.map((p) => [String(p.worker), p]));

  // Calculate monthly stats per worker
  const rows = [];
  const minRequiredDays = config.minEvaluationDaysRequired || 15;

  for (const w of workers) {
    const wId = String(w._id);

    // Filter by search if provided
    if (search) {
      const term = search.toLowerCase();
      const match = w.fullName.toLowerCase().includes(term) || w.workerCode.toLowerCase().includes(term);
      if (!match) continue;
    }

    // Filter by designation if provided
    if (designationId && String(w.designation?._id) !== String(designationId)) {
      continue;
    }

    const gradeDoc = gradeMap.get(wId);
    const {
      presentDays,
      halfDays,
      absentDays,
      evaluationDays,
      averageScore,
      totalEarnedPoints,
      totalPossiblePoints,
      finalGrade,
    } = computeWorkerMonthlyStats({
      w,
      sessionsForWorker: sessionsByWorker.get(wId) || new Map(),
      workerEvals: evalsByWorker.get(wId) || [],
      gradeDoc,
      totalMaxPoints,
      minGradeAScore,
      minGradeBScore,
      minGradeCScore,
      month,
      daysInMonth,
      todayDate,
    });

    // Filter by grade if provided
    if (gradeFilter && gradeFilter !== 'ALL' && finalGrade !== gradeFilter) {
      continue;
    }

    // 3. Salary & Proposed Increments
    const existingSalaryDoc = salaryMap.get(wId);
    const currentSalary = existingSalaryDoc?.currentSalary || 0;

    // Direct salary mapped to Grade based on worker's standardized category (e.g. Supervisor, Night Guard, Female Worker)
    // Step 1: Determine worker's category (checks gender and designation name)
    let workerCatName = '';
    if (w.gender === 'FEMALE' || String(w.designation?.name || '').toLowerCase().includes('female')) {
      workerCatName = 'Female Worker';
    } else {
      workerCatName = standardizeCategoryName(w.designation?.name || '');
    }

    // Step 2: Look for category-specific rates in Tab 2
    const customCategorySalary = (config.categorySalaries || []).find(
      (cs) => cs.categoryName === workerCatName || cs.categoryKey === workerCatName.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    );

    // Fallback: check legacy designationSalaries by ID if present
    const workerDesigId = String(w.designation?._id || w.designation || '');
    const customDesigSalary = (config.designationSalaries || []).find(
      (ds) => String(ds.designation?._id || ds.designation) === workerDesigId
    );

    // Step 3: Combine with fallback to base farm defaults
    const salaries = {
      gradeA: customCategorySalary?.gradeA ?? customDesigSalary?.gradeA ?? config.gradeSalaries?.gradeA ?? 11500,
      gradeB: customCategorySalary?.gradeB ?? customDesigSalary?.gradeB ?? config.gradeSalaries?.gradeB ?? 10500,
      gradeC: customCategorySalary?.gradeC ?? customDesigSalary?.gradeC ?? config.gradeSalaries?.gradeC ?? 9500,
      gradeD: customCategorySalary?.gradeD ?? customDesigSalary?.gradeD ?? config.gradeSalaries?.gradeD ?? 0,
    };
    let proposedSalary = currentSalary;

    if (existingSalaryDoc?.activeProposal?.month === month && existingSalaryDoc.activeProposal.proposedSalary) {
      proposedSalary = existingSalaryDoc.activeProposal.proposedSalary;
    } else if (finalGrade === 'A') {
      proposedSalary = salaries.gradeA ?? 11500;
    } else if (finalGrade === 'B') {
      proposedSalary = salaries.gradeB ?? 10500;
    } else if (finalGrade === 'C') {
      proposedSalary = salaries.gradeC ?? 9500;
    } else if (finalGrade === 'D') {
      proposedSalary = salaries.gradeD ?? 0;
    } else {
      // NO_DATA: keep current salary or fallback to minimum grade C
      proposedSalary = currentSalary > 0 ? currentSalary : (salaries.gradeC ?? 9500);
    }

    const proposedIncrement = currentSalary > 0 ? proposedSalary - currentSalary : 0;
    const approvalStatus = existingSalaryDoc?.activeProposal?.month === month 
      ? existingSalaryDoc.activeProposal.status 
      : 'PENDING';

    // 4. Payment Status
    const paymentDoc = paymentMap.get(wId);

    rows.push({
      workerId: w._id,
      workerName: w.fullName,
      workerCode: w.workerCode,
      designationName: w.designation?.name || '—',
      presentDays,
      halfDays,
      absentDays,
      evaluationDays,
      averageScore,
      totalEarnedPoints,
      totalPossiblePoints,
      finalGrade,
      isGradeOverridden: Boolean(gradeDoc?.overrideGrade),
      gradeRemarks: gradeDoc?.remarks || '',
      currentSalary,
      proposedIncrement,
      proposedSalary,
      approvalStatus,
      paymentStatus: paymentDoc?.status || 'PENDING',
      paymentDate: paymentDoc?.paymentDate || null,
      paymentMethod: paymentDoc?.paymentMethod || 'BANK_TRANSFER',
      transactionReference: paymentDoc?.transactionReference || '',
    });
  }

  res.json({
    success: true,
    firm,
    month,
    totalMaxPoints,
    gradeThresholds: {
      percentA,
      percentB,
      percentC,
      minGradeAScore,
      minGradeBScore,
      minGradeCScore,
    },
    workers: rows,
  });
}

// ==========================================
// 2. APPROVE / REJECT SALARY REVISION
// ==========================================
export async function updateSalaryRevision(req, res) {
  const { workerId, month, action, approvedSalary, remarks } = req.body;
  if (!workerId || !month || !['APPROVE', 'REJECT'].includes(action)) {
    throw badRequest('workerId, month, and valid action (APPROVE/REJECT) are required.');
  }

  let salaryDoc = await WorkerSalary.findOne({ worker: workerId });
  const worker = await Worker.findById(workerId).select('fullName workerCode firm designation').lean();
  if (!worker) throw notFoundError('Worker not found.');

  if (!salaryDoc) {
    salaryDoc = new WorkerSalary({
      worker: workerId,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName,
      firm: worker.firm,
      designation: worker.designation,
      currentSalary: 0,
    });
  }

  const oldSalary = salaryDoc.currentSalary;
  const newSalary = action === 'APPROVE' ? Number(approvedSalary ?? salaryDoc.activeProposal?.proposedSalary ?? oldSalary) : oldSalary;

  // Archive to revision history
  salaryDoc.revisionHistory.push({
    month,
    grade: salaryDoc.activeProposal?.grade || null,
    oldSalary,
    proposedSalary: salaryDoc.activeProposal?.proposedSalary || newSalary,
    approvedSalary: newSalary,
    status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
    reviewedBy: req.user._id,
    reviewedByName: req.user.name,
    reviewedAt: new Date(),
    remarks: remarks || '',
  });

  if (action === 'APPROVE') {
    salaryDoc.currentSalary = newSalary;
    salaryDoc.activeProposal = {
      month,
      grade: salaryDoc.activeProposal?.grade || null,
      proposedIncrement: newSalary - oldSalary,
      proposedSalary: newSalary,
      status: 'APPROVED',
      generatedAt: new Date(),
    };
  } else {
    if (salaryDoc.activeProposal) {
      salaryDoc.activeProposal.status = 'REJECTED';
    }
  }

  await salaryDoc.save();

  res.json({ success: true, salary: salaryDoc });
}

// ==========================================
// 3. RECORD SALARY PAYMENT
// ==========================================
export async function recordSalaryPayment(req, res) {
  const { workerId, month, salaryAmount, paymentMethod, transactionReference, remarks, status } = req.body;
  if (!workerId || !month || salaryAmount === undefined) {
    throw badRequest('workerId, month, and salaryAmount are required.');
  }

  const worker = await Worker.findById(workerId).select('fullName workerCode firm').lean();
  if (!worker) throw notFoundError('Worker not found.');

  const payment = await SalaryPayment.findOneAndUpdate(
    { worker: workerId, month },
    {
      worker: workerId,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName, 
      firm: worker.firm,
      month,
      salaryAmount: Number(salaryAmount),
      status: status || 'PAID',
      paymentDate: new Date(),
      paymentMethod: paymentMethod || 'BANK_TRANSFER',
      transactionReference: transactionReference || '',
      remarks: remarks || '',
      recordedBy: req.user._id,
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.json({ success: true, payment });
}

// ==========================================
// 4. OVERRIDE / EDIT WORKER GRADE
// ==========================================
export async function updateWorkerGrade(req, res) {
  const { workerId, month, grade, remarks } = req.body;
  if (!workerId || !month) throw badRequest('workerId and month are required.');
  if (!['A', 'B', 'C', 'D'].includes(grade)) throw badRequest('Grade must be A, B, C, or D.');

  const worker = await Worker.findById(workerId).select('fullName workerCode firm designation').lean();
  if (!worker) throw notFoundError('Worker not found.');

  const firm = await Firm.findById(worker.firm).select('name').lean();

  const gradeDoc = await MonthlyWorkerGrade.findOneAndUpdate(
    { worker: workerId, month },
    {
      worker: workerId,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName,
      firm: worker.firm,
      firmNameSnapshot: firm?.name || '',
      designation: worker.designation,
      month,
      finalGrade: grade,
      overrideGrade: grade,
      remarks: remarks || '',
      overrideBy: req.user._id,
      overrideAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    success: true,
    message: `Grade updated to Grade ${grade} for ${worker.fullName}`,
    grade: gradeDoc,
  });
}  