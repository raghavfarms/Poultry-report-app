import Supplier from '../models/Supplier.js';
import { badRequest, notFoundError, conflictError } from '../../utils/http.js';

// 1. CREATE Supplier
export async function createSupplier(req, res) {
  const { code, name, contactPerson, mobile, email, address, gstin } = req.body;

  if (!code || !name) {
    throw badRequest('Supplier code and name are required.');
  }

  const existing = await Supplier.findOne({ code: code.trim().toUpperCase() });
  if (existing) {
    throw conflictError(`Supplier with code '${code.toUpperCase()}' already exists.`);
  }

  const supplier = await Supplier.create({
    code,
    name,
    contactPerson,
    mobile,
    email,
    address,
    gstin,
    createdBy: req.user._id,
  });

  res.status(201).json({
    success: true,
    message: 'Supplier created successfully.',
    supplier,
  });
}

// 2. GET all Suppliers (with Search & Inactive toggle)
export async function getSuppliers(req, res) {
  const { search, includeInactive } = req.query;

  const filter = {};

  if (includeInactive !== 'true') {
    filter.active = true;
  }

  // Search by code, name, or contact person
  if (search) {
    filter.$or = [
      { name: { $regex: search.trim(), $options: 'i' } },
      { code: { $regex: search.trim(), $options: 'i' } },
      { contactPerson: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const suppliers = await Supplier.find(filter)
    .populate('createdBy', 'name email')
    .sort({ name: 1 })
    .lean();

  res.json({
    success: true,
    count: suppliers.length,
    suppliers,
  });
}

// 3. GET Supplier by ID
export async function getSupplierById(req, res) {
  const supplier = await Supplier.findById(req.params.id)
    .populate('createdBy', 'name email')
    .lean();

  if (!supplier) {
    throw notFoundError('Supplier not found.');
  }

  res.json({ success: true, supplier });
}

// 4. UPDATE Supplier
export async function updateSupplier(req, res) {
  const { name, contactPerson, mobile, email, address, gstin } = req.body;

  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) {
    throw notFoundError('Supplier not found.');
  }

  if (name) supplier.name = name;
  if (contactPerson !== undefined) supplier.contactPerson = contactPerson;
  if (mobile !== undefined) supplier.mobile = mobile;
  if (email !== undefined) supplier.email = email;
  if (address !== undefined) supplier.address = address;
  if (gstin !== undefined) supplier.gstin = gstin;

  await supplier.save();

  res.json({
    success: true,
    message: 'Supplier updated successfully.',
    supplier,
  });
}

// 5. ACTIVATE / DEACTIVATE (Soft Delete)
export async function toggleSupplierStatus(req, res) {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) {
    throw notFoundError('Supplier not found.');
  }

  supplier.active = !supplier.active;
  await supplier.save();

  res.json({
    success: true,
    message: `Supplier ${supplier.active ? 'activated' : 'deactivated'} successfully.`,
    supplier,
  });
}