import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import MedicineIssue from '../models/MedicineIssue.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import { badRequest, notFoundError } from '../../utils/http.js';

/**
 * 1. GET Dashboard Stats & Expiry Radar
 * Calculates total stock, valuation, low-stock warnings, and expiry radar.
 */
export async function getDashboardStats(req, res) {
  const { farm } = req.query;
  const matchFilter = {};
  if (farm) matchFilter.farm = farm;

  // 1. Fetch all catalog medicines for reorder & minimum stock comparisons
  const medicines = await MedicineMaster.find({ active: true }).lean();

  // 2. Fetch all active/available batches
  const batches = await MedicineBatch.find({
    ...matchFilter,
    quantityAvailable: { $gt: 0 },
    status: { $in: ['AVAILABLE', 'EXPIRED'] }
  })
    .populate('medicine', 'code name unit category minimumStock reorderLevel')
    .populate('supplier', 'name code')
    .lean();

  const now = new Date();
  let totalAvailableUnits = 0;

    //Expiry Radar Buckets 
    const expiryRadar={
        expired:[],   // <= 0 days
        critical30 :[], // 1 to 30 days
        caution60 :[],   // 31 to 60 days
        safe:[]   // > 60 days

    }

  // Medicine-wise aggregated stock map: { medicineId: totalAvailableQuantity }

   const medicineStockMap={};

   for(const b of batches){
    totalAvailableUnits+=b.quantityAvailable;
  // Days until expiry

   const expDate=new Date(b.expiryDate);
   const diffTime=expDate-now;
   const daysLeft=Math.ceil(diffTime/(1000*60*60*24));
   
 
const batchSummary = {
      _id: b._id,
      batchNumber: b.batchNumber,
      medicineName: b.medicine?.name || 'Unknown',
      medicineCode: b.medicine?.code || '—',
      unit: b.medicine?.unit || 'units',
      quantityAvailable: b.quantityAvailable,
      expiryDate: b.expiryDate,
      daysLeft,
      farm: b.farm
    };

   if (daysLeft <= 0) {
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
  const lowStockAlerts = [];
  for (const med of medicines) {
    const medId = med._id.toString();
    const currentStock = medicineStockMap[medId] || 0;
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
      caution60: expiryRadar.caution60
    },
    lowStockAlerts
  });
}
/**
 * 2. GET Reverse Batch Traceability
 * Queries end-to-end lifecycle of a batch:
 * Supplier ➔ GRN ➔ Store Acceptance ➔ Shed Issues ➔ Returns ➔ Current Stock
 */
export async function getBatchTraceability(req, res) {
  const { batchNumber } = req.params;
  if (!batchNumber) throw badRequest('Batch number is required');
  // 1. Locate the batch
  const batch = await MedicineBatch.findOne({
    batchNumber: batchNumber.trim().toUpperCase()
  })
    .populate('medicine', 'code name category unit')
    .populate('supplier', 'code name contactPerson mobile')
    .populate('receipt', 'receiptNumber invoiceNumber challanNumber receiptDate acceptedAt verifiedBy')
    .lean();
  if (!batch) {
    throw notFoundError(`Batch '${batchNumber}' was not found in the system.`);
  }
  // 2. Fetch all consumption issues linked to this batch
  const issues = await MedicineIssue.find({ batch: batch._id })
    .populate('issuedBy', 'name role')
    .sort({ issueDate: -1, createdAt: -1 })
    .lean();


  // 3. Fetch all ledger transactions for this batch (immutable timeline)
  const transactions = await MedicineTransaction.find({ batch: batch._id })
    .populate('performedBy', 'name role')
    .sort({ createdAt: 1 })
    .lean();
  // 4. Summarize consumption by Shed
  const shedBreakdown = {};
  let totalIssuedQty = 0;
  for (const iss of issues) {
    totalIssuedQty += iss.quantity;
    const shedKey = iss.shed || 'General/Store';
    shedBreakdown[shedKey] = (shedBreakdown[shedKey] || 0) + iss.quantity;
  }
  res.json({
    success: true,
    batch: {
      ...batch,
      totalIssued: totalIssuedQty,
      shedBreakdown,
      issuesCount: issues.length,
      transactionsCount: transactions.length
    },
    timeline: {
      receipt: batch.receipt,
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
  const { medicine, transactionType, startDate, endDate, limit = 50, page = 1 } = req.query;
  const filter = {};
  if (medicine) filter.medicine = medicine;
  if (transactionType) filter.transactionType = transactionType;
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
      .populate('medicine', 'code name unit')
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
  if (farm) filter.farm = farm;
  if (startDate || endDate) {
    filter.issueDate = {};
    if (startDate) filter.issueDate.$gte = startDate;
    if (endDate) filter.issueDate.$lte = endDate;
  }

  // Fetch all issues matching filter with medicine details
  const issues = await MedicineIssue.find(filter)
    .populate('medicine', 'code name unit category')
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