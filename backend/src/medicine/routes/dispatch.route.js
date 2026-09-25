import express from 'express';
import { protect } from '../../middleware/auth.js';
import {
  createDispatch,
  getDispatches,
  confirmGateReceipt,
  storeAcceptDispatch,
} from '../controllers/dispatch.controller.js';

const router = express.Router();

router.use(protect);

// 1. Dispatch CRUD
router.get('/', getDispatches);
router.post('/', createDispatch);

// 2. Gate Security Arrival Confirmation (Step 2)
router.post('/:id/gate-confirm', confirmGateReceipt);

// 3. Storekeeper Formal Acceptance (Step 3)
router.post('/:id/store-accept', storeAcceptDispatch);

export default router;
