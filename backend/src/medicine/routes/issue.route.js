import express from 'express';
import { protect, adminOnly } from '../../middleware/auth.js';
import {
  getFefoRecommendations,
  createIssue,
  getIssues,
  getIssueById,
  deleteIssue,
} from '../controllers/issue.controller.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// 1. FEFO Recommendation Engine (MUST be placed before /:id)
router.get('/fefo-recommendations', getFefoRecommendations);

// 2. Issue CRUD
router.get('/', getIssues);
router.post('/', createIssue);
router.get('/:id', getIssueById);
router.delete('/:id', adminOnly, deleteIssue);

export default router;
