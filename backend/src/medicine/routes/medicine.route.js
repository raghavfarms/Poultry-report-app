import express from 'express';
import {
  createMedicine,
  getMedicines,
  getMedicineById,
  updateMedicine,
  toggleMedicineStatus,
  deleteCategory,
  deleteUnit,
  deleteMedicine,
} from '../controllers/medicine.controller.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

router.use(protect);

// Category and Unit deletion (must be declared before /:id)
router.delete('/categories', deleteCategory);
router.delete('/units', deleteUnit);

// 1. GET all medicines, POST create new medicine
router.route('/')
  .get(getMedicines)
  .post(createMedicine);

// 2. GET single medicine, PUT update medicine, DELETE delete medicine
router.route('/:id')
  .get(getMedicineById)
  .put(updateMedicine)
  .delete(deleteMedicine);

// 3. PATCH /:id/status - Toggle active/inactive
router.patch('/:id/status', toggleMedicineStatus);

export default router;
