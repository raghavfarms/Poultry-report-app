import express from 'express';
import {
  getSpots,
  createSpot,
  quickSetupSpots,
  deleteSpot,
  updateSpot,
  toggleSpotStatus,
} from '../controllers/spotController.js';
import { protect, adminOnly, requireModuleAccess } from '../../middleware/auth.js';

const router = express.Router();

// Route for getting spots (requires temperature module access)
router.get('/', protect, requireModuleAccess('temperature'), getSpots);

// Admin-only spot management routes
router.post('/', protect, adminOnly, createSpot);
router.post('/quick-setup', protect, adminOnly, quickSetupSpots);
router.put('/:id', protect, adminOnly, updateSpot);
router.delete('/:id', protect, adminOnly, deleteSpot);
router.patch('/:id/toggle-status', protect, adminOnly, toggleSpotStatus);

export default router;


