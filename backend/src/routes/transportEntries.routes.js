import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getTransportEntry, getTransportOpening, getTransportReport, saveTransportEntry } from '../controllers/transportEntries.controller.js';

const router = Router();
router.use(protect);
router.get('/report', getTransportReport);
router.get('/opening', getTransportOpening);
router.get('/:entryId', getTransportEntry);
router.post('/', saveTransportEntry);
router.put('/:entryId', saveTransportEntry);
export default router;
