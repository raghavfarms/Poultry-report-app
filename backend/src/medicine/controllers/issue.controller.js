import MedicineIssue from '../models/MedicineIssue.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import MedicineMaster from '../models/MedicineMaster.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// Helper: Auto-generate sequential Issue Number: ISS-YYYY-XXXX (e.g. ISS-2026-0001)
async function generateIssueNumber() {
  const year = new Date().getFullYear();
  const prefix = `ISS-${year}-`;

  const lastIssue = await MedicineIssue.findOne({
    issueNumber: new RegExp(`^${prefix}`),
  })
    .sort({ issueNumber: -1 })
    .lean();

  let nextSequence = 1;
  if (lastIssue && lastIssue.issueNumber) {
    const lastNumStr = lastIssue.issueNumber.replace(prefix, '');
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextSequence = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

/**
 * GET /api/medicine/issues/fefo-recommendations
 * Query params: medicineId, farmId
 * Returns all active batches sorted by FEFO (earliest expiry first),
 * highlighting the optimal batch to issue.
 */
export async function getFefoRecommendations(req, res) {
  try {
    const { medicineId, farmId } = req.query;

    if (!medicineId || !farmId) {
      return badRequest(res, 'Both medicineId and farmId query parameters are required for FEFO suggestions');
    }

    // Fetch batches with available stock, strictly ordered by expiryDate ASC
    const batches = await MedicineBatch.find({
      medicine: medicineId,
      farm: farmId,
      quantityAvailable: { $gt: 0 },
      status: 'AVAILABLE',
    })
      .sort({ expiryDate: 1 }) // FEFO principle: earliest expiry first
      .populate('supplier', 'name code')
      .lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let firstEligibleFound = false;

    const enrichedBatches = batches.map((batch) => {
      const expDate = new Date(batch.expiryDate);
      const diffTime = expDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let expiryStatus = 'VALID';
      if (daysLeft < 0) {
        expiryStatus = 'EXPIRED';
      } else if (daysLeft <= 30) {
        expiryStatus = 'EXPIRING_30_DAYS';
      } else if (daysLeft <= 60) {
        expiryStatus = 'EXPIRING_60_DAYS';
      }

      // First batch with positive days left is FEFO recommended
      let isFefoRecommended = false;
      if (!firstEligibleFound && daysLeft >= 0) {
        isFefoRecommended = true;
        firstEligibleFound = true;
      }

      return {
        ...batch,
        daysLeft,
        expiryStatus,
        isFefoRecommended,
      };
    });

    return res.json({
      success: true,
      recommendations: enrichedBatches,
    });
  } catch (error) {
    console.error('getFefoRecommendations error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/medicine/issues
 * Create a new medicine issue to a shed/flock with atomic FEFO stock deduction
 */
export async function createIssue(req, res) {
  try {
    const {
      medicineId,
      batchId,
      farmId,
      shed,
      flockNumber,
      birdCount,
      birdAgeDays,
      issuedQuantity,
      purpose,
      dosageInstructions,
      issuedTo,
      issueDate,
      remarks,
    } = req.body;

    // 1. Basic validation
    if (!medicineId || !batchId || !farmId || !shed || !issuedQuantity || !issuedTo) {
      return badRequest(res, 'Medicine, Batch, Farm, Shed, Quantity, and Recipient are required');
    }

    const qty = Number(issuedQuantity);
    if (isNaN(qty) || qty <= 0) {
      return badRequest(res, 'Issued quantity must be a positive number');
    }

    // 2. Validate Medicine
    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine || !medicine.active) {
      return badRequest(res, 'Selected medicine is inactive or does not exist');
    }

    // 3. Validate Farm
    const farm = await Firm.findById(farmId);
    if (!farm || !farm.active) {
      return badRequest(res, 'Selected farm is inactive or does not exist');
    }

    // 4. Validate Batch
    const batch = await MedicineBatch.findById(batchId);
    if (!batch) {
      return notFoundError(res, 'Medicine batch not found');
    }

    if (String(batch.medicine) !== String(medicineId) || String(batch.farm) !== String(farmId)) {
      return badRequest(res, 'Batch does not belong to the selected medicine or farm');
    }

    if (batch.status !== 'AVAILABLE') {
      return badRequest(res, `Batch is not available for issue (Status: ${batch.status})`);
    }

    // Check expiry safety: Never issue expired medicine to birds
    const todayStr = new Date().toISOString().slice(0, 10);
    if (batch.expiryDate < todayStr) {
      return badRequest(res, `Cannot issue expired medicine! Batch ${batch.batchNumber} expired on ${batch.expiryDate}`);
    }

    // 5. ATOMIC Concurrency Guarded Decrement
    // Only decrements if quantityAvailable >= qty
    const updatedBatch = await MedicineBatch.findOneAndUpdate(
      {
        _id: batch._id,
        quantityAvailable: { $gte: qty },
        status: 'AVAILABLE',
      },
      {
        $inc: { quantityAvailable: -qty },
      },
      { new: true }
    );

    if (!updatedBatch) {
      return badRequest(
        res,
        `Insufficient stock available in Batch ${batch.batchNumber}. Available: ${batch.quantityAvailable}, Requested: ${qty}`
      );
    }

    // If batch is fully exhausted, mark it DEPLETED
    if (updatedBatch.quantityAvailable === 0) {
      updatedBatch.status = 'DEPLETED';
      await updatedBatch.save();
    }

    // 6. Generate Issue Number & Save Record
    const issueNumber = await generateIssueNumber();

    const newIssue = await MedicineIssue.create({
      issueNumber,
      issueDate: issueDate || todayStr,
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      shed: shed.trim(),
      flockNumber: flockNumber?.trim() || '',
      birdCount: Number(birdCount) || 0,
      birdAgeDays: Number(birdAgeDays) || 0,
      issuedQuantity: qty,
      unit: medicine.unit,
      purpose: purpose || 'TREATMENT',
      dosageInstructions: dosageInstructions?.trim() || '',
      issuedTo: issuedTo.trim(),
      issuedBy: req.user._id,
      remarks: remarks?.trim() || '',
    });

    // 7. Write Immutable Audit Trail to MedicineTransaction
    await MedicineTransaction.create({
      transactionType: 'ISSUE_OUTWARD',
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      quantity: qty,
      unit: medicine.unit,
      balanceAfter: updatedBatch.quantityAvailable,
      referenceModel: 'MedicineIssue',
      referenceId: newIssue._id,
      performedBy: req.user._id,
      remarks: `Issued to ${shed.trim()} (${purpose || 'TREATMENT'}). Recipient: ${issuedTo.trim()}${
        dosageInstructions ? ` • Dosage: ${dosageInstructions.trim()}` : ''
      }`,
    });

    // Populate and return
    const populatedIssue = await MedicineIssue.findById(newIssue._id)
      .populate('medicine', 'name code unit category')
      .populate('farm', 'name code')
      .populate('issuedBy', 'username name email');

    return res.status(201).json({
      success: true,
      message: `Stock successfully issued from Batch ${batch.batchNumber} (Remaining: ${updatedBatch.quantityAvailable} ${medicine.unit})`,
      issue: populatedIssue,
      batchRemaining: updatedBatch.quantityAvailable,
    });
  } catch (error) {
    console.error('createIssue error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/medicine/issues
 * Fetch list of medicine issues with filtering & pagination
 */
export async function getIssues(req, res) {
  try {
    const {
      search,
      farm,
      medicine,
      shed,
      purpose,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};

    if (farm) {
      query.farm = farm;
    }

    if (medicine) {
      query.medicine = medicine;
    }

    if (shed) {
      query.shed = new RegExp(shed.trim(), 'i');
    }

    if (purpose) {
      query.purpose = purpose;
    }

    if (startDate || endDate) {
      query.issueDate = {};
      if (startDate) query.issueDate.$gte = startDate;
      if (endDate) query.issueDate.$lte = endDate;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { issueNumber: searchRegex },
        { batchNumber: searchRegex },
        { shed: searchRegex },
        { flockNumber: searchRegex },
        { issuedTo: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [issues, total] = await Promise.all([
      MedicineIssue.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('medicine', 'code name unit category')
        .populate('batch', 'batchNumber expiryDate quantityAvailable status')
        .populate('farm', 'name code')
        .populate('issuedBy', 'username name')
        .lean(),
      MedicineIssue.countDocuments(query),
    ]);

    return res.json({
      success: true,
      issues,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('getIssues error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/medicine/issues/:id
 * Fetch single issue details
 */
export async function getIssueById(req, res) {
  try {
    const { id } = req.params;
    const issue = await MedicineIssue.findById(id)
      .populate('medicine', 'code name unit category manufacturer')
      .populate('batch', 'batchNumber manufacturingDate expiryDate quantityAvailable status')
      .populate('farm', 'name code')
      .populate('issuedBy', 'username name email');

    if (!issue) {
      return notFoundError(res, 'Medicine issue record not found');
    }

    return res.json({ success: true, issue });
  } catch (error) {
    console.error('getIssueById error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
