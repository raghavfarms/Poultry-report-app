import mongoose from 'mongoose';
import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import MedicineIssue from '../models/MedicineIssue.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

/**
 * Safely resolves a farm parameter to an ObjectId.
 * Supports:
 * 1. 24-character hexadecimal ObjectId string
 * 2. Firm name or code (case-insensitive lookup, e.g. "Sanjana", "Raghav")
 */
async function resolveFarmId(farmQuery) {
  if (!farmQuery) return null;
  const trimmed = String(farmQuery).trim();
  if (mongoose.Types.ObjectId.isValid(trimmed) && String(new mongoose.Types.ObjectId(trimmed)) === trimmed) {
    return new mongoose.Types.ObjectId(trimmed);
  }

  // Lookup firm by name or code
  if (mongoose.connection?.readyState === 1 || Firm.findOne?.mock) {
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
  }

  // Fallback: return a dummy ObjectId to avoid crashing with CastError while matching 0 results
  return new mongoose.Types.ObjectId();
}

/**
 * Resolves the effective farm filter for a user.
 * - If user is admin/developer:
 *     - If specific farm requested -> { farm: resolvedFarmId }
 *     - If no farm requested -> {} (all farms allowed)
 * - If user is restricted (non-admin or user with specific firms):
 *     - If specific farm requested AND is in user's allowed firms -> { farm: requestedId }
 *     - If specific farm requested BUT NOT in allowed firms -> { farm: allowedFirms[0] } or { farm: { $in: allowedFirms } }
 *     - If no farm requested -> { farm: allowedFirms[0] } or { farm: { $in: allowedFirms } }
 */
