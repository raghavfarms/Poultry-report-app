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
} from '../controllers/evaluation.controller.js';
import { getRatingComparison } from '../controllers/comparison.controller.js';
import {
  getMonthlySalarySummary,
  updateSalaryRevision,
  recordSalaryPayment,
  updateWorkerGrade,
} from '../controllers/salary.controller.js';

const router = express.Router();

// Middleware: Verify performance salary management permission
function salaryAccessOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || req.user?.permissions?.performance_salary === true) {
    return next();
  }
  return res.status(403).json({ message: 'Performance Salary access required.' });
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

// Grade & Salary Master
router.get('/config', getGradeSalaryConfig);
router.put('/config', masterAccessOnly, updateGradeSalaryConfig);

// ==========================================
// 2. TAB 1: DAILY EVALUATION (All authorized accounts)
// ==========================================
// Get Excel-style matrix data with read-only attendance status
router.get('/evaluations/daily', getDailyEvaluationMatrix);
// Submit evaluation snapshots & auto-calculate daily grades
router.post('/evaluations/daily', submitDailyEvaluation);

// ==========================================
// 3. TAB 2: RATING COMPARISON & BIAS AUDIT (Strictly Admin / Developer Only)
// ==========================================
router.get('/evaluations/comparison', adminOnly, getRatingComparison);

// ==========================================
// 4. TAB 3: WORKERS & SALARY (Admin Only or performance_salary)
// ==========================================
// Direct table of all workers with monthly grades & salary increments
router.get('/salary/summary', salaryAccessOnly, getMonthlySalarySummary);
// Override / Edit worker grade
router.post('/grade/edit', salaryAccessOnly, updateWorkerGrade);
// Approve or Reject proposed salary increment
router.post('/salary/revision', salaryAccessOnly, updateSalaryRevision);
// Record monthly salary payment (around 22nd)
router.post('/salary/payment', salaryAccessOnly, recordSalaryPayment);

export default router;
