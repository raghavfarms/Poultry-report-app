import MedicineReceipt from '../models/MedicineReceipt.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import PurchaseOrder from '../models/PurchaseOrder.js';
import MedicineMaster from '../models/MedicineMaster.js';
import Supplier from '../models/Supplier.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// Helper: Auto-generate sequential Receipt Number: RCP-YYYY-XXXX (e.g. RCP-2026-0001)
async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;

  const lastReceipt = await MedicineReceipt.findOne({
    receiptNumber: new RegExp(`^${prefix}`),
  })
    .sort({ receiptNumber: -1 })
    .lean();

  let nextSequence = 1;
  if (lastReceipt && lastReceipt.receiptNumber) {
    const lastNumStr = lastReceipt.receiptNumber.replace(prefix, '');
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextSequence = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

// 1. CREATE a new Medicine Receipt (GRN) — Status starts as PENDING_STORE_VERIFICATION
export async function createReceipt(req, res) {
  const {
    purchaseOrder,
    medicine,
    supplier,
    farm,
    batchNumber,
    manufacturingDate,
    expiryDate,
    receivedQuantity,
    unit,
    invoiceOrChallanNo,
  } = req.body;

  // Validation: Mandatory fields
  if (!medicine || !supplier || !farm || !batchNumber || !expiryDate || !receivedQuantity) {
    throw badRequest('Medicine, supplier, farm, batchNumber, expiryDate, and receivedQuantity are required');
  }

  if (Number(receivedQuantity) <= 0) {
    throw badRequest('Received quantity must be greater than 0');
  }

  // Verify entities exist
  const [medDoc, supDoc, farmDoc] = await Promise.all([
    MedicineMaster.findById(medicine),
    Supplier.findById(supplier),
    Firm.findById(farm),
  ]);

  if (!medDoc) throw notFoundError('Medicine not found in catalog');
  if (!supDoc) throw notFoundError('Supplier not found');
  if (!farmDoc) throw notFoundError('Farm location not found');

  // If linked to a PO, verify PO exists and contains this medicine
  if (purchaseOrder) {
    const poDoc = await PurchaseOrder.findById(purchaseOrder);
    if (!poDoc) throw notFoundError('Linked Purchase Order not found');

    const poItem = poDoc.items.find((item) => item.medicine.toString() === medicine.toString());
    if (!poItem) {
      throw badRequest(`Medicine '${medDoc.name}' is not part of Purchase Order ${poDoc.poNumber}`);
    }
  }

  const receiptNumber = await generateReceiptNumber();

  const receipt = await MedicineReceipt.create({
    receiptNumber,
    purchaseOrder: purchaseOrder || null,
    medicine,
    supplier,
    farm,
    batchNumber: batchNumber.trim().toUpperCase(),
    manufacturingDate: manufacturingDate || null,
    expiryDate,
    receivedQuantity: Number(receivedQuantity),
    unit: unit || medDoc.unit,
    invoiceOrChallanNo: invoiceOrChallanNo || '',
    status: 'PENDING_STORE_VERIFICATION', // Does NOT enter stock yet!
    receivedBy: req.user._id,
  });

  await receipt.populate('medicine', 'code name unit category');
  await receipt.populate('supplier', 'code name mobile');
  await receipt.populate('farm', 'code name');
  if (receipt.purchaseOrder) {
    await receipt.populate('purchaseOrder', 'poNumber status');
  }

  res.status(201).json({
    success: true,
    message: `Receipt ${receiptNumber} recorded. Pending Storekeeper verification.`,
    receipt,
  });
}

// 2. ACCEPT RECEIPT (Storekeeper Verification ➔ Creates Available Stock & Ledger Entry!)
export async function acceptReceipt(req, res) {
  const { acceptedQuantity, verificationRemarks } = req.body;

  const receipt = await MedicineReceipt.findById(req.params.id);
  if (!receipt) {
    throw notFoundError('Receipt not found');
  }

  // Idempotency: Protect against double acceptance
  if (receipt.status !== 'PENDING_STORE_VERIFICATION') {
    throw badRequest(`Cannot accept receipt in '${receipt.status}' status. It has already been verified.`);
  }

  const finalAcceptedQty = acceptedQuantity ? Number(acceptedQuantity) : receipt.receivedQuantity;

  if (finalAcceptedQty <= 0) {
    throw badRequest('Accepted quantity must be greater than 0');
  }
  if (finalAcceptedQty > receipt.receivedQuantity) {
    throw badRequest(`Accepted quantity (${finalAcceptedQty}) cannot exceed received quantity (${receipt.receivedQuantity})`);
  }

  // STEP A: Find or Create the Batch in MedicineBatch
  let batch = await MedicineBatch.findOne({
    medicine: receipt.medicine,
    batchNumber: receipt.batchNumber,
    farm: receipt.farm,
  });

  if (batch) {
    // Increment existing batch quantity atomically
    batch.quantityAvailable += finalAcceptedQty;
    batch.initialQuantity += finalAcceptedQty;
    batch.status = 'AVAILABLE';
    await batch.save();
  } else {
    // Create new batch record
    batch = await MedicineBatch.create({
      medicine: receipt.medicine,
      batchNumber: receipt.batchNumber,
      farm: receipt.farm,
      supplier: receipt.supplier,
      firstReceipt: receipt._id,
      manufacturingDate: receipt.manufacturingDate,
      expiryDate: receipt.expiryDate,
      initialQuantity: finalAcceptedQty,
      quantityAvailable: finalAcceptedQty,
      unit: receipt.unit,
      status: 'AVAILABLE',
    });
  }

  // STEP B: Write Immutable Record to Stock Ledger (MedicineTransaction)
  await MedicineTransaction.create({
    transactionType: 'RECEIPT_INWARD',
    medicine: receipt.medicine,
    batch: batch._id,
    batchNumber: batch.batchNumber,
    farm: receipt.farm,
    quantity: finalAcceptedQty,
    balanceAfter: batch.quantityAvailable,
    unit: receipt.unit,
    referenceModel: 'MedicineReceipt',
    referenceId: receipt._id,
    performedBy: req.user._id,
    remarks: verificationRemarks || `Stock accepted via ${receipt.receiptNumber}`,
  });

  // STEP C: Update Purchase Order Fulfillment (If linked to a PO)
  if (receipt.purchaseOrder) {
    const po = await PurchaseOrder.findById(receipt.purchaseOrder);
    if (po) {
      const poItem = po.items.find((item) => item.medicine.toString() === receipt.medicine.toString());
      if (poItem) {
        poItem.receivedQuantity = (poItem.receivedQuantity || 0) + finalAcceptedQty;
      }

      // Check if all items in PO are fully received
      const allFulfilled = po.items.every(
        (item) => (item.receivedQuantity || 0) >= item.orderedQuantity
      );

      po.status = allFulfilled ? 'FULFILLED' : 'PARTIALLY_RECEIVED';
      po.updatedBy = req.user._id;
      await po.save();
    }
  }

  // STEP D: Update Receipt Status to STORE_ACCEPTED
  receipt.status = 'STORE_ACCEPTED';
  receipt.storeAcceptedQuantity = finalAcceptedQty;
  receipt.verificationRemarks = verificationRemarks || '';
  receipt.verifiedBy = req.user._id;
  receipt.verifiedAt = new Date();
  await receipt.save();

  res.json({
    success: true,
    message: `Receipt ${receipt.receiptNumber} accepted! ${finalAcceptedQty} ${receipt.unit} added to available inventory.`,
    receipt,
    batch,
  });
}

// 3. GET all Receipts (with filters)
export async function getReceipts(req, res) {
  const { status, supplier, farm, search, from, to } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (supplier) filter.supplier = supplier;
  if (farm) filter.farm = farm;
  if (search) {
    filter.$or = [
      { receiptNumber: { $regex: search.trim(), $options: 'i' } },
      { batchNumber: { $regex: search.trim(), $options: 'i' } },
      { invoiceOrChallanNo: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const receipts = await MedicineReceipt.find(filter)
    .populate('medicine', 'code name unit category')
    .populate('supplier', 'code name mobile')
    .populate('farm', 'code name')
    .populate('purchaseOrder', 'poNumber status')
    .populate('receivedBy', 'name email')
    .populate('verifiedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    count: receipts.length,
    receipts,
  });
}

// 4. GET Live Batch-wise Inventory
export async function getBatchStock(req, res) {
  const { farm, medicine, status } = req.query;

  const filter = {};
  if (farm) filter.farm = farm;
  if (medicine) filter.medicine = medicine;
  if (status) filter.status = status;

  const batches = await MedicineBatch.find(filter)
    .populate('medicine', 'code name unit category minimumStock reorderLevel')
    .populate('farm', 'code name')
    .populate('supplier', 'code name')
    .sort({ expiryDate: 1 }) // Sorted by earliest expiry date (FEFO preview!)
    .lean();

  // Add expiry countdown calculation to each batch
  const today = new Date();
  const enrichedBatches = batches.map((b) => {
    const expDate = new Date(b.expiryDate);
    const diffTime = expDate - today;
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let expiryAlert = 'VALID';
    if (daysRemaining <= 0) expiryAlert = 'EXPIRED';
    else if (daysRemaining <= 30) expiryAlert = 'EXPIRING_30_DAYS';
    else if (daysRemaining <= 60) expiryAlert = 'EXPIRING_60_DAYS';

    return {
      ...b,
      daysRemaining,
      expiryAlert,
    };
  });

  res.json({
    success: true,
    count: enrichedBatches.length,
    batches: enrichedBatches,
  });
}