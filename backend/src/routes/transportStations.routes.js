import { Router } from 'express';
import { adminOnly, protect } from '../middleware/auth.js';
import { createStation, deleteStation, getStations, saveStations } from '../controllers/transportStations.controller.js';

const router = Router();
router.use(protect);
router.get('/', getStations);
router.post('/', adminOnly, createStation);
router.put('/', adminOnly, saveStations);
router.delete('/:name', adminOnly, deleteStation);
export default router;

