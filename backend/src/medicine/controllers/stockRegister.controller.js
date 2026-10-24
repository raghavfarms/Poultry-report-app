import mongoose from 'mongoose';
import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineIssue from '../models/MedicineIssue.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import MedicineStockAudit from '../models/MedicineStockAudit.js';
import Firm from '../../models/Firm.js';
import { badRequest } from '../../utils/http.js';

/**
 * Safely resolves a farm parameter to an ObjectId.
 */
async function resolveFarmId(farmQuery) {
  if (!farmQuery) return null;
  const trimmed = String(farmQuery).trim();
  if (mongoose.Types.ObjectId.isValid(trimmed) && String(new mongoose.Types.ObjectId(trimmed)) === trimmed) {
    return new mongoose.Types.ObjectId(trimmed);
  }

  const firm = await Firm.findOne({
    $or: [
      { name: new RegExp(`^${trimmed}$`, 'i') },
      { name: new RegExp(`^${trimmed}`, 'i') },
      { code: trimmed.toUpperCase() },
    ],
  })
    .select('_id')
    .lean();

  if (firm) {
    return firm._id;
  }

  return new mongoose.Types.ObjectId();
}

/**
 * Resolves effective farm filter for current user session.
 */
async function resolveUserFarmScope(req, farmQuery) {
  const isAdmin = ['admin', 'developer'].includes(req.user?.role);
  let allowedFirms = [];

  if (!isAdmin && req.user) {
    if (Array.isArray(req.user.firms) && req.user.firms.length > 0) {
      allowedFirms = req.user.firms.map((f) => new mongoose.Types.ObjectId(f._id || f));
    } else if (req.user.firm) {
      allowedFirms = [new mongoose.Types.ObjectId(req.user.firm._id || req.user.firm)];
    }
  }

  if (farmQuery) {
    const requestedId = await resolveFarmId(farmQuery);
    if (!isAdmin && allowedFirms.length > 0) {
      const isAllowed = allowedFirms.some((f) => f.toString() === requestedId?.toString());
      if (isAllowed) {
        return { farm: requestedId };
      }
      return allowedFirms.length === 1 ? { farm: allowedFirms[0] } : { farm: { $in: allowedFirms } };
    }
    if (requestedId) return { farm: requestedId };
  }

  if (!isAdmin && allowedFirms.length > 0) {
    return allowedFirms.length === 1 ? { farm: allowedFirms[0] } : { farm: { $in: allowedFirms } };
  }

  return {};
}

/**
 * GET /api/medicine/reports/stock-register
 * Query params: farm, date (YYYY-MM-DD, defaults to today)
 */
