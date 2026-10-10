
import express from 'express';
import {
  createSupplier,
  getSuppliers,
  getSupplierById,
  updateSupplier,
  toggleSupplierStatus,
} from '../controllers/supplier.controller.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Protect all routes below — only authenticated users can access
router.use(protect);

// 1. GET /api/medicine/suppliers - Fetch all suppliers
// 2. POST /api/medicine/suppliers - Create new supplier
router.route('/')
  .get(getSuppliers)
  .post(createSupplier);

// 3. GET /api/medicine/suppliers/:id - Fetch single supplier
// 4. PUT /api/medicine/suppliers/:id - Update supplier
router.route('/:id')
  .get(getSupplierById)
  .put(updateSupplier);

// 5. PATCH /api/medicine/suppliers/:id/status - Toggle active/inactive
router.patch('/:id/status', toggleSupplierStatus);

export default router;