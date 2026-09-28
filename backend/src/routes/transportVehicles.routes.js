import { Router } from 'express';
import { masterOnly, protect } from '../middleware/auth.js';
import { createVehicle, getVehicles, removeVehicle, restoreVehicle, updateVehicle } from '../controllers/transportVehicles.controller.js';

const router = Router();
router.use(protect);
router.get('/', getVehicles);
router.post('/', masterOnly('transport_master'), createVehicle);
router.patch('/:vehicleId', masterOnly('transport_master'), updateVehicle);
router.delete('/:vehicleId', masterOnly('transport_master'), removeVehicle);
router.patch('/:vehicleId/restore', masterOnly('transport_master'), restoreVehicle);
export default router;

