import express from 'express';
import { protect } from '../../middleware/auth.js';
import {
  createReturnInward,
  createStockAdjustment,
  createDisposal,
  getAdjustments,
  getAdjustmentById,
} from '../controllers/adjustment.controller.js';

const router = express.Router();

// Require JWT authentication for all adjustment routes
router.use(protect);

// Specific Action Endpoints (placed before /:id)
router.post('/return', createReturnInward);
router.post('/stock-audit', createStockAdjustment);
router.post('/disposal', createDisposal);

// General Query Endpoints
router.get('/', getAdjustments);
router.get('/:id', getAdjustmentById);

export default router;
