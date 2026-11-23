import DailyEvaluation from '../models/DailyEvaluation.js';
import PerformanceQuestion from '../models/PerformanceQuestion.js';
import GradeSalaryConfig from '../models/GradeSalaryConfig.js';
import Worker from '../../attendance/models/Worker.js';
import AttendanceSession from '../../attendance/models/AttendanceSession.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// ==========================================
// GET RATING COMPARISON & BIAS AUDIT
// ==========================================
export async function getRatingComparison(req, res) {
  const { firmId, date, month: queryMonth } = req.query;
  if (!firmId) throw badRequest('Firm ID is required.');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Valid date (YYYY-MM-DD) is required.');

  const month = queryMonth || date.slice(0, 7);

  const [firm, config, activeQuestions, workers, sessions, dateEvaluations, monthEvaluations] = await Promise.all([
    Firm.findById(firmId).select('name code').lean(),
    GradeSalaryConfig.findOne({ $or: [{ firm: firmId }, { firm: null }], active: true })
      .sort({ firm: -1 })
      .lean() || {},
    PerformanceQuestion.find({ active: true }).sort({ displayOrder: 1, createdAt: 1 }).lean(),
    Worker.find({ firm: firmId, active: true })
      .select('fullName workerCode designation')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),
    // Strictly READ-ONLY attendance sessions query
    AttendanceSession.find({ firm: firmId, date })
      .select('worker workedMinutes status')
      .lean(),
    DailyEvaluation.find({ firm: firmId, evaluationDate: date }).lean(),
    DailyEvaluation.find({ firm: firmId, evaluationDate: new RegExp(`^${month}`) }).lean(),
  ]);

  if (!firm) throw notFoundError('Firm not found.');

  const totalMaxPoints = activeQuestions.reduce((acc, q) => acc + (q.weight || 1), 0) || 10;

  // Map attendance sessions by workerId
  const sessionMap = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!sessionMap.has(wId)) sessionMap.set(wId, []);
    sessionMap.get(wId).push(s);
  }

  // 1. Compute Evaluator Bias & Distribution Analytics for the Month
  const evaluatorMonthMap = new Map();
  for (const ev of monthEvaluations) {
    const evalId = String(ev.submittedBy);
    if (!evaluatorMonthMap.has(evalId)) {
      evaluatorMonthMap.set(evalId, {
        evaluatorId: ev.submittedBy,
        name: ev.submittedByNameSnapshot || 'Unknown',
        role: ev.submittedByRoleSnapshot || 'Evaluator',
        totalEvaluations: 0,
        scoreSum: 0,
        gradeCounts: { A: 0, B: 0, C: 0, D: 0 },
        criticalViolationCount: 0,
      });
    }

    const stat = evaluatorMonthMap.get(evalId);
    stat.totalEvaluations++;
    stat.scoreSum += ev.dailyScore || 0;
    if (ev.dailyGrade && stat.gradeCounts[ev.dailyGrade] !== undefined) {
      stat.gradeCounts[ev.dailyGrade]++;
    }
    if (ev.hasCriticalViolation) {
      stat.criticalViolationCount++;
    }  
  }

  const evaluatorStats = Array.from(evaluatorMonthMap.values()).map((s) => {
    const avg = s.totalEvaluations > 0 ? Math.round((s.scoreSum / s.totalEvaluations) * 10) / 10 : 0;
    let biasAssessment = 'Balanced';
    let biasBadgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';

    if (avg >= 9.0) {
      biasAssessment = 'Very Lenient / High Favoritism Risk';
      biasBadgeColor = 'text-amber-800 bg-amber-50 border-amber-200';
    } else if (avg <= 5.5) {
      biasAssessment = 'Very Strict / Critical';
      biasBadgeColor = 'text-rose-800 bg-rose-50 border-rose-200';
    }

    return {
      evaluatorId: s.evaluatorId,
      name: s.name,
      role: s.role,
      totalEvaluations: s.totalEvaluations,
      averageScore: avg,
      gradeCounts: s.gradeCounts,
      criticalViolationCount: s.criticalViolationCount,
      biasAssessment,
      biasBadgeColor,
    };
  });

  // 2. Group Date Evaluations by Worker for Side-by-Side Comparison
  const evalsByWorker = new Map();
  for (const ev of dateEvaluations) {
    const wId = String(ev.worker);
    if (!evalsByWorker.has(wId)) evalsByWorker.set(wId, []);
    evalsByWorker.get(wId).push(ev);
  }

  const comparisonRows = [];

  for (const w of workers) {
    const wId = String(w._id);
    const workerEvals = evalsByWorker.get(wId) || [];

    const evaluatorSubmissions = workerEvals.map((ev) => ({
      evaluationId: ev._id,
      evaluatorId: ev.submittedBy,
      evaluatorName: ev.submittedByNameSnapshot || 'Evaluator',
      evaluatorRole: ev.submittedByRoleSnapshot || 'Supervisor',
      dailyScore: ev.dailyScore ?? 0,
      dailyGrade: ev.dailyGrade || '—',
      hasCriticalViolation: Boolean(ev.hasCriticalViolation),
      answers: (ev.answers || []).map((a) => ({
        questionId: String(a.questionId),
        questionText: a.questionTextSnapshot,
        answer: a.answer,
        isCriticalViolation: Boolean(a.isCriticalViolationSnapshot),
      })),
      submittedAt: ev.updatedAt || ev.createdAt,
    }));

    const evaluatorCount = evaluatorSubmissions.length;
    let scoreDifference = 0;
    const discrepancies = [];

    if (evaluatorCount >= 2) {
      const scores = evaluatorSubmissions.map((s) => s.dailyScore);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      scoreDifference = maxScore - minScore;

      // Check question by question for conflicting YES vs NO
      for (const q of activeQuestions) {
        const qId = String(q._id);
        const answersForQ = evaluatorSubmissions.map((s) => {
          const matched = s.answers.find((ans) => String(ans.questionId) === qId);
          return {
            evaluatorName: s.evaluatorName,
            evaluatorRole: s.evaluatorRole,
            answer: matched?.answer || 'YES',            
          };
        });

        const hasConflict = answersForQ.some((a) => a.answer !== answersForQ[0].answer);
        if (hasConflict) {
          discrepancies.push({
            questionId: qId,
            questionText: q.questionText,
            isCriticalViolation: Boolean(q.isCriticalViolation),
            answers: answersForQ,
          });
        }
      }
    }

    const hasDiscrepancy = discrepancies.length > 0 || scoreDifference >= 2;

    // Determine accurate attendance status from sessions (matching Tab 1 exact logic)
    const workerSessions = sessionMap.get(wId) || [];
    let attendanceStatus = 'ABSENT';

    if (workerSessions.length > 0) {
      let totalMins = 0;
      let hasOpenSession = false;
      for (const s of workerSessions) {
        if (s.status === 'PRESENT') hasOpenSession = true;
        totalMins += s.workedMinutes || 0;
      }

      if (hasOpenSession || totalMins >= 475) {
        attendanceStatus = 'PRESENT';
      } else if (totalMins >= 235) {
        attendanceStatus = 'HALF_DAY';
      } else {
        attendanceStatus = 'ABSENT';
      }
    } else if (workerEvals[0]?.attendanceStatusSnapshot) {
      attendanceStatus = workerEvals[0].attendanceStatusSnapshot;
    }

    comparisonRows.push({
      workerId: w._id,
      workerCode: w.workerCode,
      workerName: w.fullName,
      designationName: w.designation?.name || 'Worker',
      attendanceStatus,
      evaluatorCount, 
      evaluations: evaluatorSubmissions,
      scoreDifference,
      hasDiscrepancy,
      discrepancies,
    });
  }

  // Find latest date in this month with evaluations
  let latestEvaluationDate = null;
  if (monthEvaluations.length > 0) {
    const dates = monthEvaluations.map((e) => e.evaluationDate).filter(Boolean).sort();
    latestEvaluationDate = dates[dates.length - 1];
  }

  res.json({
    success: true,
    firm,
    date,
    month,
    latestEvaluationDate,
    totalMaxPoints,
    questions: activeQuestions.map((q) => ({
      ...q,
      isLeaveQuestion: q.displayOrder === 4 || q.questionText?.includes('छुट्टी'),
    })),
    evaluatorStats,
    workers: comparisonRows,
  });
}
// aync funtion Handler (){}