export async function getStockRegister(req, res) {
  const { farm, date } = req.query;
  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date).trim())
    ? String(date).trim()
    : new Date().toISOString().slice(0, 10);

  const farmFilter = await resolveUserFarmScope(req, farm);
  const resolvedFarmId = farmFilter.farm;

  // 1. Fetch all active catalog medicines sorted alphabetically
  const medicines = await MedicineMaster.find({ active: true }).sort({ name: 1 }).lean();

  // 2. Target day boundaries
  const startOfDay = new Date(`${targetDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${targetDate}T23:59:59.999Z`);

  // 3. Inward receipts verified on targetDate
  const receiptMatch = {
    ...farmFilter,
    status: 'STORE_ACCEPTED',
    $or: [
      { verifiedAt: { $gte: startOfDay, $lte: endOfDay } },
      { verifiedAt: null, createdAt: { $gte: startOfDay, $lte: endOfDay } },
    ],
  };
  const receipts = await MedicineReceipt.find(receiptMatch).lean();
  const receiptMap = {};
  for (const r of receipts) {
    const medId = r.medicine?.toString();
    if (!medId) continue;
    const qty = Number(r.storeAcceptedQuantity || r.receivedQuantity) || 0;
    receiptMap[medId] = (receiptMap[medId] || 0) + qty;
  }

  // 4. Outward consumption issues on targetDate
  const issueMatch = {
    ...farmFilter,
    issueDate: targetDate,
  };
  const issues = await MedicineIssue.find(issueMatch).lean();
  const issueMap = {};
  for (const iss of issues) {
    const medId = iss.medicine?.toString();
    if (!medId) continue;
    const qty = Number(iss.issuedQuantity) || 0;
    const shedName = iss.shed?.trim() || iss.destinationType || 'Shed';
    if (!issueMap[medId]) {
      issueMap[medId] = { total: 0, sheds: new Set() };
    }
    issueMap[medId].total += qty;
    if (shedName) issueMap[medId].sheds.add(shedName);
  }

  // 5. Live available stock in batches
  const batches = await MedicineBatch.find({
    ...farmFilter,
    status: { $in: ['AVAILABLE', 'EXPIRED'] },
  }).lean();
  const currentStockMap = {};
  for (const b of batches) {
    const medId = b.medicine?.toString();
    if (!medId) continue;
    currentStockMap[medId] = (currentStockMap[medId] || 0) + (Number(b.quantityAvailable) || 0);
  }

  // 6. Check if target date is in the past
  const todayStr = new Date().toISOString().slice(0, 10);
  const isToday = targetDate >= todayStr;

  const futureAdjustments = {};
  if (!isToday) {
    const afterStart = new Date(`${targetDate}T23:59:59.999Z`);
    const futureIssues = await MedicineIssue.find({
      ...farmFilter,
      issueDate: { $gt: targetDate },
    })
      .select('medicine issuedQuantity')
      .lean();

    const futureReceipts = await MedicineReceipt.find({
      ...farmFilter,
      status: 'STORE_ACCEPTED',
      $or: [
        { verifiedAt: { $gt: afterStart } },
        { verifiedAt: null, createdAt: { $gt: afterStart } },
      ],
    })
      .select('medicine storeAcceptedQuantity receivedQuantity')
      .lean();

    for (const fi of futureIssues) {
      const mid = fi.medicine?.toString();
      if (!mid) continue;
      if (!futureAdjustments[mid]) futureAdjustments[mid] = { inward: 0, outward: 0 };
      futureAdjustments[mid].outward += Number(fi.issuedQuantity) || 0;
    }
    for (const fr of futureReceipts) {
      const mid = fr.medicine?.toString();
      if (!mid) continue;
      if (!futureAdjustments[mid]) futureAdjustments[mid] = { inward: 0, outward: 0 };
      futureAdjustments[mid].inward += Number(fr.storeAcceptedQuantity || fr.receivedQuantity) || 0;
    }
  }

  // 7. Fetch existing physical stock audit for this farm and targetDate
  let existingAudit = null;
  if (resolvedFarmId && mongoose.Types.ObjectId.isValid(resolvedFarmId)) {
    existingAudit = await MedicineStockAudit.findOne({
      farm: resolvedFarmId,
      date: targetDate,
    }).lean();
  }

  const auditItemMap = {};
  if (existingAudit && Array.isArray(existingAudit.items)) {
    for (const it of existingAudit.items) {
      if (it.medicine) {
        auditItemMap[it.medicine.toString()] = it;
      }
    }
  }

  // 8. Compile stock register rows
  const registerItems = [];
  for (const med of medicines) {
    const medId = med._id.toString();
    const packSize = Number(med.packSize) > 0 ? Number(med.packSize) : 1;
    const packagingType = med.packagingType || 'Bottle';
    const unit = med.unit || '';

    const recdQty = Number((receiptMap[medId] || 0).toFixed(3));
    const issData = issueMap[medId] || { total: 0, sheds: new Set() };
    const issuedQty = Number(issData.total.toFixed(3));
    const shedNo = Array.from(issData.sheds).join(', ') || '-';

    let clgQty = 0;
    const liveStock = currentStockMap[medId] || 0;
    if (isToday) {
      clgQty = liveStock;
    } else {
      const fut = futureAdjustments[medId] || { inward: 0, outward: 0 };
      clgQty = Math.max(0, liveStock + fut.outward - fut.inward);
    }
    clgQty = Number(clgQty.toFixed(3));

    // Closing = Opening + Received - Issued => Opening = Closing - Received + Issued
    let opgQty = Math.max(0, clgQty - recdQty + issuedQty);
    opgQty = Number(opgQty.toFixed(3));
    const subTotalQty = Number((opgQty + recdQty).toFixed(3));

    const opgPacks = packSize > 1 ? Math.floor(opgQty / packSize) : opgQty;
    const opgLoose = packSize > 1 ? Number((opgQty - opgPacks * packSize).toFixed(3)) : 0;

    const recdPacks = packSize > 1 ? Math.floor(recdQty / packSize) : recdQty;
    const recdLoose = packSize > 1 ? Number((recdQty - recdPacks * packSize).toFixed(3)) : 0;

    const clgPacks = packSize > 1 ? Math.floor(clgQty / packSize) : clgQty;
    const clgLoose = packSize > 1 ? Number((clgQty - clgPacks * packSize).toFixed(3)) : 0;

    const savedItem = auditItemMap[medId];
    const physicalQty =
      savedItem !== undefined && savedItem.physicalQuantity !== null && savedItem.physicalQuantity !== undefined
        ? Number(savedItem.physicalQuantity)
        : null;
    const difference = physicalQty !== null ? Number((physicalQty - clgQty).toFixed(3)) : null;

    registerItems.push({
      _id: med._id,
      code: med.code,
      name: med.name,
      aliasName: med.aliasName || '',
      category: med.category || '',
      packagingType,
      packSize,
      unit,
      opening: {
        packs: opgPacks,
        loose: opgLoose,
        total: opgQty,
      },
      received: {
        packs: recdPacks,
        loose: recdLoose,
        total: recdQty,
      },
      subTotal: {
        total: subTotalQty,
      },
      issued: {
        shedNo,
        total: issuedQty,
      },
      closing: {
        packs: clgPacks,
        loose: clgLoose,
        total: clgQty,
      },
      physical: physicalQty,
      difference,
      remarks: savedItem?.remarks || '',
    });
  }

  res.json({
    success: true,
    date: targetDate,
    farm: resolvedFarmId || farm || null,
    auditStatus: existingAudit ? existingAudit.status : 'NOT_AUDITED',
    auditNotes: existingAudit?.notes || '',
    auditedByName: existingAudit?.auditedByName || '',
    updatedAt: existingAudit?.updatedAt || null,
    items: registerItems,
  });
}

