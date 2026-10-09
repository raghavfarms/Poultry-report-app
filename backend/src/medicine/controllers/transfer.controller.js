import mongoose from 'mongoose';
import MedicineTransfer from '../models/MedicineTransfer.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError as notFound, forbiddenError as forbidden } from '../../utils/http.js';

// Helper to generate unique human-readable transfer number (e.g. TRF-20261009-001)
async function generateTransferNumber() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `TRF-${dateStr}-`;
  const count = await MedicineTransfer.countDocuments({
    transferNumber: { $regex: `^${prefix}` },
  });
  const seq = String(count + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

/**
 * 1. POST /api/medicine/transfers
 * Initiates an inter-firm transfer.
 * Places the specified quantity ON HOLD at source batch and reduces quantityAvailable.
 */
export async function createTransfer(req, res) {
  const { fromFarm, toFarm, sourceBatchId, quantity, items, transportDetails } = req.body;

  if (!fromFarm || !toFarm) throw badRequest('Both source farm and destination farm are required.');
  if (fromFarm.toString() === toFarm.toString()) throw badRequest('Source and destination farms cannot be the same.');

  // Normalize into transferItems array
  let transferItems = [];
  if (Array.isArray(items) && items.length > 0) {
    transferItems = items.filter((it) => it.sourceBatchId && Number(it.quantity) > 0);
  } else if (sourceBatchId && Number(quantity) > 0) {
    transferItems = [{ sourceBatchId, quantity: Number(quantity) }];
  }

  if (transferItems.length === 0) {
    throw badRequest('Please enter transfer quantity for at least one batch.');
  }

  // Check firms exist
  const [sourceFirm, destFirm] = await Promise.all([
    Firm.findById(fromFarm),
    Firm.findById(toFarm),
  ]);
  if (!sourceFirm) throw notFound('Source farm not found.');
  if (!destFirm) throw notFound('Destination farm not found.');

  const createdTransfers = [];

  for (const item of transferItems) {
    const transferQty = Number(item.quantity);
    if (!transferQty || transferQty <= 0) continue;

    const batch = await MedicineBatch.findOne({
      _id: item.sourceBatchId,
      farm: fromFarm,
    }).populate('medicine');

    if (!batch) throw notFound(`Batch not found at source farm.`);
    if (batch.status === 'EXPIRED') throw badRequest(`Cannot transfer expired batch #${batch.batchNumber}.`);
    if (batch.quantityAvailable < transferQty) {
      throw badRequest(`Insufficient available stock for batch #${batch.batchNumber}. Currently available: ${batch.quantityAvailable} ${batch.unit}`);
    }

    // Deduct available & put on hold atomically
    batch.quantityAvailable = Math.max(0, batch.quantityAvailable - transferQty);
    batch.quantityOnHold = (batch.quantityOnHold || 0) + transferQty;
    if (batch.quantityAvailable === 0 && batch.quantityOnHold === 0) {
      batch.status = 'DEPLETED';
    }
    await batch.save();

    const transferNumber = await generateTransferNumber();

    const transfer = await MedicineTransfer.create({
      transferNumber,
      fromFarm,
      toFarm,
      medicine: batch.medicine._id,
      sourceBatch: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      manufacturingDate: batch.manufacturingDate || null,
      quantity: transferQty,
      unit: batch.unit,
      status: 'PENDING',
      transportDetails: transportDetails || {},
      requestedBy: req.user._id,
      requestedByName: req.user.name || 'Admin',
    });

    createdTransfers.push(transfer);
  }

  res.status(201).json({
    success: true,
    message: `${createdTransfers.length} transfer request(s) initiated. Stock is placed on hold.`,
    transfers: createdTransfers,
    transfer: createdTransfers[0],
  });
}

/**
 * 2. GET /api/medicine/transfers
 * List transfer audit records with optional filters (status, fromFarm, toFarm, medicine).
 */
export async function getTransfers(req, res) {
  const { status, farm, fromFarm, toFarm, direction, search, limit = 50, page = 1 } = req.query;

  const query = {};
  if (status) query.status = status;

  if (farm) {
    if (direction === 'incoming') {
      query.toFarm = farm;
    } else if (direction === 'outgoing') {
      query.fromFarm = farm;
    } else {
      query.$or = [{ fromFarm: farm }, { toFarm: farm }];
    }
  } else {
    if (fromFarm) query.fromFarm = fromFarm;
    if (toFarm) query.toFarm = toFarm;
  }

  let transfers = await MedicineTransfer.find(query)
    .populate('fromFarm', 'name code')
    .populate('toFarm', 'name code')
    .populate('medicine', 'name code unit category aliasName')
    .populate('sourceBatch', 'batchNumber expiryDate')
    .populate('destinationBatch', 'batchNumber expiryDate')
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .lean();

  if (search && search.trim()) {
    const s = search.trim().toLowerCase();
    transfers = transfers.filter(
      (t) =>
        t.transferNumber?.toLowerCase().includes(s) ||
        t.medicine?.name?.toLowerCase().includes(s) ||
        t.medicine?.code?.toLowerCase().includes(s) ||
        t.batchNumber?.toLowerCase().includes(s) ||
        t.fromFarm?.name?.toLowerCase().includes(s) ||
        t.toFarm?.name?.toLowerCase().includes(s)
    );
  }

  const total = await MedicineTransfer.countDocuments(query);

  res.json({
    success: true,
    total,
    transfers,
  });
}

/**
 * 3. GET /api/medicine/transfers/pending
 * Pending count and incoming requests (for notification bell/badge).
 */
export async function getPendingTransfers(req, res) {
  const { farm } = req.query;
  const query = { status: 'PENDING' };
  if (farm) {
    query.toFarm = farm;
  }

  const pendingList = await MedicineTransfer.find(query)
    .populate('fromFarm', 'name code')
    .populate('toFarm', 'name code')
    .populate('medicine', 'name code unit category aliasName')
    .populate('sourceBatch', 'batchNumber expiryDate quantityAvailable quantityOnHold')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: pendingList.length,
    transfers: pendingList,
  });
}

