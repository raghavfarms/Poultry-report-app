import { Router } from 'express';
import {
  getDefaultDate,
  getOpening,
  getOverview,
  getReport,
  getServiceStatus,
  resetService,
  saveEntry,
} from '../controllers/entries.controller.js';
import { protect, requireFirmAccess } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/default-date', requireFirmAccess, getDefaultDate);
router.get('/opening', requireFirmAccess, getOpening);
router.get('/service-status', requireFirmAccess, getServiceStatus);
router.get('/report', requireFirmAccess, getReport);
router.get('/overview', getOverview);
router.post('/service-reset/:firmId/:assetId', requireFirmAccess, resetService);
router.put('/:firmId/:date', requireFirmAccess, saveEntry);

export default router;
