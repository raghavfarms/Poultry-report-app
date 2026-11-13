import express from 'express';
import {
  createFeedItem,
  getFeedItems,
  getFeedItemById,
  updateFeedItem,
  toggleFeedItemStatus,
} from '../controllers/feedMedicineRawMasterController.js';
import { protect } from '../../middleware/auth.js';

const router = express.Router();

// Protect all routes with authentication middleware
router.use(protect);

// 1. GET all feed items (with search/filters) & POST create new feed item
router.route('/')
  .get(getFeedItems)
  .post(createFeedItem);  


// 2. GET single feed item by ID & PUT update feed item
router.route('/:id')
  .get(getFeedItemById)
  .put(updateFeedItem);

// 3. PATCH /:id/toggle - Toggle active/inactive status
router.patch('/:id/toggle', toggleFeedItemStatus);
 
export default router;