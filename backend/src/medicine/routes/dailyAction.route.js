import express from 'express';
import {
  fastInward,
  fastOutward,
  getTodayActivity,
} from '../controllers/dailyAction.controller.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Require JWT authentication
router.use(protect);

// 1. POST fast inward (Medicine Arrived)
router.post('/inward', fastInward);

// 2. POST fast outward (Give to Birds / Shed Dose with FEFO)
router.post('/outward', fastOutward);

// 3. GET today's activity stream
router.get('/today', getTodayActivity);

export default router;
