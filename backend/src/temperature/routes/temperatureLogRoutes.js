import express from 'express';
import {
  recordTemperature,
  getRecentLogs,
  getTemperatureReport,
} from '../controllers/temperatureLogController.js';
import { protect, requireModuleAccess } from '../../middleware/auth.js';

const router = express.Router();

// All temperature logging and reporting requires authenticated user with temperature module access
router.use(protect, requireModuleAccess('temperature'));

// Route for saving temperature reading
router.post('/', recordTemperature);

// Route for fetching recent temperature readings for the farm
router.get('/recent', getRecentLogs);

// Route for generating full 6-column temperature report with KPIs
router.get('/report', getTemperatureReport);

export default router;