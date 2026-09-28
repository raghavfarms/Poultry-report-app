import { Router } from 'express';
import { masterOnly, protect } from '../middleware/auth.js';
import { createStation, deleteStation, getStations, saveStations } from '../controllers/transportStations.controller.js';

const router = Router();
router.use(protect);
router.get('/', getStations);
router.post('/', masterOnly('transport_master'), createStation);
router.put('/', masterOnly('transport_master'), saveStations);
router.delete('/:name', masterOnly('transport_master'), deleteStation);
export default router;

