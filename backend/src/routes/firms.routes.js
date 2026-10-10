import { Router } from 'express';
import { adminOnly, protect } from '../middleware/auth.js';
import { getFirms, updateFirm } from '../controllers/firms.controller.js';

const router = Router();
router.use(protect);

router.get('/', getFirms);
router.patch('/:firmId', adminOnly, updateFirm);

export default router;
