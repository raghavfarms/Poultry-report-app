import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { getRoles, createRole, updateRole, deleteRole } from '../controllers/role.controller.js';

const router = Router();

router.use(protect, adminOnly);

router.get('/', getRoles);
router.post('/', createRole);
router.put('/:id', updateRole);
router.delete('/:id', deleteRole);

export default router;