export async function resolveUserFarmScope(req, farmQuery) {
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
 * 1. GET Dashboard Stats & Expiry Radar
 * Calculates total stock, valuation, low-stock warnings, and expiry radar.
 */
export async function getDashboardStats(req, res) {
  const { farm } = req.query;
  const matchFilter = await resolveUserFarmScope(req, farm);

  // 1. Fetch all catalog medicines for reorder & minimum stock comparisons
  const medicines = await MedicineMaster.find({ active: true }).lean();

  // 2. Fetch all active/available batches (Sorted by earliest expiry date - FEFO)
  const batches = await MedicineBatch.find({
    ...matchFilter,
    quantityAvailable: { $gt: 0 },
    status: { $in: ['AVAILABLE', 'EXPIRED'] }
  })
    .populate('medicine', 'code name unit category minimumStock reorderLevel aliasName')
    .populate('supplier', 'name code')
    .populate('farm', 'name code')
    .sort({ expiryDate: 1 })
    .lean();

  const now = new Date(new Date().toISOString().slice(0, 10));
  let totalAvailableUnits = 0;

  // Expiry Radar Buckets 
  const expiryRadar = {
    expired: [],    // <= 0 days
    critical30: [], // 1 to 30 days (1 Month - Red / Critical)
    caution60: [],  // 31 to 60 days (2 Months - Orange / High Caution)
    warning90: [],  // 61 to 90 days (3 Months - Yellow / Use Soon)
    safe: []        // > 90 days (> 3 Months - Green / Safe)
  };

  // Medicine-wise aggregated stock map: { medicineId: totalAvailableQuantity }
  const medicineStockMap = {};

  for (const b of batches) {
    // Auto-reconcile with actual issued records to prevent any phantom stock drops
    const batchIssues = await MedicineIssue.find({ batch: b._id }).select('issuedQuantity').lean();
    const batchIssuedSum = batchIssues.reduce((sum, i) => sum + (i.issuedQuantity || 0), 0);
    const correctQty = Math.max(0, (b.initialQuantity || 0) - batchIssuedSum - (b.disposedQuantity || 0));
    if (b.quantityAvailable !== correctQty) {
      await MedicineBatch.updateOne(
        { _id: b._id },
        { $set: { quantityAvailable: correctQty, status: correctQty === 0 ? 'DEPLETED' : 'AVAILABLE' } }
      );
      b.quantityAvailable = correctQty;
    }

    totalAvailableUnits += b.quantityAvailable;
    // Days until expiry
    const expDate = new Date(b.expiryDate);
    const diffTime = expDate - now;
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const batchSummary = {
      _id: b._id,
      medicineId: b.medicine?._id?.toString() || '',
      batchNumber: b.batchNumber,
      medicineName: b.medicine?.name || 'Unknown',
      medicineAlias: b.medicine?.aliasName || '',
      medicineCode: b.medicine?.code || '—',
      unit: b.medicine?.unit || 'units',
      quantityAvailable: b.quantityAvailable,
      reorderLevel: b.medicine?.reorderLevel || 0,
      minimumStock: b.medicine?.minimumStock || 0,
      expiryDate: b.expiryDate,
      daysLeft,
      canIssue: b.status === 'AVAILABLE' && daysLeft >= 0,
      farm: b.farm
    };

    if (daysLeft < 0 || b.status === 'EXPIRED') {
      expiryRadar.expired.push(batchSummary);
    } else if (daysLeft <= 30) {
      expiryRadar.critical30.push(batchSummary);
    } else if (daysLeft <= 60) {
      expiryRadar.caution60.push(batchSummary);
    } else if (daysLeft <= 90) {
      expiryRadar.warning90.push(batchSummary);
    } else {
      expiryRadar.safe.push(batchSummary);
    }

    // Accumulate total stock per medicine
    const medId = b.medicine?._id?.toString();
    if (medId) {
      medicineStockMap[medId] = (medicineStockMap[medId] || 0) + b.quantityAvailable;
    }
  }

  // Ensure each radar category is sorted strictly by earliest expiry date first (FEFO)
  expiryRadar.expired.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  expiryRadar.critical30.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  expiryRadar.caution60.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  expiryRadar.warning90.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  expiryRadar.safe.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  // Identify Low Stock Medicines (Current Stock <= Reorder Level or Minimum Stock)
  const disposedMedicineIds = new Set((await MedicineBatch.distinct('medicine', {
    ...matchFilter,
    quantityAvailable: 0,
    disposedQuantity: { $gt: 0 },
  })).map(String));

  // Only check low stock for medicines that have actually been inwarded/stocked at this farm
  const farmMedicineIds = new Set(
    (await MedicineBatch.distinct('medicine', matchFilter)).map((id) => id?.toString()).filter(Boolean)
  );

  const lowStockAlerts = [];
  for (const med of medicines) {
    const medId = med._id.toString();
    // Skip medicines this farm has never received / inwarded
    if (!farmMedicineIds.has(medId)) continue;

    const currentStock = medicineStockMap[medId] || 0;
    if (currentStock === 0 && disposedMedicineIds.has(medId)) continue;
    const threshold = med.reorderLevel || med.minimumStock || 0;
    if (threshold > 0 && currentStock <= threshold) {
      lowStockAlerts.push({
        _id: med._id,
        code: med.code,
        name: med.name,
        unit: med.unit,
        category: med.category,
        currentStock,
        reorderLevel: med.reorderLevel,
        minimumStock: med.minimumStock,
        status: currentStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK'
      });
    }
  }

  // Tag every batch whose medicine is at or below reorder level
  const lowStockMedIds = new Set(lowStockAlerts.map((a) => a._id.toString()));
  const enrichWithStockAlert = (list) => {
    for (const item of list) {
      if (item.medicineId && lowStockMedIds.has(item.medicineId)) {
        item.isLowStock = true;
        item.totalMedicineStock = medicineStockMap[item.medicineId] || 0;
      }
    }
  };
  enrichWithStockAlert(expiryRadar.expired);
  enrichWithStockAlert(expiryRadar.critical30);
  enrichWithStockAlert(expiryRadar.caution60);
  enrichWithStockAlert(expiryRadar.warning90);
  enrichWithStockAlert(expiryRadar.safe);
  res.json({
    success: true,
    summary: {
      totalMedicines: medicines.length,
      totalBatches: batches.length,
      totalAvailableUnits,
      lowStockCount: lowStockAlerts.length,
      expiredCount: expiryRadar.expired.length,
      critical30Count: expiryRadar.critical30.length,
      caution60Count: expiryRadar.caution60.length,
      warning90Count: expiryRadar.warning90.length
    },
    expiryRadar: {
      expiredCount: expiryRadar.expired.length,
      critical30Count: expiryRadar.critical30.length,
      caution60Count: expiryRadar.caution60.length,
      warning90Count: expiryRadar.warning90.length,
      safeCount: expiryRadar.safe.length,
      expired: expiryRadar.expired,
      critical30: expiryRadar.critical30,
      caution60: expiryRadar.caution60,
      warning90: expiryRadar.warning90,
      safe: expiryRadar.safe
    },
    lowStockAlerts
  });
}

/**
 * 2. GET Reverse Batch Traceability
 * Queries end-to-end lifecycle of a batch:
 * Supplier ➔ GRN ➔ Store Acceptance ➔ Shed Issues ➔ Returns ➔ Current Stock
 * Supports search by Batch Number OR Medicine Name / Alias / Code.
 */
export async function getBatchTraceability(req, res) {
  const { batchNumber } = req.params || {};
  const { batchId, farm } = req.query || {};
  if (!batchNumber && !batchId) throw badRequest('Batch number or medicine name is required');

  const farmFilter = await resolveUserFarmScope(req, farm);

  const cleanQuery = (batchNumber || '').trim();
  let batch = null;

  // 1. If batchId is provided, look up that specific batch directly
  if (batchId && mongoose.Types.ObjectId.isValid(batchId)) {
    try {
      const found = await MedicineBatch.findById(batchId)
        .populate('medicine', 'code name category unit aliasName')
        .populate('supplier', 'code name contactPerson mobile')
        .populate('farm', 'name code')
        .populate('firstReceipt', 'receiptNumber invoiceOrChallanNo createdAt verifiedAt verifiedBy')
        .lean();
      if (found) {
        if (farmFilter.farm) {
          const fStr = (found.farm?._id || found.farm)?.toString();
          if (farmFilter.farm.$in) {
            if (farmFilter.farm.$in.map(String).includes(fStr)) batch = found;
          } else if (fStr === farmFilter.farm.toString()) {
            batch = found;
          }
        } else {
          batch = found;
        }
      }
    } catch {
      batch = null;
    }
  }

  // 2. Locate the batch by exact batch number (case-insensitive)
  if (!batch && cleanQuery) {
    batch = await MedicineBatch.findOne({
      batchNumber: cleanQuery.toUpperCase(),
      ...farmFilter,
    })
      .populate('medicine', 'code name category unit aliasName')
      .populate('supplier', 'code name contactPerson mobile')
      .populate('farm', 'name code')
      .populate('firstReceipt', 'receiptNumber invoiceOrChallanNo createdAt verifiedAt verifiedBy')
      .lean();
  }

  // 3. If not found by exact batch number:
  // 3a. Search by partial batchNumber first (e.g. "TXF-01", "01", "ENR")
  if (!batch && cleanQuery) {
    const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const isPureNumber = /^\d+$/.test(cleanQuery);

    try {
      const foundBatches = await MedicineBatch.find({ batchNumber: regex, ...farmFilter })
        .populate('medicine', 'code name category unit aliasName')
        .populate('supplier', 'code name contactPerson mobile')
        .populate('farm', 'name code')
        .populate('firstReceipt', 'receiptNumber invoiceOrChallanNo createdAt verifiedAt verifiedBy')
        .sort({ quantityAvailable: -1, expiryDate: 1, createdAt: -1 })
        .lean();

      if (foundBatches && foundBatches.length > 0) {
        batch = foundBatches[0];
      }
    } catch {
      batch = null;
    }

    // 3b. If no batch matched the batchNumber, search by Medicine Name or Alias
    // (Only match internal code MED-xxx if user typed text/prefix, NOT pure digits like "001")
    if (!batch) {
      const medConditions = [
        { name: regex },
        { aliasName: regex },
      ];
      if (!isPureNumber) {
        medConditions.push({ code: regex });
      }

      let matchingMedicineIds = [];
      try {
        const matchedMeds = await MedicineMaster.find({ $or: medConditions }).select('_id').lean();
        matchingMedicineIds = (matchedMeds || []).map((m) => m._id);
      } catch {
        matchingMedicineIds = [];
      }

      if (matchingMedicineIds.length > 0) {
        try {
          const foundBatches = await MedicineBatch.find({ medicine: { $in: matchingMedicineIds }, ...farmFilter })
            .populate('medicine', 'code name category unit aliasName')
            .populate('supplier', 'code name contactPerson mobile')
            .populate('farm', 'name code')
            .populate('firstReceipt', 'receiptNumber invoiceOrChallanNo createdAt verifiedAt verifiedBy')
            .sort({ quantityAvailable: -1, expiryDate: 1, createdAt: -1 })
            .lean();

          if (foundBatches && foundBatches.length > 0) {
            batch = foundBatches[0];
          }
        } catch {
          batch = null;
        }
      }
    }
  }

  if (!batch) {
    throw notFoundError(`No batch or medicine history found for '${cleanQuery}'.`);
  }

  // 4. Fetch related batches for the same medicine so user can toggle between all batches
  let relatedBatches = [];
  try {
    const medId = batch.medicine?._id || batch.medicine;
    if (medId && (mongoose.connection.readyState === 1 || MedicineBatch.find?.mock)) {
      const batchesList = await MedicineBatch.find({ medicine: medId, ...farmFilter })
        .select('batchNumber expiryDate quantityAvailable initialQuantity status createdAt farm')
        .populate('farm', 'name code')
        .sort({ createdAt: -1 })
        .lean();
      if (Array.isArray(batchesList)) {
        relatedBatches = batchesList;
      }
    }
  } catch {
    relatedBatches = [];
  }

  // 5. Fetch all consumption issues linked to this batch
  const receipts = await MedicineReceipt.find({
    medicine: batch.medicine?._id || batch.medicine,
    farm: batch.farm?._id || batch.farm,
    batchNumber: batch.batchNumber,
    status: 'STORE_ACCEPTED',
  }).populate('receivedBy', 'name username').populate('supplier', 'name').sort({ createdAt: 1 }).lean();
  const issues = await MedicineIssue.find({ batch: batch._id })
    .populate('issuedBy', 'name role')
    .sort({ issueDate: -1, createdAt: -1 })
    .lean();

  // 6. Fetch all ledger transactions for this batch (immutable timeline)
  const transactions = await MedicineTransaction.find({ batch: batch._id })
    .populate('performedBy', 'name role')
    .sort({ createdAt: 1 })
    .lean();
  // 7. Summarize consumption by Shed
  const shedBreakdown = {};
  let totalIssuedQty = 0;
  for (const iss of issues) {
    const qty = iss.issuedQuantity || 0;
    totalIssuedQty += qty;
    const shedKey = iss.shed || iss.destinationName || 'General/Store';
    shedBreakdown[shedKey] = (shedBreakdown[shedKey] || 0) + qty;
  }

  // Self-heal: ensure batch.quantityAvailable matches initialQuantity - totalIssuedQty
  const correctAvailable = Math.max(0, (batch.initialQuantity || 0) - totalIssuedQty - (batch.disposedQuantity || 0));
  if (batch.quantityAvailable !== correctAvailable) {
    await MedicineBatch.updateOne(
      { _id: batch._id },
      { $set: { quantityAvailable: correctAvailable, status: correctAvailable === 0 ? 'DEPLETED' : 'AVAILABLE' } }
    );
    batch.quantityAvailable = correctAvailable;
    batch.status = correctAvailable === 0 ? 'DEPLETED' : 'AVAILABLE';
  }

  res.json({
    success: true,
    batch: {
      ...batch,
      quantityAvailable: correctAvailable,
      totalIssued: totalIssuedQty,
      shedBreakdown,
      issuesCount: issues.length,
      transactionsCount: transactions.length
    },
    relatedBatches,
    timeline: {
      receipt: batch.firstReceipt,
      receipts,
      issues,
      transactions
    }
  });
}

/**
 * 3. GET Stock Movement Ledger
 * Filterable transaction history for accounting & audits
 */
export async function getStockLedger(req, res) {
  const { medicine, transactionType, startDate, endDate, farm, limit = 50, page = 1 } = req.query;
  const filter = {};
  if (medicine) filter.medicine = medicine;
  if (transactionType) filter.transactionType = transactionType;
  const farmScope = await resolveUserFarmScope(req, farm);
  Object.assign(filter, farmScope);
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = eDate;
    }
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [transactions, total] = await Promise.all([
    MedicineTransaction.find(filter)
      .populate('medicine', 'code name unit aliasName')
      .populate('batch', 'batchNumber expiryDate')
      .populate('performedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),
    MedicineTransaction.countDocuments(filter)
  ]);
  res.json({
    success: true,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    transactions
  });
}

/**
 * 4. GET Flock-wise Lifetime Treatment Costing Report
 * Computes total medicine consumption, treatment expenditure and Cost per Bird per flock
 */
export async function getFlockCostingReport(req, res) {
  const { farm, startDate, endDate } = req.query;
  const filter = await resolveUserFarmScope(req, farm);
  if (startDate || endDate) {
    filter.issueDate = {};
    if (startDate) filter.issueDate.$gte = startDate;
    if (endDate) filter.issueDate.$lte = endDate;
  }

  // Fetch all issues matching filter with medicine details
  const issues = await MedicineIssue.find(filter)
    .populate('medicine', 'code name unit category aliasName')
    .populate('farm', 'name code')
    .lean();

  // Group issues by Flock Identifier (or Shed if flock not set)
  const flockMap = {};

  for (const iss of issues) {
    const flockKey = iss.flockNumber?.trim() || `${iss.shed} (Unassigned Flock)`;

    if (!flockMap[flockKey]) {
      flockMap[flockKey] = {
        flockNumber: flockKey,
        farmName: iss.farm?.name || 'Farm',
        shed: iss.shed,
        maxBirdCount: 0,
        ageRecords: [],
        totalQuantity: 0,
        totalEstimatedCost: 0,
        issuesCount: 0,
        medicines: {},
      };
    }

    const flock = flockMap[flockKey];
    flock.issuesCount += 1;
    flock.totalQuantity += iss.issuedQuantity;
    if (iss.birdCount > flock.maxBirdCount) {
      flock.maxBirdCount = iss.birdCount;
    }
    if (iss.birdAgeDays > 0) {
      flock.ageRecords.push(iss.birdAgeDays);
    }

    // Estimate cost based on medicine category
    const rateEstimate = iss.medicine?.category === 'VACCINATION' ? 120 : 60;
    const lineCost = iss.issuedQuantity * rateEstimate;
    flock.totalEstimatedCost += lineCost;

    const medName = iss.medicine?.name || 'Medicine';
    if (!flock.medicines[medName]) {
      flock.medicines[medName] = {
        name: medName,
        aliasName: iss.medicine?.aliasName || '',
        code: iss.medicine?.code || '',
        quantity: 0,
        unit: iss.unit || 'units',
        cost: 0,
      };
    }
    flock.medicines[medName].quantity += iss.issuedQuantity;
    flock.medicines[medName].cost += lineCost;
  }

  // Format flock list and calculate Cost Per Bird
  let grandTotalCost = 0;
  let grandTotalBirds = 0;

  const flockList = Object.values(flockMap).map((flock) => {
    const avgAge = flock.ageRecords.length > 0
      ? Math.round(flock.ageRecords.reduce((a, b) => a + b, 0) / flock.ageRecords.length)
      : 0;

    const costPerBird = flock.maxBirdCount > 0
      ? Number((flock.totalEstimatedCost / flock.maxBirdCount).toFixed(2))
      : 0;

    grandTotalCost += flock.totalEstimatedCost;
    grandTotalBirds += flock.maxBirdCount;

    return {
      flockNumber: flock.flockNumber,
      farmName: flock.farmName,
      shed: flock.shed,
      birdCount: flock.maxBirdCount,
      averageAgeDays: avgAge,
      totalQuantity: flock.totalQuantity,
      totalEstimatedCost: flock.totalEstimatedCost,
      costPerBird,
      issuesCount: flock.issuesCount,
      medicinesList: Object.values(flock.medicines),
    };
  });

  res.json({
    success: true,
    overall: {
      totalFlocks: flockList.length,
      grandTotalCost,
      grandTotalBirds,
      overallCostPerBird: grandTotalBirds > 0 ? Number((grandTotalCost / grandTotalBirds).toFixed(2)) : 0,
    },
    flocks: flockList,
  });
}

/**
 * 5. PATCH /api/medicine/reports/batches/:id
 * Allows Admin and Developer to edit batch number and expiry date.
 * Automatically synchronizes linked receipts, issues, and transactions.
 */
export async function updateBatchDetails(req, res) {
  const { id } = req.params;
  const { batchNumber, expiryDate } = req.body;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    throw badRequest('Invalid batch ID');
  }

  const batch = await MedicineBatch.findById(id);
  if (!batch) {
    throw notFoundError('Batch not found');
  }

  const oldBatchNumber = batch.batchNumber;
  let newBatchNumber = batch.batchNumber;

  if (batchNumber && typeof batchNumber === 'string') {
    newBatchNumber = batchNumber.trim().toUpperCase();
    if (!newBatchNumber) {
      throw badRequest('Batch number cannot be empty');
    }

    if (newBatchNumber !== oldBatchNumber) {
      // Check for uniqueness within medicine & farm
      const conflict = await MedicineBatch.findOne({
        _id: { $ne: batch._id },
        medicine: batch.medicine,
        farm: batch.farm,
        batchNumber: newBatchNumber,
      });
      if (conflict) {
        throw badRequest(`Batch '${newBatchNumber}' already exists for this medicine at this farm.`);
      }

      batch.batchNumber = newBatchNumber;
    }
  }

  if (expiryDate && typeof expiryDate === 'string') {
    const trimmedExpiry = expiryDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedExpiry)) {
      throw badRequest('Expiry date must be in YYYY-MM-DD format');
    }
    batch.expiryDate = trimmedExpiry;

    // Recalculate status if available/expired
    const today = new Date().toISOString().slice(0, 10);
    if (batch.quantityAvailable > 0) {
      batch.status = trimmedExpiry < today ? 'EXPIRED' : 'AVAILABLE';
    }
  }

  await batch.save();

  // If batchNumber changed, synchronize related records
  if (newBatchNumber !== oldBatchNumber) {
    await MedicineReceipt.updateMany(
      { $or: [{ batch: batch._id }, { batchNumber: oldBatchNumber, medicine: batch.medicine }] },
      { $set: { batchNumber: newBatchNumber } }
    );
    await MedicineIssue.updateMany(
      { batch: batch._id },
      { $set: { batchNumber: newBatchNumber } }
    );
    await MedicineTransaction.updateMany(
      { batch: batch._id },
      { $set: { batchNumber: newBatchNumber } }
    );
  }

  res.json({
    success: true,
    message: 'Batch updated successfully',
    batch: {
      _id: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantityAvailable: batch.quantityAvailable,
      status: batch.status,
    },
  });
}

