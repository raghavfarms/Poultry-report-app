import express from 'express';
import { protect } from '../../middleware/auth.js';
import {
  getDashboardStats,
  getBatchTraceability,
  getStockLedger,
  getFlockCostingReport,
} from '../controllers/report.controller.js';

const router = express.Router();

// All medicine report routes require authentication
router.use(protect);

// 1. Live KPIs, low-stock warnings, and Expiry Radar
router.get('/dashboard-stats', getDashboardStats);

// 2. Reverse Batch Traceability by batch number (e.g. /traceability/AMX-101)
router.get('/traceability/:batchNumber', getBatchTraceability);

// 3. Filterable Stock Movement Audit Ledger
router.get('/ledger', getStockLedger);

// 4. Lifetime Flock Treatment Costing & Cost Per Bird
router.get('/flock-costing', getFlockCostingReport);

export default router;