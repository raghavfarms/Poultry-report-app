import { Router } from 'express';
import { masterOnly, protect, requireFirmAccess } from '../middleware/auth.js';
import { getFirms, updateFirm } from '../controllers/firms.controller.js';

const router = Router();
router.use(protect);

router.get('/', getFirms);
router.patch('/:firmId', masterOnly('asset_master'), requireFirmAccess, updateFirm);

export default router;
