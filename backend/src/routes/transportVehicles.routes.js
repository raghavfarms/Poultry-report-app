import { Router } from 'express';
import { adminOnly, developerOnly, protect } from '../middleware/auth.js';
import { createVehicle, getVehicles, removeVehicle, restoreVehicle, updateVehicle } from '../controllers/transportVehicles.controller.js';

const router = Router();
router.use(protect);
router.use(developerOnly);
router.get('/', getVehicles);
router.post('/', adminOnly, createVehicle);
router.patch('/:vehicleId', adminOnly, updateVehicle);
router.delete('/:vehicleId', adminOnly, removeVehicle);
router.patch('/:vehicleId/restore', adminOnly, restoreVehicle);
export default router;
