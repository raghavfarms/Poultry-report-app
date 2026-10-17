import express from 'express';
import {
  getSpots,
  createSpot,
  quickSetupSpots,
  deleteSpot,
  updateSpot,
  toggleSpotStatus,
} from '../controllers/spotController.js';
import { protect, masterOnly, requireModuleAccess } from '../../middleware/auth.js';

const router = express.Router();

// All spot routes require authenticated user with temperature module access
router.use(protect, requireModuleAccess('temperature'));

// Route for getting spots (requires temperature module access)
router.get('/', getSpots);

// Master spot management routes (requires temperature_master permission)
router.post('/', masterOnly('temperature_master'), createSpot);
router.post('/quick-setup', masterOnly('temperature_master'), quickSetupSpots);
router.put('/:id', masterOnly('temperature_master'), updateSpot);
router.delete('/:id', masterOnly('temperature_master'), deleteSpot);
router.patch('/:id/toggle-status', masterOnly('temperature_master'), toggleSpotStatus);

export default router;


