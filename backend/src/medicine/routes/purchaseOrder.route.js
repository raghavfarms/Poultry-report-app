
import express from 'express';
import {
  createPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
} from '../controllers/purchaseOrder.controller.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Protect all routes with JWT authentication
router.use(protect);

// 1. GET all POs / POST create a new PO
router.route('/')
  .get(getPurchaseOrders)
  .post(createPurchaseOrder);

// 2. GET single PO / PUT update PO (DRAFT only)
router.route('/:id')
  .get(getPurchaseOrderById)
  .put(updatePurchaseOrder);

// 3. PATCH update PO status (e.g. DRAFT -> ISSUED or CANCELLED)
router.patch('/:id/status', updatePurchaseOrderStatus);

export default router;