// Medicine Master Controller
import mongoose from 'mongoose';
import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import MedicineIssue from '../models/MedicineIssue.js';
import MedicineTransaction from '../models/MedicineTransaction.js';

// 1. Create a new Medicine
export async function createMedicine(req, res) {
  try {
    const {
      code,
      name,
      aliasName,
      category,
      unit,
      packagingType,
      packSize,
      manufacturer,
      shelfLifeMonths,
      minimumStock,
      reorderLevel,
      suppliers,
    } = req.body;

    const isAdminOrDev = ['admin', 'developer'].includes(req.user?.role);
    if (!isAdminOrDev) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin and Developer accounts can create medicines',
      });
    }

    // Validation (code is optional!)
    if (!name || !unit || !category) {
      return res.status(400).json({
        success: false,
        message: 'Medicine name, category, and unit are required fields',
      });
    }

    let finalCode = code ? code.trim().toUpperCase() : '';
    if (finalCode) {
      const existing = await MedicineMaster.findOne({ code: finalCode });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Medicine with code '${finalCode}' already exists`,
        });
      }
    }

    const medicine = await MedicineMaster.create({
      code: finalCode,
      name: name.trim(),
      aliasName: aliasName ? aliasName.trim() : '',
      category: category.trim(),
      unit: unit.trim(),
      packagingType: packagingType ? packagingType.trim() : 'Bottle',
      packSize: (packSize !== undefined && packSize !== '' && Number(packSize) > 0) ? Number(packSize) : 1,
      manufacturer: manufacturer ? manufacturer.trim() : '',
      shelfLifeMonths: (shelfLifeMonths !== undefined && shelfLifeMonths !== '' && shelfLifeMonths !== null)
        ? Number(shelfLifeMonths)
        : null,
      minimumStock: (minimumStock !== undefined && minimumStock !== '' && minimumStock !== null)
        ? Number(minimumStock)
        : 0,
      reorderLevel: (reorderLevel !== undefined && reorderLevel !== '' && reorderLevel !== null)
        ? Number(reorderLevel)
        : 0,
      suppliers: Array.isArray(suppliers) ? suppliers : [],
      createdBy: req.user?._id || req.user?.id,
    });

    return res.status(201).json({
      success: true,
      message: 'Medicine created successfully',
      medicine,
    });
  } catch (error) {
    console.error('createMedicine error:', error);
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A medicine with this code already exists.',
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create medicine',
    });
  }
}

// 2. GET all Medicines (with search, category filter, inactive toggle)
export async function getMedicines(req, res) {
  try {
    const { search, category, includeInactive, status } = req.query;

    const filter = {};

    if (status === 'inactive') {
      filter.active = false;
    } else if (status === 'all' || includeInactive === 'true') {
      // include both active and inactive
    } else {
      // default: active only
      filter.active = true;
    }

    if (category) {
      filter.category = category.trim();
    }

    if (search) {
      const cleanSearch = search.trim();
      filter.$or = [
        { name: { $regex: cleanSearch, $options: 'i' } },
        { code: { $regex: cleanSearch, $options: 'i' } },
        { aliasName: { $regex: cleanSearch, $options: 'i' } },
      ];
    }

    const medicines = await MedicineMaster.find(filter)
      .populate('createdBy', 'name email')
      .populate('suppliers', 'name code mobile')
      .sort({ name: 1 })
      .lean();

    // Compute live current stock across batches to power low stock alerts
    const batches = await MedicineBatch.find({
      quantityAvailable: { $gt: 0 },
      status: { $in: ['AVAILABLE', 'EXPIRED'] },
    })
      .select('medicine quantityAvailable')
      .lean();

    const stockMap = {};
    for (const b of batches) {
      const medId = b.medicine?.toString();
      if (medId) {
        stockMap[medId] = (stockMap[medId] || 0) + (b.quantityAvailable || 0);
      }
    }

    const enrichedMedicines = medicines.map((med) => {
      const medId = med._id.toString();
      const currentStock = stockMap[medId] || 0;
      const threshold = med.reorderLevel || med.minimumStock || 0;
      const isLowStock = threshold > 0 && currentStock <= threshold;
      const isOutOfStock = currentStock === 0;

      return {
        ...med,
        currentStock,
        isLowStock,
        isOutOfStock,
      };
    });

    return res.json({
      success: true,
      count: enrichedMedicines.length,
      medicines: enrichedMedicines,
    });
  } catch (error) {
    console.error('getMedicines error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch medicines',
    });
  }
}

// 3. GET a single Medicine by ID
export async function getMedicineById(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    const medicine = await MedicineMaster.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('suppliers', 'name code mobile')
      .lean();

    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    return res.json({
      success: true,
      medicine,
    });
  } catch (error) {
    console.error('getMedicineById error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch medicine details',
    });
  }
}

function getUnitConversionFactor(oldUnit, newUnit) {
  if (!oldUnit || !newUnit) return 1;
  const normalize = (u) => {
    const s = String(u).toLowerCase();
    if (s.includes('kilo') || s.includes('kg')) return 'kg';
    if (s.includes('gram') || s === 'g' || s === 'gm') return 'g';
    if (s.includes('litre') || s.includes('liter') || s === 'l') return 'l';
    if (s.includes('milli') || s === 'ml') return 'ml';
    return s;
  };
  const from = normalize(oldUnit);
  const to = normalize(newUnit);
  if (from === to) return 1;
  if (from === 'kg' && to === 'g') return 1000;
  if (from === 'g' && to === 'kg') return 0.001;
  if (from === 'l' && to === 'ml') return 1000;
  if (from === 'ml' && to === 'l') return 0.001;
  return 1;
}
// 4. Update an existing Medicine
export async function updateMedicine(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    const {
      name,
      aliasName,
      category,
      unit,
      packagingType,
      packSize,
      manufacturer,
      shelfLifeMonths,
      minimumStock,
      reorderLevel,
      suppliers,
    } = req.body;

    const medicine = await MedicineMaster.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }
    medicine._originalUnit = medicine.unit;

    if (suppliers !== undefined) {
      medicine.suppliers = Array.isArray(suppliers) ? suppliers : [];
    }

    // Update fields safely without corrupting types
    if (name) medicine.name = name.trim();
    if (aliasName !== undefined) medicine.aliasName = aliasName ? aliasName.trim() : '';
    if (category) medicine.category = category.trim();
    if (unit) medicine.unit = unit.trim();
    if (packagingType !== undefined) medicine.packagingType = packagingType ? packagingType.trim() : 'Bottle';
    if (packSize !== undefined) {
      const parsedPackSize = Number(packSize);
      medicine.packSize = Number.isFinite(parsedPackSize) && parsedPackSize > 0 ? parsedPackSize : 1;
    }
    if (manufacturer !== undefined) medicine.manufacturer = manufacturer ? manufacturer.trim() : '';

    if (shelfLifeMonths !== undefined) {
      medicine.shelfLifeMonths = (shelfLifeMonths !== '' && shelfLifeMonths !== null)
        ? Number(shelfLifeMonths)
        : null;
    }

    if (minimumStock !== undefined) {
      medicine.minimumStock = (minimumStock !== '' && minimumStock !== null)
        ? Number(minimumStock)
        : 0;
    }

    if (reorderLevel !== undefined) {
      medicine.reorderLevel = (reorderLevel !== '' && reorderLevel !== null)
        ? Number(reorderLevel)
        : 0;
    }

    const oldUnit = medicine.isModified('unit') ? medicine._originalUnit || medicine.unit : null;
    const newUnit = medicine.unit;
    await medicine.save();

    // Sync batches and scale quantities if unit changed (e.g. Kg <-> g)
    try {
      const conversionFactor = oldUnit ? getUnitConversionFactor(oldUnit, newUnit) : 1;
      if (conversionFactor !== 1) {
        const batches = await MedicineBatch.find({ medicine: medicine._id });
        for (const b of batches) {
          b.quantityAvailable = Number((b.quantityAvailable * conversionFactor).toFixed(3));
          if (b.initialQuantity) {
            b.initialQuantity = Number((b.initialQuantity * conversionFactor).toFixed(3));
          }
          b.unit = newUnit;
          b.packSize = medicine.packSize;
          b.packagingType = medicine.packagingType;
          await b.save();
        }
      } else {
        await MedicineBatch.updateMany(
          { medicine: medicine._id },
          { $set: { unit: medicine.unit, packSize: medicine.packSize, packagingType: medicine.packagingType } }
        );
      }
    } catch (batchSyncErr) {
      console.error('Error syncing batches on medicine update:', batchSyncErr);
    }

    return res.json({
      success: true,
      message: 'Medicine updated successfully',
      medicine,
    });
  } catch (error) {
    console.error('updateMedicine error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update medicine',
    });
  }
}

// 5. Activate and Deactivate (soft delete)
export async function toggleMedicineStatus(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    const medicine = await MedicineMaster.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    medicine.active = !medicine.active;
    await medicine.save();

    return res.json({
      success: true,
      message: `Medicine ${medicine.active ? 'activated' : 'deactivated'} successfully`,
      medicine,
    });
  } catch (error) {
    console.error('toggleMedicineStatus error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle medicine status',
    });
  }
}

// 6. Delete Category (reassigns medicines with this category to a fallback or 'General')
export async function deleteCategory(req, res) {
  try {
    const { name, reassignTo } = req.query;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    const trimmed = name.trim();
    const targetCategory = reassignTo?.trim() || 'General';

    const count = await MedicineMaster.countDocuments({ category: trimmed });
    if (count > 0) {
      await MedicineMaster.updateMany(
        { category: trimmed },
        { $set: { category: targetCategory } }
      );
    }

    return res.json({
      success: true,
      message: `Category '${trimmed}' removed successfully.${count > 0 ? ` ${count} medicine(s) updated to '${targetCategory}'.` : ''}`,
    });
  } catch (error) {
    console.error('deleteCategory error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete category',
    });
  }
}

// 7. Delete Unit (reassigns medicines with this unit to a fallback or 'Unit')
export async function deleteUnit(req, res) {
  try {
    const { name, reassignTo } = req.query;
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Unit name is required',
      });
    }

    const trimmed = name.trim();
    const targetUnit = reassignTo?.trim() || 'Unit';

    const count = await MedicineMaster.countDocuments({ unit: trimmed });
    if (count > 0) {
      await MedicineMaster.updateMany(
        { unit: trimmed },
        { $set: { unit: targetUnit } }
      );
    }

    return res.json({
      success: true,
      message: `Unit '${trimmed}' removed successfully.${count > 0 ? ` ${count} medicine(s) updated to '${targetUnit}'.` : ''}`,
    });
  } catch (error) {
    console.error('deleteUnit error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete unit',
    });
  }
}

// 8. Delete a Medicine (Hard delete; supports ?force=true to cascade delete all batches, receipts, issues, and transactions)
export async function deleteMedicine(req, res) {
  try {
    const { id } = req.params;
    const { force } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    const medicine = await MedicineMaster.findById(id);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    // Cascade delete all associated batches, receipts, issues, and transactions
    await Promise.all([
      MedicineIssue.deleteMany({ medicine: id }),
      MedicineReceipt.deleteMany({ medicine: id }),
      MedicineTransaction.deleteMany({ medicine: id }),
      MedicineBatch.deleteMany({ medicine: id }),
    ]);

    await MedicineMaster.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: `Medicine "${medicine.name}" (${medicine.code || 'No Code'}) and all associated records deleted successfully.`,
    });
  } catch (error) {
    console.error('deleteMedicine error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete medicine',
    });
  }
}