/**
 * 4. PATCH /api/medicine/transfers/:id/accept
 * Recipient accepts the transfer:
 * - Releases hold at source farm & permanently deducts (transferredOutQuantity)
 * - Logs TRANSFER_OUTWARD transaction at source farm
 * - Inwards exact batch at destination farm (creates or merges with same batchNumber & expiryDate)
 * - Logs TRANSFER_INWARD transaction at destination farm
 * - Marks transfer status as ACCEPTED
 */
export async function acceptTransfer(req, res) {
  const { id } = req.params;

  const transfer = await MedicineTransfer.findById(id).populate('medicine');
  if (!transfer) throw notFound('Transfer request not found.');
  if (transfer.status !== 'PENDING') {
    throw badRequest(`Cannot accept transfer with status: ${transfer.status}`);
  }

  const sourceBatch = await MedicineBatch.findById(transfer.sourceBatch);
  if (!sourceBatch) throw notFound('Source batch no longer exists.');

  // 1. Finalize source batch hold
  const holdQty = Number(transfer.quantity);
  sourceBatch.quantityOnHold = Math.max(0, (sourceBatch.quantityOnHold || 0) - holdQty);
  sourceBatch.transferredOutQuantity = (sourceBatch.transferredOutQuantity || 0) + holdQty;
  if (sourceBatch.quantityAvailable === 0 && sourceBatch.quantityOnHold === 0) {
    sourceBatch.status = 'DEPLETED';
  }
  await sourceBatch.save();

  // Log TRANSFER_OUTWARD at source farm
  await MedicineTransaction.create({
    transactionType: 'TRANSFER_OUTWARD',
    medicine: transfer.medicine._id,
    batch: sourceBatch._id,
    batchNumber: sourceBatch.batchNumber,
    farm: transfer.fromFarm,
    quantity: holdQty,
    balanceAfter: sourceBatch.quantityAvailable,
    unit: transfer.unit,
    referenceModel: 'MedicineTransfer',
    referenceId: transfer._id,
    performedBy: req.user._id,
    remarks: `Inter-farm transfer to ${transfer.toFarm}. Ref: ${transfer.transferNumber}`,
  });

  // 2. Inward at destination farm:
  // Check if destination farm already has this batch for this medicine
  let destBatch = await MedicineBatch.findOne({
    farm: transfer.toFarm,
    medicine: transfer.medicine._id,
    batchNumber: transfer.batchNumber,
  });

  if (destBatch) {
    destBatch.initialQuantity = (destBatch.initialQuantity || 0) + holdQty;
    destBatch.quantityAvailable = (destBatch.quantityAvailable || 0) + holdQty;
    if (destBatch.status === 'DEPLETED' && destBatch.quantityAvailable > 0) {
      destBatch.status = 'AVAILABLE';
    }
    await destBatch.save();
  } else {
    destBatch = await MedicineBatch.create({
      medicine: transfer.medicine._id,
      batchNumber: transfer.batchNumber,
      farm: transfer.toFarm,
      supplier: sourceBatch.supplier || null,
      firstReceipt: sourceBatch.firstReceipt || null,
      manufacturingDate: transfer.manufacturingDate || null,
      expiryDate: transfer.expiryDate,
      initialQuantity: holdQty,
      quantityAvailable: holdQty,
      quantityOnHold: 0,
      transferredOutQuantity: 0,
      disposedQuantity: 0,
      unit: transfer.unit,
      status: 'AVAILABLE',
    });
  }

  // Log TRANSFER_INWARD at destination farm
  await MedicineTransaction.create({
    transactionType: 'TRANSFER_INWARD',
    medicine: transfer.medicine._id,
    batch: destBatch._id,
    batchNumber: destBatch.batchNumber,
    farm: transfer.toFarm,
    quantity: holdQty,
    balanceAfter: destBatch.quantityAvailable,
    unit: transfer.unit,
    referenceModel: 'MedicineTransfer',
    referenceId: transfer._id,
    performedBy: req.user._id,
    remarks: `Inter-farm transfer received from ${transfer.fromFarm}. Ref: ${transfer.transferNumber}`,
  });

  // 3. Mark transfer as ACCEPTED
  transfer.status = 'ACCEPTED';
  transfer.destinationBatch = destBatch._id;
  transfer.actionedBy = req.user._id;
  transfer.actionedByName = req.user.name || 'Admin';
  transfer.actionedAt = new Date();
  await transfer.save();

  res.json({
    success: true,
    message: `Transfer accepted successfully. ${holdQty} ${transfer.unit} added to destination stock.`,
    transfer,
  });
}

