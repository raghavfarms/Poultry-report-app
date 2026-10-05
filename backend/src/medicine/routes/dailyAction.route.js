import express from 'express';
import {
  fastInward,
  fastOutward,
  getTodayActivity,
} from '../controllers/dailyAction.controller.js';
import {
  getLocations as getMedicineLocations,
  createLocation as createMedicineLocation,
  removeLocation as removeMedicineLocation,
} from '../controllers/location.controller.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Require JWT authentication
router.use(protect);

// 1. Locations Management (Shed 1, Shed 2, etc.)
router.get('/locations', getMedicineLocations);
router.post('/locations', createMedicineLocation);
router.delete('/locations', removeMedicineLocation);

// 2. POST fast inward (Medicine Arrived)
router.post('/inward', fastInward);

// 3. POST fast outward (Give to Birds / Shed Dose with FEFO)
router.post('/outward', fastOutward);

// 4. GET today's activity stream
router.get('/today', getTodayActivity);

export default router;
