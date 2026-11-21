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
      .select('fullName workerCode designation')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),
    PerformanceQuestion.find({ active: true }).lean(),
  ]);

  if (!firm) throw notFoundError('Firm not found.');

  // Variable maximum points based on active questions and admin-configured percentages
  const totalMaxPoints = (activeQuestions || []).reduce((acc, q) => acc + (q.weight || 1), 0) || 10;
  const percentA = config.gradeRules?.gradeA?.minPercentage || 85;
  const percentB = config.gradeRules?.gradeB?.minPercentage || 77;
  const percentC = (config.gradeRules?.gradeC?.minPercentage > 0) ? config.gradeRules.gradeC.minPercentage : 50;
  const minGradeAScore = Math.round(totalMaxPoints * (percentA / 100));
  const minGradeBScore = Math.round(totalMaxPoints * (percentB / 100));
  const minGradeCScore = Math.round(totalMaxPoints * (percentC / 100));

  // Fetch all attendance sessions in this month strictly read-only
  const monthRegex = new RegExp(`^${month}`);
  const [sessions, evaluations, monthlyGrades, salaries, payments] = await Promise.all([
    AttendanceSession.find({ firm: firmId, date: monthRegex }).select('worker date workedMinutes status').lean(),
    DailyEvaluation.find({ firm: firmId, evaluationDate: monthRegex }).lean(),
    MonthlyWorkerGrade.find({ firm: firmId, month }).lean(),
    WorkerSalary.find({ firm: firmId }).lean(),
    SalaryPayment.find({ firm: firmId, month }).lean(),
  ]);

  const gradeMap = new Map(monthlyGrades.map((g) => [String(g.worker), g]));

  // Group data by worker
  const sessionsByWorker = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!sessionsByWorker.has(wId)) sessionsByWorker.set(wId, new Map());
    // group by unique date
    sessionsByWorker.get(wId).set(s.date, (sessionsByWorker.get(wId).get(s.date) || 0) + (s.workedMinutes || 0));
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

    // 1. Attendance Counts
    const workerDateMinutes = sessionsByWorker.get(wId) || new Map();
    let presentDays = 0;
    let halfDays = 0;
    let absentDays = 0;

    for (const [, mins] of workerDateMinutes) {
      if (mins >= 475) presentDays++;
      else if (mins >= 235) halfDays++;
      else absentDays++;
    }

    // 2. Evaluation Days & Numerical Average (10-point scale)
    // When multiple evaluators (Supervisor + Incharge) evaluate on the same date, average their scores for that date
    const workerEvals = evalsByWorker.get(wId) || [];
    const evalsByDate = new Map();
    for (const ev of workerEvals) {
      if (!evalsByDate.has(ev.evaluationDate)) evalsByDate.set(ev.evaluationDate, []);
      evalsByDate.get(ev.evaluationDate).push(ev);
    }

    const evaluationDays = evalsByDate.size;
    let averageScore = 0;
    const gradeDoc = gradeMap.get(wId);
    let finalGrade = 'NO_DATA';

    if (gradeDoc?.overrideGrade) {
      finalGrade = gradeDoc.overrideGrade;
      if (evaluationDays > 0) {
        let dailyAveragesSum = 0;
        for (const [, dayList] of evalsByDate) {
          const daySum = dayList.reduce((acc, ev) => acc + (ev.dailyScore || 0), 0);
          dailyAveragesSum += daySum / dayList.length;
        }
        averageScore = Math.round((dailyAveragesSum / evaluationDays) * 10) / 10;
      }
    } else if (evaluationDays > 0) {
      // Calculate running progressive average across unique dates
      let dailyAveragesSum = 0;
      for (const [, dayList] of evalsByDate) {
        const daySum = dayList.reduce((acc, ev) => acc + (ev.dailyScore || 0), 0);
        dailyAveragesSum += daySum / dayList.length;
      }
      averageScore = Math.round((dailyAveragesSum / evaluationDays) * 10) / 10;

      // Variable threshold: Grade A >= minGradeAScore, Grade B >= minGradeBScore, Grade C >= minGradeCScore, else Grade D (BlackList)
      if (averageScore >= minGradeAScore) finalGrade = 'A';
      else if (averageScore >= minGradeBScore) finalGrade = 'B';
      else if (averageScore >= minGradeCScore) finalGrade = 'C';
      else finalGrade = 'D';
    }

    // Filter by grade if provided
    if (gradeFilter && gradeFilter !== 'ALL' && finalGrade !== gradeFilter) {
      continue;
    }

    // 3. Salary & Proposed Increments
    const existingSalaryDoc = salaryMap.get(wId);
    const currentSalary = existingSalaryDoc?.currentSalary || 0;

    // Direct salary mapped to Grade: A = 11.5k, B = 10.5k, C = 9.5k, D = 0
    // Or if manually edited/saved for this month, use the saved value
    const salaries = config.gradeSalaries || { gradeA: 11500, gradeB: 10500, gradeC: 9500, gradeD: 0 };
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