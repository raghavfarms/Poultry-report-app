import express from 'express';
import {
  createTransfer,
  getTransfers,
  getPendingTransfers,
  acceptTransfer,
  rejectTransfer,
  cancelTransfer,
  getAvailableStockForTransfer,
} from '../controllers/transfer.controller.js';
import { protect, adminOnly } from '../../middleware/auth.js';

const router = express.Router();

// All transfer endpoints require authentication & Admin / Developer privileges
router.use(protect);
router.use(adminOnly);

// 1. POST /api/medicine/transfers (Initiate transfer)
router.post('/', createTransfer);

// 2. GET /api/medicine/transfers (Audit log with filters)
router.get('/', getTransfers);

// 3. GET /api/medicine/transfers/available-stock (Live available batches for a farm)
router.get('/available-stock', getAvailableStockForTransfer);

// 4. GET /api/medicine/transfers/pending (Pending badge / list)
router.get('/pending', getPendingTransfers);

// 4. PATCH /api/medicine/transfers/:id/accept
router.patch('/:id/accept', acceptTransfer);

// 5. PATCH /api/medicine/transfers/:id/reject
router.patch('/:id/reject', rejectTransfer);

// 6. PATCH /api/medicine/transfers/:id/cancel
router.patch('/:id/cancel', cancelTransfer);

export default router;

