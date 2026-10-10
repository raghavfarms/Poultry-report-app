import { Router } from 'express';
import { protect, adminOnly } from '../middleware/auth.js';
import { getUsers, createUser, updateUser, toggleUserStatus, deleteUser } from '../controllers/user.controller.js';

const router = Router();

router.use(protect, adminOnly);

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.patch('/:id/toggle-status', toggleUserStatus);
router.delete('/:id', deleteUser);

export default router;
