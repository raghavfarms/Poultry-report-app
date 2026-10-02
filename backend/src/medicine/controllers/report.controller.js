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

  // Fallback: return a dummy ObjectId to avoid crashing with CastError while matching 0 results
  return new mongoose.Types.ObjectId();
}

/**
 * 1. GET Dashboard Stats & Expiry Radar
 * Calculates total stock, valuation, low-stock warnings, and expiry radar.
 */
export async function getDashboardStats(req, res) {
  const { farm } = req.query;
  const matchFilter = {};
  if (farm) {
    const farmId = await resolveFarmId(farm);
    if (farmId) matchFilter.farm = farmId;
  }

  // 1. Fetch all catalog medicines for reorder & minimum stock comparisons
  const medicines = await MedicineMaster.find({ active: true }).lean();

  // 2. Fetch all active/available batches
  const batches = await MedicineBatch.find({
    ...matchFilter,
    quantityAvailable: { $gt: 0 },
    status: { $in: ['AVAILABLE', 'EXPIRED'] }
  })
    .populate('medicine', 'code name unit category minimumStock reorderLevel aliasName')
    .populate('supplier', 'name code')
    .lean();

  const now = new Date(new Date().toISOString().slice(0, 10));
  let totalAvailableUnits = 0;

  // Expiry Radar Buckets 
  const expiryRadar = {
    expired: [],   // <= 0 days
    critical30: [], // 1 to 30 days
    caution60: [],  // 31 to 60 days
    safe: []       // > 60 days
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
    } else {
      expiryRadar.safe.push(batchSummary);
    }

    // Accumulate total stock per medicine
    const medId = b.medicine?._id?.toString();
    if (medId) {
      medicineStockMap[medId] = (medicineStockMap[medId] || 0) + b.quantityAvailable;
    }
  }

  // Identify Low Stock Medicines (Current Stock <= Reorder Level or Minimum Stock)
  const disposedMedicineIds = new Set((await MedicineBatch.distinct('medicine', {
    ...matchFilter,
    quantityAvailable: 0,
    disposedQuantity: { $gt: 0 },
  })).map(String));
  const lowStockAlerts = [];
  for (const med of medicines) {
    const medId = med._id.toString();
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
  enrichWithStockAlert(expiryRadar.safe);
  res.json({
    success: true,
    summary: {
      totalMedicines: medicines.length,
      totalBatches: batches.length,
      totalAvailableUnits,
      lowStockCount: lowStockAlerts.length,
      expiredCount: expiryRadar.expired.length,
      critical30Count: expiryRadar.critical30.length
    },
    expiryRadar: {
      expiredCount: expiryRadar.expired.length,
      critical30Count: expiryRadar.critical30.length,
      caution60Count: expiryRadar.caution60.length,
      safeCount: expiryRadar.safe.length,
      expired: expiryRadar.expired,
      critical30: expiryRadar.critical30,
      caution60: expiryRadar.caution60,
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
  const { batchId } = req.query || {};
  if (!batchNumber && !batchId) throw badRequest('Batch number or medicine name is required');

  const cleanQuery = (batchNumber || '').trim();
  let batch = null;

  // 1. If batchId is provided, look up that specific batch directly
  if (batchId && mongoose.Types.ObjectId.isValid(batchId)) {
    try {
      batch = await MedicineBatch.findById(batchId)
        .populate('medicine', 'code name category unit aliasName')
        .populate('supplier', 'code name contactPerson mobile')
        .populate('firstReceipt', 'receiptNumber invoiceOrChallanNo createdAt verifiedAt verifiedBy')
        .lean();
    } catch {
      batch = null;
    }
  }

  // 2. Locate the batch by exact batch number (case-insensitive)
  if (!batch && cleanQuery) {
    batch = await MedicineBatch.findOne({
      batchNumber: cleanQuery.toUpperCase()
    })
      .populate('medicine', 'code name category unit aliasName')
      .populate('supplier', 'code name contactPerson mobile')
      .populate('firstReceipt', 'receiptNumber invoiceOrChallanNo createdAt verifiedAt verifiedBy')
      .lean();
  }

  // 3. If not found by exact batch number, search by Medicine Name, alias, code, or partial batchNumber
  if (!batch && cleanQuery) {
    const escaped = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    let matchingMedicineIds = [];
    try {
      const matchedMeds = await MedicineMaster.find({
        $or: [
          { name: regex },
          { aliasName: regex },
          { code: regex }
        ]
      }).select('_id').lean();
      matchingMedicineIds = (matchedMeds || []).map((m) => m._id);
    } catch {
      matchingMedicineIds = [];
    }

    const batchOrConditions = [
      ...(matchingMedicineIds.length > 0 ? [{ medicine: { $in: matchingMedicineIds } }] : []),
      { batchNumber: regex }
    ];

    if (batchOrConditions.length > 0) {
      try {
        const foundBatches = await MedicineBatch.find({ $or: batchOrConditions })
          .populate('medicine', 'code name category unit aliasName')
          .populate('supplier', 'code name contactPerson mobile')
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

  if (!batch) {
    throw notFoundError(`No batch or medicine history found for '${cleanQuery}'.`);
  }

  // 4. Fetch related batches for the same medicine so user can toggle between all batches
  let relatedBatches = [];
  try {
    const medId = batch.medicine?._id || batch.medicine;
    if (medId && (mongoose.connection.readyState === 1 || MedicineBatch.find?.mock)) {
      const batchesList = await MedicineBatch.find({ medicine: medId })
        .select('batchNumber expiryDate quantityAvailable initialQuantity status createdAt')
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
    farm: batch.farm,
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
  if (farm) {
    const farmId = await resolveFarmId(farm);
    if (farmId) filter.farm = farmId;
  }
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
  const filter = {};
  if (farm) {
    const farmId = await resolveFarmId(farm);
    if (farmId) filter.farm = farmId;
  }
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
