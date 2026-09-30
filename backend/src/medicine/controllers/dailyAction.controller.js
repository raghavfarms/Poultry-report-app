import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import MedicineIssue from '../models/MedicineIssue.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import Firm from '../../models/Firm.js';
import User from '../../models/User.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// Helper: Safely resolve User ID for audit logs and ledger transactions
async function getActionUserId(req) {
  if (req.user && req.user._id) return req.user._id;
  const fallback = await User.findOne().select('_id').lean();
  return fallback?._id || null;
}

// Helper: Auto-generate sequential Receipt Number: RCP-YYYY-XXXX
async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const last = await MedicineReceipt.findOne({ receiptNumber: new RegExp(`^${prefix}`) })
    .sort({ receiptNumber: -1 })
    .lean();

  let nextSeq = 1;
  if (last && last.receiptNumber) {
    const num = parseInt(last.receiptNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

// Helper: Auto-generate sequential Issue Number: ISS-YYYY-XXXX
async function generateIssueNumber() {
  const year = new Date().getFullYear();
  const prefix = `ISS-${year}-`;
  const last = await MedicineIssue.findOne({ issueNumber: new RegExp(`^${prefix}`) })
    .sort({ issueNumber: -1 })
    .lean();

  let nextSeq = 1;
  if (last && last.issueNumber) {
    const num = parseInt(last.issueNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * 1. FAST INWARD (Medicine Arrived)
 * Single-click entry: Scanned/typed batch + expiry + quantity -> Instantly active in stock!
 */
export async function fastInward(req, res) {
  try {
    const {
      medicineId,
      batchNumber,
      expiryDate,
      manufacturingDate,
      quantity,
      farmId,
      supplierId,
      invoiceNo,
      notes,
    } = req.body;

    // 1. Validation
    if (!medicineId) throw badRequest('Medicine selection is required');
    if (!batchNumber || !batchNumber.trim()) throw badRequest('Batch number is required');
    if (!expiryDate) throw badRequest('Expiry date is required');
    const qty = Number(quantity);
    if (!qty || qty <= 0) throw badRequest('Quantity must be greater than 0');

    // 2. Fetch Medicine and Farm
    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine) throw notFoundError('Medicine not found');

    let farm = farmId;
    if (!farm) {
      if (req.user?.firm) {
        farm = req.user.firm;
      } else {
        const defaultFarm = await Firm.findOne({ active: true }).select('_id').lean()
          || await Firm.findOne().select('_id').lean();
        if (!defaultFarm) throw badRequest('No farm location configured in system');
        farm = defaultFarm._id;
      }
    }

    const cleanBatchNo = batchNumber.trim().toUpperCase();

    // 3. Find or Create MedicineBatch (At this farm)
    let batch = await MedicineBatch.findOne({
      medicine: medicine._id,
      batchNumber: cleanBatchNo,
      farm,
    });

    if (batch) {
      // Increment existing batch quantity
      batch.quantityAvailable += qty;
      batch.initialQuantity += qty;
      batch.status = 'AVAILABLE';
      if (expiryDate) batch.expiryDate = expiryDate;
      await batch.save();
    } else {
      // Create new batch record
      batch = await MedicineBatch.create({
        medicine: medicine._id,
        batchNumber: cleanBatchNo,
        farm,
        supplier: supplierId || null,
        manufacturingDate: manufacturingDate || null,
        expiryDate,
        initialQuantity: qty,
        quantityAvailable: qty,
        unit: medicine.unit,
        status: 'AVAILABLE', // Instantly available for use!
      });
    }

    const userId = await getActionUserId(req);

    // 4. Create Receipt log for official tracking & audit
    const receiptNumber = await generateReceiptNumber();
    const receipt = await MedicineReceipt.create({
      receiptNumber,
      medicine: medicine._id,
      supplier: supplierId || null,
      farm,
      batchNumber: cleanBatchNo,
      manufacturingDate: manufacturingDate || null,
      expiryDate,
      receivedQuantity: qty,
      unit: medicine.unit,
      invoiceOrChallanNo: invoiceNo || '',
      status: 'STORE_ACCEPTED', // Directly accepted into farm store!
      acceptedAt: new Date(),
      acceptedBy: userId,
      receivedBy: userId,
      notes: notes || 'Fast Inward via Scanner / Quick Action',
    });

    // 5. Create Ledger Transaction (Keeps reports & dashboards 100% in sync)
    await MedicineTransaction.create({
      transactionType: 'RECEIPT_INWARD',
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: cleanBatchNo,
      farm,
      quantity: qty,
      balanceAfter: batch.quantityAvailable,
      unit: medicine.unit,
      referenceModel: 'MedicineReceipt',
      referenceId: receipt._id,
      performedBy: userId,
      remarks: `Quick Inward: ${qty} ${medicine.unit} (Batch: ${cleanBatchNo})`,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully received ${qty} ${medicine.unit} of ${medicine.name}`,
      data: {
        batchId: batch._id,
        receiptNumber,
        batchNumber: cleanBatchNo,
        currentStock: batch.quantityAvailable,
      },
    });
  } catch (err) {
    console.error('fastInward error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to process inward medicine',
    });
  }
}

/**
 * 2. FAST OUTWARD (Give to Birds / Shed Dose)
 * Automatic FEFO: Worker picks Shed + Medicine + Quantity -> System deducts from earliest expiring batch!
 */
export async function fastOutward(req, res) {
  try {
    const {
      medicineId,
      quantity,
      shedName,
      farmId,
      notes,
    } = req.body;

    const userId = await getActionUserId(req);

    // 1. Validation
    if (!medicineId) throw badRequest('Medicine selection is required');
    if (!shedName || !shedName.trim()) throw badRequest('Shed name/number is required');
    const qtyToDeduct = Number(quantity);
    if (!qtyToDeduct || qtyToDeduct <= 0) throw badRequest('Quantity must be greater than 0');

    // 2. Fetch Medicine
    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine) throw notFoundError('Medicine not found');

    // 3. Build Batch Query Filter
    // If farmId is specified, search at that farm.
    // If not specified: check user farm or search all available batches so stock is never falsely reported as 0.
    const batchFilter = {
      medicine: medicine._id,
      quantityAvailable: { $gt: 0 },
      status: { $in: ['AVAILABLE', 'EXPIRED'] }, // Allow issuing even if soon/flagged unless depleted
    };

    if (farmId) {
      batchFilter.farm = farmId;
    } else if (req.user?.firm) {
      // Check if user's assigned firm has stock
      const userFirmStock = await MedicineBatch.countDocuments({
        ...batchFilter,
        farm: req.user.firm,
      });
      if (userFirmStock > 0) {
        batchFilter.farm = req.user.firm;
      }
    }

    // Find all available batches for this medicine, SORTED BY EXPIRY (FEFO)!
    const availableBatches = await MedicineBatch.find(batchFilter)
      .populate('farm', 'name code')
      .sort({ expiryDate: 1 }); // Earliest expiry first (FEFO)

    // Reconcile each batch with its actual saved issues to heal any discrepancy from past validation failures
    for (const b of availableBatches) {
      const issues = await MedicineIssue.find({ batch: b._id }).select('issuedQuantity').lean();
      const totalIssued = issues.reduce((sum, i) => sum + (i.issuedQuantity || 0), 0);
      const correctAvailable = Math.max(0, (b.initialQuantity || 0) - totalIssued);
      if (b.quantityAvailable !== correctAvailable) {
        await MedicineBatch.updateOne(
          { _id: b._id },
          { $set: { quantityAvailable: correctAvailable, status: correctAvailable === 0 ? 'DEPLETED' : 'AVAILABLE' } }
        );
        b.quantityAvailable = correctAvailable;
        b.status = correctAvailable === 0 ? 'DEPLETED' : 'AVAILABLE';
      }
    }

    // Calculate total stock available across all batches
    const totalAvailable = availableBatches.reduce((sum, b) => sum + (b.quantityAvailable || 0), 0);
    if (totalAvailable < qtyToDeduct) {
      throw badRequest(
        `Insufficient stock for ${medicine.name}. Available: ${totalAvailable} ${medicine.unit}, Requested: ${qtyToDeduct} ${medicine.unit}`
      );
    }

    // 4. Deduct quantity across batches using FEFO
    let remaining = qtyToDeduct;
    const deductions = [];

    for (const batch of availableBatches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.quantityAvailable, remaining);

      // Ensure farm is tied to the physical batch's farm
      let batchFarmId = batch.farm?._id || batch.farm || farmId || req.user?.firm;
      if (!batchFarmId) {
        const fallbackFirm = await Firm.findOne().select('_id').lean();
        batchFarmId = fallbackFirm?._id;
      }

      // Generate Issue Number for this deduction
      const issueNumber = await generateIssueNumber();

      // 1. Create Issue Record FIRST (with all mandatory Mongoose schema fields: shed, purpose, issuedTo, issuedBy)
      const issue = await MedicineIssue.create({
        issueNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        medicine: medicine._id,
        batch: batch._id,
        batchNumber: batch.batchNumber,
        farm: batchFarmId,
        destinationType: 'SHED',
        destinationName: shedName.trim(),
        shed: shedName.trim(), // Mandatory field in MedicineIssue schema
        purpose: 'TREATMENT',  // Mandatory field in MedicineIssue schema
        issuedTo: req.body.issuedTo?.trim() || `${shedName.trim()} Staff`,
        issuedQuantity: take,
        unit: medicine.unit,
        issuedBy: userId,
        notes: notes || `Given to ${shedName.trim()}`,
      });

      // 2. Create Ledger Transaction (All required fields: unit, referenceModel, referenceId, performedBy)
      await MedicineTransaction.create({
        transactionType: 'ISSUE_OUTWARD',
        medicine: medicine._id,
        batch: batch._id,
        batchNumber: batch.batchNumber,
        farm: batchFarmId,
        quantity: take,
        balanceAfter: batch.quantityAvailable - take,
        unit: medicine.unit,
        referenceModel: 'MedicineIssue',
        referenceId: issue._id,
        performedBy: userId,
        remarks: `Given to ${shedName.trim()} (${take} ${medicine.unit})`,
      });

      // 3. Update and persist batch balance ONLY after issue & ledger succeed
      batch.quantityAvailable -= take;
      remaining -= take;

      if (batch.quantityAvailable === 0) {
        batch.status = 'DEPLETED';
      }
      await batch.save();

      deductions.push({
        batchNumber: batch.batchNumber,
        deducted: take,
        balanceLeft: batch.quantityAvailable,
        farm: batch.farm?.name || '',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Issued ${qtyToDeduct} ${medicine.unit} of ${medicine.name} to ${shedName.trim()}`,
      data: {
        medicineName: medicine.name,
        shedName: shedName.trim(),
        totalDeducted: qtyToDeduct,
        remainingStock: totalAvailable - qtyToDeduct,
        deductions,
      },
    });
  } catch (err) {
    console.error('fastOutward error:', err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to issue medicine',
    });
  }
}

/**
 * 3. GET TODAY'S ACTIVITY FEED
 * Fetches everything that came IN and went OUT today, sorted chronologically!
 */
export async function getTodayActivity(req, res) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Fetch Today's Inwards
    const receipts = await MedicineReceipt.find({
      createdAt: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('medicine', 'name code unit')
      .populate('receivedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch Today's Outwards
    const issues = await MedicineIssue.find({
      createdAt: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('medicine', 'name code unit')
      .populate('issuedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // 3. Format unified event stream
    const events = [];

    for (const r of receipts) {
      events.push({
        id: r._id,
        type: 'IN',
        timestamp: r.createdAt,
        medicineName: r.medicine?.name || 'Medicine',
        medicineCode: r.medicine?.code || '',
        batchNumber: r.batchNumber,
        expiryDate: r.expiryDate,
        quantity: r.receivedQuantity,
        unit: r.unit,
        operator: r.receivedBy?.name || 'Worker',
        target: 'Store Cupboard',
      });
    }

    for (const i of issues) {
      events.push({
        id: i._id,
        type: 'OUT',
        timestamp: i.createdAt,
        medicineName: i.medicine?.name || 'Medicine',
        medicineCode: i.medicine?.code || '',
        batchNumber: i.batchNumber,
        quantity: i.issuedQuantity,
        unit: i.unit,
        operator: i.issuedBy?.name || 'Worker',
        target: i.destinationName || 'Shed',
        notes: i.notes || '',
      });
    }

    // Sort by latest timestamp first
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (err) {
    console.error('getTodayActivity error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch today activity',
    });
  }
}
