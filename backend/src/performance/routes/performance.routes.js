import express from 'express';
import { protect, adminOnly, requireModuleAccess } from '../../middleware/auth.js';
import {
  getQuestions,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  translateQuestionText,
  getGradeSalaryConfig,
  updateGradeSalaryConfig,
} from '../controllers/master.controller.js';
import {
  getDailyEvaluationMatrix,
  submitDailyEvaluation,
  setWorkerBaselineGrade,
} from '../controllers/evaluation.controller.js';
import { getRatingComparison } from '../controllers/comparison.controller.js';
import {
  getMonthlySalarySummary,
  updateSalaryRevision,
  recordSalaryPayment,
  updateWorkerGrade,
} from '../controllers/salary.controller.js';

const router = express.Router();

// Middleware: Verify performance Tab 1 (Daily Evaluation) access - blocked for office view-only accounts
function dailyAccessOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || req.user?.role !== 'office') {
    return next();
  }
  return res.status(403).json({ message: 'Daily Evaluation access is not enabled for this account.' });
}

// Middleware: Verify performance Tab 2 (Rating Comparison) view permission
function comparisonAccessOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || req.user?.permissions?.performance_comparison === true) {
    return next();
  }
  return res.status(403).json({ message: 'Performance Rating Comparison access required.' });
}

// Middleware: Verify performance Tab 3 (Workers & Salary) view permission
function salaryViewAccessOnly(req, res, next) {
  if (
    ['admin', 'developer'].includes(req.user?.role) ||
    req.user?.permissions?.performance_salary === true ||
    req.user?.permissions?.performance_salary_view === true
  ) {
    return next();
  }
  return res.status(403).json({ message: 'Performance Salary view access required.' });
}

// Middleware: Verify performance Tab 3 edit permission (strictly excludes view-only accounts)
function salaryAccessOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || req.user?.permissions?.performance_salary === true) {
    return next();
  }
  return res.status(403).json({ message: 'Performance Salary edit access required.' });
}

// Middleware: Verify performance master configuration permission
function masterAccessOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || req.user?.permissions?.performance_master === true) {
    return next();
  }
  return res.status(403).json({ message: 'Performance Master configuration access required.' });
}

// All performance endpoints require valid login and performance module access
router.use(protect);
router.use(requireModuleAccess('performance'));

// ==========================================
// 1. MASTER MANAGEMENT (Admin / Developer or performance_master)
// ==========================================
// Questions Master
router.get('/questions', getQuestions);
router.post('/questions', masterAccessOnly, createQuestion);
router.post('/questions/translate', masterAccessOnly, translateQuestionText);
router.put('/questions/:id', masterAccessOnly, updateQuestion);
router.delete('/questions/:id', masterAccessOnly, deleteQuestion);

// Grade & Salary Master (Strictly Admin / Developer only)
router.get('/config', adminOnly, getGradeSalaryConfig);
router.put('/config', adminOnly, updateGradeSalaryConfig);

// ==========================================
// 2. TAB 1: DAILY EVALUATION (Authorized accounts, excluding office view-only)
// ==========================================
// Get Excel-style matrix data with read-only attendance status
router.get('/evaluations/daily', dailyAccessOnly, getDailyEvaluationMatrix);
// Submit evaluation snapshots & auto-calculate daily grades
router.post('/evaluations/daily', dailyAccessOnly, submitDailyEvaluation);
// Admin sets worker baseline/last month grade (First-time setup or override)
router.post('/worker-grade/baseline', adminOnly, setWorkerBaselineGrade);

// ==========================================
// 3. TAB 2: RATING COMPARISON & BIAS AUDIT (Admin / Developer or performance_comparison)
// ==========================================
router.get('/evaluations/comparison', comparisonAccessOnly, getRatingComparison);

// ==========================================
// 4. TAB 3: WORKERS & SALARY (View: performance_salary_view; Edit: Admin or performance_salary)
// ==========================================
// Direct table of all workers with monthly grades & salary increments (Read-only allowed)
router.get('/salary/summary', salaryViewAccessOnly, getMonthlySalarySummary);
// Override / Edit worker grade
router.post('/grade/edit', salaryAccessOnly, updateWorkerGrade);
// Approve or Reject proposed salary increment
router.post('/salary/revision', salaryAccessOnly, updateSalaryRevision);
// Record monthly salary payment (around 22nd)
router.post('/salary/payment', salaryAccessOnly, recordSalaryPayment);

export default router;