/**
 * POST /api/medicine/reports/stock-register/audit
 * Body: { farm, date, items, notes }
 */
export async function saveStockAudit(req, res) {
  const { farm, date, items, notes } = req.body;
  if (!farm || !date) {
    throw badRequest('Farm and date are required to save stock audit');
  }

  const farmId = await resolveFarmId(farm);
  if (!farmId) {
    throw badRequest('Invalid farm identifier');
  }

  const targetDate = String(date).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw badRequest('Date must be in YYYY-MM-DD format');
  }

  const auditItems = Array.isArray(items)
    ? items.map((it) => {
        const pQty =
          it.physical !== null && it.physical !== undefined && it.physical !== ''
            ? Number(it.physical)
            : it.physicalQuantity !== null && it.physicalQuantity !== undefined && it.physicalQuantity !== ''
            ? Number(it.physicalQuantity)
            : 0;
        const cQty = Number(it.closing?.total ?? it.closingQuantity) || 0;
        return {
          medicine: it.medicine || it._id,
          medicineName: it.name || it.medicineName || '',
          packSize: Number(it.packSize) || 1,
          unit: it.unit || '',
          openingQuantity: Number(it.opening?.total ?? it.openingQuantity) || 0,
          receivedQuantity: Number(it.received?.total ?? it.receivedQuantity) || 0,
          issuedQuantity: Number(it.issued?.total ?? it.issuedQuantity) || 0,
          closingQuantity: cQty,
          physicalQuantity: pQty,
          difference: Number((pQty - cQty).toFixed(3)),
          remarks: it.remarks || '',
        };
      })
    : [];

  const audit = await MedicineStockAudit.findOneAndUpdate(
    { farm: farmId, date: targetDate },
    {
      farm: farmId,
      date: targetDate,
      auditedBy: req.user?._id || null,
      auditedByName: req.user?.name || req.user?.username || 'Supervisor',
      status: 'SUBMITTED',
      items: auditItems,
      notes: notes || '',
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    success: true,
    message: 'Stock audit saved successfully',
    audit,
  });
}
