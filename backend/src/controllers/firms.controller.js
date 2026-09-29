import Firm from '../models/Firm.js';
import { badRequest, notFoundError } from '../utils/http.js';
import { getPermittedFirmsForModule } from '../utils/userFirms.js';

export async function getFirms(req, res) {
  const includeOffice = req.query.includeOffice === 'true' || req.query.all === 'true';
  const officeCondition = includeOffice ? {} : { code: { $ne: 'OFFICE' } };
  const targetModule = req.query.module;

  const permitted = getPermittedFirmsForModule(req.user, targetModule);
  const filter = permitted === null
    ? { active: true, ...officeCondition }
    : { _id: { $in: permitted }, active: true, ...officeCondition };

  const firms = await Firm.find(filter).sort({ name: 1 }).lean();
  res.json({ firms });
}

export async function updateFirm(req, res) {
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
}

