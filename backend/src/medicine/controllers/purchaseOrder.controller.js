import PurchaseOrder from '../models/PurchaseOrder.js';
import Supplier from '../models/Supplier.js';
import MedicineMaster from '../models/MedicineMaster.js';
import { badRequest, notFoundError, conflictError } from '../../utils/http.js';

// Helper: Auto-generate sequential PO Number: PO-YYYY-XXXX (e.g. PO-2026-0001)
async function generatePoNumber() {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  
  // Find the highest existing PO number for this year
  const lastPo = await PurchaseOrder.findOne({ poNumber: new RegExp(`^${prefix}`) })
    .sort({ poNumber: -1 })
    .lean();

  let nextSequence = 1;
  if (lastPo && lastPo.poNumber) {
    const lastNumStr = lastPo.poNumber.replace(prefix, '');
    const lastNum = parseInt(lastNumStr, 10);
    if (!isNaN(lastNum)) {
      nextSequence = lastNum + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

// 1. CREATE a new Purchase Order
export async function createPurchaseOrder(req, res) {
  const { supplier, orderDate, expectedDeliveryDate, items, notes } = req.body;

  // Validation: Mandatory fields
  if (!supplier || !orderDate || !items || !Array.isArray(items) || items.length === 0) {
    throw badRequest('Supplier, orderDate, and at least one medicine item are required');
  }

  // Verify that the Supplier exists and is active
  const supplierExists = await Supplier.findById(supplier);
  if (!supplierExists) {
    throw notFoundError('Supplier not found');
  }

  // Recalculate item prices and total amount server-side (Never trust frontend math!)
  let totalAmount = 0;
  const processedItems = [];

  for (const item of items) {
    if (!item.medicine || !item.orderedQuantity || item.orderedQuantity <= 0) {
      throw badRequest('Each item must have a valid medicine and an orderedQuantity > 0');
    }

    // Verify medicine exists
    const med = await MedicineMaster.findById(item.medicine);
    if (!med) {
      throw notFoundError(`Medicine with ID ${item.medicine} not found`);
    }

    const unitPrice = Number(item.unitPrice) || 0;
    const orderedQuantity = Number(item.orderedQuantity);
    const totalPrice = orderedQuantity * unitPrice;
    totalAmount += totalPrice;

    processedItems.push({
      medicine: item.medicine,
      orderedQuantity,
      receivedQuantity: 0, // Starts at 0
      unitPrice,
      totalPrice,
    });
  }

  // Auto-generate PO Number
  const poNumber = await generatePoNumber();

  // Create the PO in MongoDB
  const purchaseOrder = await PurchaseOrder.create({
    poNumber,
    supplier,
    orderDate,
    expectedDeliveryDate: expectedDeliveryDate || null,
    items: processedItems,
    totalAmount,
    status: 'DRAFT',
    notes: notes || '',
    createdBy: req.user._id, // Injected by protect auth middleware
  });

  // Populate supplier and medicine info for the response
  await purchaseOrder.populate('supplier', 'code name contactPerson mobile');
  await purchaseOrder.populate('items.medicine', 'code name unit category');

  res.status(201).json({
    success: true,
    message: `Purchase Order ${poNumber} created successfully`,
    purchaseOrder,
  });
}

// 2. GET all Purchase Orders (with search, supplier, status filter)
export async function getPurchaseOrders(req, res) {
  const { search, supplier, status, from, to } = req.query;

  const filter = {};

  if (supplier) filter.supplier = supplier;
  if (status) filter.status = status;
  if (search) {
    filter.poNumber = { $regex: search.trim(), $options: 'i' };
  }

  // Optional date filtering on orderDate (YYYY-MM-DD)
  if (from || to) {
    filter.orderDate = {};
    if (from) filter.orderDate.$gte = from;
    if (to) filter.orderDate.$lte = to;
  }

  const purchaseOrders = await PurchaseOrder.find(filter)
    .populate('supplier', 'code name contactPerson mobile')
    .populate('items.medicine', 'code name unit category')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  // Add fulfillment calculations dynamically to each PO
  const posWithFulfillment = purchaseOrders.map((po) => {
    let totalOrdered = 0;
    let totalReceived = 0;

    const itemsWithBalance = (po.items || []).map((item) => {
      const balanceQuantity = Math.max(0, item.orderedQuantity - (item.receivedQuantity || 0));
      totalOrdered += item.orderedQuantity;
      totalReceived += item.receivedQuantity || 0;

      return {
        ...item,
        balanceQuantity,
      };
    });

    return {
      ...po,
      items: itemsWithBalance,
      totalOrdered,
      totalReceived,
      totalBalance: Math.max(0, totalOrdered - totalReceived),
    };
  });

  res.json({
    success: true,
    count: posWithFulfillment.length,
    purchaseOrders: posWithFulfillment,
  });
}

// 3. GET a single Purchase Order by ID
export async function getPurchaseOrderById(req, res) {
  const po = await PurchaseOrder.findById(req.params.id)
    .populate('supplier', 'code name contactPerson mobile email address gstin')
    .populate('items.medicine', 'code name unit category manufacturer')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .lean();

  if (!po) {
    throw notFoundError('Purchase Order not found');
  }

  // Add item balance calculations
  const itemsWithBalance = (po.items || []).map((item) => ({
    ...item,
    balanceQuantity: Math.max(0, item.orderedQuantity - (item.receivedQuantity || 0)),
  }));

  res.json({
    success: true,
    purchaseOrder: {
      ...po,
      items: itemsWithBalance,
    },
  });
}

// 4. UPDATE a Purchase Order (Only allowed in DRAFT status)
export async function updatePurchaseOrder(req, res) {
  const { supplier, orderDate, expectedDeliveryDate, items, notes } = req.body;

  const po = await PurchaseOrder.findById(req.params.id);
  if (!po) {
    throw notFoundError('Purchase Order not found');
  }

  // Business Rule: Only DRAFT orders can be edited!
  if (po.status !== 'DRAFT') {
    throw badRequest(`Cannot edit a Purchase Order in '${po.status}' status. Only DRAFT orders can be modified.`);
  }

  if (supplier) {
    const supplierExists = await Supplier.findById(supplier);
    if (!supplierExists) throw notFoundError('Supplier not found');
    po.supplier = supplier;
  }

  if (orderDate) po.orderDate = orderDate;
  if (expectedDeliveryDate !== undefined) po.expectedDeliveryDate = expectedDeliveryDate;
  if (notes !== undefined) po.notes = notes;

  if (items && Array.isArray(items) && items.length > 0) {
    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      if (!item.medicine || !item.orderedQuantity || item.orderedQuantity <= 0) {
        throw badRequest('Each item must have a valid medicine and orderedQuantity > 0');
      }

      const unitPrice = Number(item.unitPrice) || 0;
      const orderedQuantity = Number(item.orderedQuantity);
      const totalPrice = orderedQuantity * unitPrice;
      totalAmount += totalPrice;

      processedItems.push({
        medicine: item.medicine,
        orderedQuantity,
        receivedQuantity: item.receivedQuantity || 0,
        unitPrice,
        totalPrice,
      });
    }

    po.items = processedItems;
    po.totalAmount = totalAmount;
  }

  po.updatedBy = req.user._id;
  await po.save();

  await po.populate('supplier', 'code name contactPerson mobile');
  await po.populate('items.medicine', 'code name unit category');

  res.json({
    success: true,
    message: 'Purchase Order updated successfully',
    purchaseOrder: po,
  });
}

// 5. UPDATE Status (e.g. DRAFT -> ISSUED or CANCELLED)
export async function updatePurchaseOrderStatus(req, res) {
  const { status } = req.body;

  if (!status) {
    throw badRequest('New status is required');
  }

  const po = await PurchaseOrder.findById(req.params.id);
  if (!po) {
    throw notFoundError('Purchase Order not found');
  }

  // Business Rule: Once FULFILLED or CANCELLED, status cannot be randomly modified
  if (['FULFILLED', 'CANCELLED'].includes(po.status)) {
    throw badRequest(`Cannot change status of a PO that is already '${po.status}'`);
  }

  // If transitioning to CANCELLED, ensure no goods have been received yet
  if (status === 'CANCELLED') {
    const hasReceived = (po.items || []).some((item) => (item.receivedQuantity || 0) > 0);
    if (hasReceived) {
      throw badRequest('Cannot cancel a PO that has already received goods. Please adjust or return goods instead.');
    }
  }

  po.status = status;
  po.updatedBy = req.user._id;
  await po.save();

  res.json({
    success: true,
    message: `Purchase Order status updated to '${status}' successfully`,
    purchaseOrder: po,
  });
}