/**
 * 5. PATCH /api/medicine/transfers/:id/reject
 * Recipient rejects the transfer:
 * - Releases hold and restores quantityAvailable at source farm
 * - Marks transfer status as REJECTED
 * - Records rejectionReason
 */
export async function rejectTransfer(req, res) {
  const { id } = req.params;
  const { reason = '' } = req.body;

  const transfer = await MedicineTransfer.findById(id);
  if (!transfer) throw notFound('Transfer request not found.');
  if (transfer.status !== 'PENDING') {
    throw badRequest(`Cannot reject transfer with status: ${transfer.status}`);
  }

  const sourceBatch = await MedicineBatch.findById(transfer.sourceBatch);
  if (sourceBatch) {
    const holdQty = Number(transfer.quantity);
    sourceBatch.quantityOnHold = Math.max(0, (sourceBatch.quantityOnHold || 0) - holdQty);
    sourceBatch.quantityAvailable = (sourceBatch.quantityAvailable || 0) + holdQty;
    if (sourceBatch.status === 'DEPLETED' && sourceBatch.quantityAvailable > 0) {
      sourceBatch.status = 'AVAILABLE';
    }
    await sourceBatch.save();
  }

  transfer.status = 'REJECTED';
  transfer.rejectionReason = (reason || '').trim() || 'Declined by recipient';
  transfer.actionedBy = req.user._id;
  transfer.actionedByName = req.user.name || 'Admin';
  transfer.actionedAt = new Date();
  await transfer.save();

  res.json({
    success: true,
    message: `Transfer rejected. ${transfer.quantity} ${transfer.unit} has been restored to source stock.`,
    transfer,
  });
}

/**
 * 6. PATCH /api/medicine/transfers/:id/cancel
 * Sender cancels pending transfer before acceptance:
 * - Releases hold and restores quantityAvailable at source farm
 * - Marks transfer status as CANCELLED
 */
export async function cancelTransfer(req, res) {
  const { id } = req.params;

  const transfer = await MedicineTransfer.findById(id);
  if (!transfer) throw notFound('Transfer request not found.');
  if (transfer.status !== 'PENDING') {
    throw badRequest(`Cannot cancel transfer with status: ${transfer.status}`);
  }

  const sourceBatch = await MedicineBatch.findById(transfer.sourceBatch);
  if (sourceBatch) {
    const holdQty = Number(transfer.quantity);
    sourceBatch.quantityOnHold = Math.max(0, (sourceBatch.quantityOnHold || 0) - holdQty);
    sourceBatch.quantityAvailable = (sourceBatch.quantityAvailable || 0) + holdQty;
    if (sourceBatch.status === 'DEPLETED' && sourceBatch.quantityAvailable > 0) {
      sourceBatch.status = 'AVAILABLE';
    }
    await sourceBatch.save();
  }

  transfer.status = 'CANCELLED';
  transfer.actionedBy = req.user._id;
  transfer.actionedByName = req.user.name || 'Admin';
  transfer.actionedAt = new Date();
  await transfer.save();

  res.json({
    success: true,
    message: `Transfer cancelled. Stock restored to source farm.`,
    transfer,
  });
}

/**
 * 7. GET /api/medicine/transfers/available-stock
 * Query: ?farm=:farmId
 * Returns all active batches with available stock for the specified farm, populated with medicine details.
 */
export async function getAvailableStockForTransfer(req, res) {
  const { farm } = req.query;
  if (!farm) throw badRequest('Source farm is required.');

  const batches = await MedicineBatch.find({
    farm,
    quantityAvailable: { $gt: 0 },
    status: { $ne: 'EXPIRED' },
  })
    .populate('medicine', 'name aliasName code unit category')
    .sort({ expiryDate: 1 })
    .lean();

  res.json({
    success: true,
    count: batches.length,
    batches: batches.filter((b) => Boolean(b.medicine)),
  });
}

