import express from 'express';
import { protect, adminOnly } from '../../middleware/auth.js';
import { disposeBatch } from '../controllers/disposal.controller.js';
import {
  getDashboardStats,
  getBatchTraceability,
  getStockLedger,
  getFlockCostingReport,
  updateBatchDetails,
} from '../controllers/report.controller.js';

const router = express.Router();

// All medicine report routes require authentication
router.use(protect);
router.post('/batches/:id/dispose', adminOnly, disposeBatch);
router.patch('/batches/:id', adminOnly, updateBatchDetails);

// 1. Live KPIs, low-stock warnings, and Expiry Radar
router.get('/dashboard-stats', getDashboardStats);

// 2. Reverse Batch Traceability by batch number (e.g. /traceability/AMX-101)
router.get('/traceability/:batchNumber', getBatchTraceability);

// 3. Filterable Stock Movement Audit Ledger
router.get('/ledger', getStockLedger);

// 4. Lifetime Flock Treatment Costing & Cost Per Bird
router.get('/flock-costing', getFlockCostingReport);

export default router;
