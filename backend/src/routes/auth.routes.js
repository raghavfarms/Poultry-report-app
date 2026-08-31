import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCurrentUser, getRegistrationFirms, getSetupStatus, login, register, setupAdmin } from '../controllers/auth.controller.js';

const router = Router();

router.get('/setup-status', getSetupStatus);
router.get('/registration-firms', getRegistrationFirms);
router.post('/setup-admin', setupAdmin);
router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getCurrentUser);

export default router;
