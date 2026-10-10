import express from 'express';
import {
  createReceipt,
  acceptReceipt,
  getReceipts,
  getBatchStock,
} from '../controllers/receipt.controller.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Require JWT authentication for all receipt routes
router.use(protect);

// 1. GET live batch-wise inventory (Placed BEFORE :id to avoid route collision)
router.get('/batches/stock', getBatchStock);

// 2. GET all receipts / POST create a new receipt (GRN)
router.route('/')
  .get(getReceipts)
  .post(createReceipt);

// 3. PATCH Storekeeper acceptance (Creates available stock & updates PO!)
router.patch('/:id/accept', acceptReceipt);

export default router;