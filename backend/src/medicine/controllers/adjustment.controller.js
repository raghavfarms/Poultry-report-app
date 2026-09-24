import MedicineAdjustment from '../models/MedicineAdjustment.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import MedicineMaster from '../models/MedicineMaster.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// Helper: Auto-generate sequential Adjustment Number: ADJ-YYYY-XXXX
async function generateAdjustmentNumber() {
  const year = new Date().getFullYear();
  const prefix = `ADJ-${year}-`;

  const lastAdj = await MedicineAdjustment.findOne({
    adjustmentNumber: new RegExp(`^${prefix}`),
  })
    .sort({ adjustmentNumber: -1 })
    .lean();

  let nextSequence = 1;
  if (lastAdj && lastAdj.adjustmentNumber) {
    const lastNumStr = lastAdj.adjustmentNumber.replace(prefix, '');
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextSequence = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

/**
 * POST /api/medicine/adjustments/return
 * Return unused sealed medicine from a shed back to the farm store
 */
export async function createReturnInward(req, res) {
  try {
    const {
      medicineId,
      batchId,
      farmId,
      shed,
      quantity,
      reason,
      returnedBy,
      adjustmentDate,
      remarks,
    } = req.body;

    if (!medicineId || !batchId || !farmId || !shed || !quantity || !reason) {
      return badRequest(res, 'Medicine, Batch, Farm, Shed, Quantity, and Reason are required');
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return badRequest(res, 'Return quantity must be a positive number');
    }

    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine) return notFoundError(res, 'Medicine not found');

    const farm = await Firm.findById(farmId);
    if (!farm) return notFoundError(res, 'Farm not found');

    const batch = await MedicineBatch.findById(batchId);
    if (!batch) return notFoundError(res, 'Batch not found');

    // 1. Atomically increment batch stock & ensure status is AVAILABLE
    const updatedBatch = await MedicineBatch.findByIdAndUpdate(
      batch._id,
      {
        $inc: { quantityAvailable: qty },
        status: 'AVAILABLE', // In case batch was DEPLETED
      },
      { new: true }
    );

    // 2. Generate Adjustment ID & Save Adjustment Record
    const adjustmentNumber = await generateAdjustmentNumber();
    const newAdj = await MedicineAdjustment.create({
      adjustmentNumber,
      type: 'RETURN_INWARD',
      adjustmentDate: adjustmentDate || new Date().toISOString().slice(0, 10),
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      shed: shed.trim(),
      quantity: qty,
      unit: medicine.unit,
      reason: reason.trim(),
      witnessedBy: returnedBy ? `Returned by: ${returnedBy.trim()}` : '',
      adjustedBy: req.user._id,
      remarks: remarks?.trim() || '',
    });

    // 3. Write Immutable Audit Trail to MedicineTransaction
    await MedicineTransaction.create({
      transactionType: 'RETURN_INWARD',
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      quantity: qty,
      unit: medicine.unit,
      balanceAfter: updatedBatch.quantityAvailable,
      referenceModel: 'MedicineAdjustment',
      referenceId: newAdj._id,
      performedBy: req.user._id,
      remarks: `Shed Return from ${shed.trim()} (${reason.trim()})${returnedBy ? ` • Returned by: ${returnedBy.trim()}` : ''}`,
    });

    const populated = await MedicineAdjustment.findById(newAdj._id)
      .populate('medicine', 'name code unit')
      .populate('farm', 'name code')
      .populate('adjustedBy', 'username name');

    return res.status(201).json({
      success: true,
      message: `Successfully returned ${qty} ${medicine.unit} from ${shed} to Batch ${batch.batchNumber}`,
      adjustment: populated,
      newBatchBalance: updatedBatch.quantityAvailable,
    });
  } catch (error) {
    console.error('createReturnInward error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/medicine/adjustments/stock-audit
 * Physical stock count adjustment (surplus or shortage/breakage)
 */
export async function createStockAdjustment(req, res) {
  try {
    const {
      medicineId,
      batchId,
      farmId,
      direction, // 'IN' (surplus) or 'OUT' (breakage / shortage)
      quantity,
      reason,
      witnessedBy,
      adjustmentDate,
      remarks,
    } = req.body;

    if (!medicineId || !batchId || !farmId || !direction || !quantity || !reason) {
      return badRequest(res, 'Medicine, Batch, Farm, Direction (IN/OUT), Quantity, and Reason are required');
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return badRequest(res, 'Adjustment quantity must be a positive number');
    }

    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine) return notFoundError(res, 'Medicine not found');

    const farm = await Firm.findById(farmId);
    if (!farm) return notFoundError(res, 'Farm not found');

    const batch = await MedicineBatch.findById(batchId);
    if (!batch) return notFoundError(res, 'Batch not found');

    let updatedBatch;
    let transactionType;

    if (direction.toUpperCase() === 'IN') {
      transactionType = 'ADJUSTMENT_IN';
      updatedBatch = await MedicineBatch.findByIdAndUpdate(
        batch._id,
        {
          $inc: { quantityAvailable: qty },
          status: 'AVAILABLE',
        },
        { new: true }
      );
    } else {
      transactionType = 'ADJUSTMENT_OUT';
      // Concurrency guard: cannot reduce below zero
      updatedBatch = await MedicineBatch.findOneAndUpdate(
        {
          _id: batch._id,
          quantityAvailable: { $gte: qty },
        },
        {
          $inc: { quantityAvailable: -qty },
        },
        { new: true }
      );

      if (!updatedBatch) {
        return badRequest(
          res,
          `Cannot reduce stock by ${qty}. Available stock in Batch ${batch.batchNumber} is only ${batch.quantityAvailable}`
        );
      }

      if (updatedBatch.quantityAvailable === 0) {
        updatedBatch.status = 'DEPLETED';
        await updatedBatch.save();
      }
    }

    const adjustmentNumber = await generateAdjustmentNumber();
    const newAdj = await MedicineAdjustment.create({
      adjustmentNumber,
      type: transactionType,
      adjustmentDate: adjustmentDate || new Date().toISOString().slice(0, 10),
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      quantity: qty,
      unit: medicine.unit,
      reason: reason.trim(),
      witnessedBy: witnessedBy?.trim() || '',
      adjustedBy: req.user._id,
      remarks: remarks?.trim() || '',
    });

    await MedicineTransaction.create({
      transactionType,
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      quantity: qty,
      unit: medicine.unit,
      balanceAfter: updatedBatch.quantityAvailable,
      referenceModel: 'MedicineAdjustment',
      referenceId: newAdj._id,
      performedBy: req.user._id,
      remarks: `Physical Audit Adjustment: ${reason.trim()}${witnessedBy ? ` • Witness: ${witnessedBy.trim()}` : ''}`,
    });

    const populated = await MedicineAdjustment.findById(newAdj._id)
      .populate('medicine', 'name code unit')
      .populate('farm', 'name code')
      .populate('adjustedBy', 'username name');

    return res.status(201).json({
      success: true,
      message: `Stock adjustment recorded (${direction.toUpperCase() === 'IN' ? '+' : '-'}${qty} ${medicine.unit}). New balance: ${updatedBatch.quantityAvailable}`,
      adjustment: populated,
      newBatchBalance: updatedBatch.quantityAvailable,
    });
  } catch (error) {
    console.error('createStockAdjustment error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/medicine/adjustments/disposal
 * Safe biosecurity disposal write-off of expired or spoiled medicines
 */
export async function createDisposal(req, res) {
  try {
    const {
      medicineId,
      batchId,
      farmId,
      quantity, // optional; if omitted, disposes all remaining batch stock
      disposalMethod,
      reason,
      witnessedBy,
      adjustmentDate,
      remarks,
    } = req.body;

    if (!medicineId || !batchId || !farmId || !disposalMethod || !reason || !witnessedBy) {
      return badRequest(res, 'Medicine, Batch, Farm, Disposal Method, Reason, and Witness are required for biosecurity disposal');
    }

    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine) return notFoundError(res, 'Medicine not found');

    const farm = await Firm.findById(farmId);
    if (!farm) return notFoundError(res, 'Farm not found');

    const batch = await MedicineBatch.findById(batchId);
    if (!batch) return notFoundError(res, 'Batch not found');

    const qtyToDispose = quantity ? Number(quantity) : batch.quantityAvailable;

    if (qtyToDispose <= 0) {
      return badRequest(res, 'Batch has no available stock to dispose');
    }

    if (qtyToDispose > batch.quantityAvailable) {
      return badRequest(
        res,
        `Cannot dispose ${qtyToDispose}. Available stock in Batch ${batch.batchNumber} is only ${batch.quantityAvailable}`
      );
    }

    // Decrement stock
    const updatedBatch = await MedicineBatch.findByIdAndUpdate(
      batch._id,
      {
        $inc: { quantityAvailable: -qtyToDispose },
        status: (batch.quantityAvailable - qtyToDispose <= 0) ? 'EXPIRED' : batch.status,
      },
      { new: true }
    );

    const adjustmentNumber = await generateAdjustmentNumber();
    const newAdj = await MedicineAdjustment.create({
      adjustmentNumber,
      type: 'DISPOSAL_EXPIRED',
      adjustmentDate: adjustmentDate || new Date().toISOString().slice(0, 10),
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      quantity: qtyToDispose,
      unit: medicine.unit,
      reason: reason.trim(),
      disposalMethod: disposalMethod.trim(),
      witnessedBy: witnessedBy.trim(),
      adjustedBy: req.user._id,
      remarks: remarks?.trim() || '',
    });

    await MedicineTransaction.create({
      transactionType: 'DISPOSAL_EXPIRED',
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: batch.batchNumber,
      farm: farm._id,
      quantity: qtyToDispose,
      unit: medicine.unit,
      balanceAfter: updatedBatch.quantityAvailable,
      referenceModel: 'MedicineAdjustment',
      referenceId: newAdj._id,
      performedBy: req.user._id,
      remarks: `Safe Disposal: ${reason.trim()} via ${disposalMethod.trim()} • Witness: ${witnessedBy.trim()}`,
    });

    const populated = await MedicineAdjustment.findById(newAdj._id)
      .populate('medicine', 'name code unit')
      .populate('farm', 'name code')
      .populate('adjustedBy', 'username name');

    return res.status(201).json({
      success: true,
      message: `Safely disposed ${qtyToDispose} ${medicine.unit} from Batch ${batch.batchNumber} via ${disposalMethod}`,
      adjustment: populated,
      newBatchBalance: updatedBatch.quantityAvailable,
    });
  } catch (error) {
    console.error('createDisposal error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/medicine/adjustments
 * List all adjustments with filters
 */
export async function getAdjustments(req, res) {
  try {
    const {
      type,
      medicine,
      farm,
      search,
      startDate,
      endDate,
      page = 1,
      limit = 25,
    } = req.query;

    const query = {};

    if (type) query.type = type;
    if (medicine) query.medicine = medicine;
    if (farm) query.farm = farm;

    if (startDate || endDate) {
      query.adjustmentDate = {};
      if (startDate) query.adjustmentDate.$gte = startDate;
      if (endDate) query.adjustmentDate.$lte = endDate;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { adjustmentNumber: searchRegex },
        { batchNumber: searchRegex },
        { shed: searchRegex },
        { reason: searchRegex },
        { witnessedBy: searchRegex },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [adjustments, total] = await Promise.all([
      MedicineAdjustment.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('medicine', 'name code unit category')
        .populate('batch', 'batchNumber expiryDate quantityAvailable status')
        .populate('farm', 'name code')
        .populate('adjustedBy', 'username name')
        .lean(),
      MedicineAdjustment.countDocuments(query),
    ]);

    return res.json({
      success: true,
      adjustments,
      pagination: {
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('getAdjustments error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/medicine/adjustments/:id
 * Single adjustment details
 */
export async function getAdjustmentById(req, res) {
  try {
    const { id } = req.params;
    const adjustment = await MedicineAdjustment.findById(id)
      .populate('medicine', 'name code unit category')
      .populate('batch', 'batchNumber manufacturingDate expiryDate quantityAvailable status')
      .populate('farm', 'name code')
      .populate('adjustedBy', 'username name email');

    if (!adjustment) return notFoundError(res, 'Adjustment record not found');

    return res.json({ success: true, adjustment });
  } catch (error) {
    console.error('getAdjustmentById error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
