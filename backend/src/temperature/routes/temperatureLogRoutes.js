import express from 'express';
import {
  recordTemperature,
  getRecentLogs,
  getTemperatureReport,
  scanThermometerAi,
  deleteTemperatureLog,
} from '../controllers/temperatureLogController.js';
import { protect, requireModuleAccess, temperaturePermission, adminOnly } from '../../middleware/auth.js';

const router = express.Router();

// All temperature logging and reporting requires authenticated user with temperature module access
router.use(protect, requireModuleAccess('temperature'));

// AI Thermometer Vision Reading (Google Gemini Vision API)
router.post('/scan-ai', temperaturePermission('temperature_entry'), scanThermometerAi);

// Route for saving temperature reading
router.post('/', temperaturePermission('temperature_entry'), recordTemperature);

// Route for fetching recent temperature readings for the farm
router.get('/recent', getRecentLogs);

// Route for generating full 5-column temperature report with KPIs
router.get('/report', temperaturePermission('temperature_report'), getTemperatureReport);

// Admin-only routes to delete temperature readings
router.delete('/:id', adminOnly, deleteTemperatureLog);
router.delete('/', adminOnly, deleteTemperatureLog);

export default router;


 