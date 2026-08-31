import { Router } from 'express';
import { adminOnly, protect, requireFirmAccess } from '../middleware/auth.js';
import { createAsset, deleteAsset, getFirmAssets, updateAsset,restoreAsset } from '../controllers/assets.controller.js';

const router = Router();
router.use(protect);

router.get('/firm/:firmId', requireFirmAccess, getFirmAssets);
router.post('/firm/:firmId', adminOnly, createAsset);
router.patch('/:assetId', adminOnly, updateAsset);
router.delete('/:assetId', adminOnly, deleteAsset);
router.patch('/:assetId/restore',adminOnly,restoreAsset);

export default router;
