import express from 'express';
import { protect, adminOnly } from '../../middleware/auth.js';
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
import {
  getMonthlySalarySummary,
  updateSalaryRevision,
  recordSalaryPayment,
} from '../controllers/salary.controller.js';

const router = express.Router();

// All performance endpoints require valid login
router.use(protect);

// ==========================================
// 1. MASTER MANAGEMENT (Admin / Developer only)
// ==========================================
// Questions Master
router.get('/questions', getQuestions);
router.post('/questions', adminOnly, createQuestion);
router.post('/questions/translate', adminOnly, translateQuestionText);
router.put('/questions/:id', adminOnly, updateQuestion);
router.delete('/questions/:id', adminOnly, deleteQuestion);

// Grade & Salary Master
router.get('/config', getGradeSalaryConfig);
router.put('/config', adminOnly, updateGradeSalaryConfig);

// ==========================================
// 2. TAB 1: DAILY EVALUATION (In-charge & Admin)
// ==========================================
// Get Excel-style matrix data with read-only attendance status
router.get('/evaluations/daily', getDailyEvaluationMatrix);
// Submit evaluation snapshots & auto-calculate daily grades
router.post('/evaluations/daily', submitDailyEvaluation);

// ==========================================
// 3. TAB 2: WORKERS & SALARY (Admin Only)
// ==========================================
// Direct table of all workers with monthly grades & salary increments
router.get('/salary/summary', adminOnly, getMonthlySalarySummary);
// Approve or Reject proposed salary increment
router.post('/salary/revision', adminOnly, updateSalaryRevision);
// Record monthly salary payment (around 22nd)
router.post('/salary/payment', adminOnly, recordSalaryPayment);

export default router;
