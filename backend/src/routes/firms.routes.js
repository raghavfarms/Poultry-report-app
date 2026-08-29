import { Router } from 'express';
import Firm from '../models/Firm.js';
import { adminOnly, protect } from '../middleware/auth.js';
import { badRequest, notFoundError } from '../utils/http.js';

const router = Router();
router.use(protect);

router.get('/', async (req, res) => {
  const filter = req.user.role === 'admin' ? { active: true } : { _id: { $in: req.user.firms }, active: true };
  const firms = await Firm.find(filter).sort({ name: 1 }).lean();
  res.json({ firms });
});

router.patch('/:firmId', adminOnly, async (req, res) => {
  const update = {};
  if (req.body.name != null) {
    update.name = String(req.body.name).trim();
    if (update.name.length < 2) throw badRequest('Firm name is too short.');
  }
  if (req.body.dieselOpeningBalance != null) {
    update.dieselOpeningBalance = Number(req.body.dieselOpeningBalance);
    if (!Number.isFinite(update.dieselOpeningBalance) || update.dieselOpeningBalance < 0) {
      throw badRequest('Opening balance must be zero or greater.');
    }
  }
  const firm = await Firm.findByIdAndUpdate(req.params.firmId, update, { new: true, runValidators: true });
  if (!firm) throw notFoundError('Firm not found.');
  res.json({ firm });
});

export default router;

