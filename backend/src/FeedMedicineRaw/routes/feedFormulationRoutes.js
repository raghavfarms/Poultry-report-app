import express from 'express';
import {
  createFormulation,
  getFormulations,
  getFormulationById,
  updateFormulation,
  toggleFormulationStatus,
} from '../controllers/feedFormulationController.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Protect all routes - only logged-in users can view/manage
router.use(protect);

// 1. GET all formulations & POST create a new formulation
router.route('/')
  .get(getFormulations)
  .post(createFormulation);

// 2. GET single formulation & PUT update
router.route('/:id')
  .get(getFormulationById)
  .put(updateFormulation);

// 3. PATCH toggle active/inactive status
router.patch('/:id/toggle', toggleFormulationStatus);

export default router;