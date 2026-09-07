import { Router } from 'express';
import { adminOnly, protect } from '../middleware/auth.js';
import { deleteTransportEntry, getTransportEntry, getTransportOpening, getTransportReport, saveTransportEntry, updateTransportStation } from '../controllers/transportEntries.controller.js';

const router = Router();
router.use(protect);
router.get('/report', getTransportReport);
router.get('/opening', getTransportOpening);
router.get('/:entryId', getTransportEntry);
router.post('/', saveTransportEntry);
router.put('/:entryId', saveTransportEntry);
router.patch('/:entryId/station', updateTransportStation);
router.delete('/:entryId', adminOnly, deleteTransportEntry);
export default router;
