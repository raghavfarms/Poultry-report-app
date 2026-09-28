import { Router } from 'express';
import { masterOnly, protect, requireFirmAccess } from '../middleware/auth.js';
import { createAsset, deleteAsset, getFirmAssets, updateAsset,restoreAsset } from '../controllers/assets.controller.js';

const router = Router();
router.use(protect);

router.get('/firm/:firmId', requireFirmAccess, getFirmAssets);
router.post('/firm/:firmId', masterOnly('asset_master'), requireFirmAccess, createAsset);
router.patch('/:assetId', masterOnly('asset_master'), updateAsset);
router.delete('/:assetId', masterOnly('asset_master'), deleteAsset);
router.patch('/:assetId/restore',masterOnly('asset_master'),restoreAsset);

export default router;




