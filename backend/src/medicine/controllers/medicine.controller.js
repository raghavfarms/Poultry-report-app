// Medicine Master Controller
import mongoose from 'mongoose';
import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import MedicineIssue from '../models/MedicineIssue.js';

// Helper: Auto-generate sequential Medicine Code: MED-001, MED-002, etc.
async function generateMedicineCode() {
  const prefix = 'MED-';
  const allMeds = await MedicineMaster.find({
    code: new RegExp(`^${prefix}\\d+`),
  })
    .select('code')
    .lean();

  let maxNum = 0;
  for (const m of allMeds) {
    if (m.code && m.code.startsWith(prefix)) {
      const num = parseInt(m.code.replace(prefix, ''), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  let nextSequence = maxNum + 1;
  let candidate = `${prefix}${String(nextSequence).padStart(3, '0')}`;
  let exists = await MedicineMaster.findOne({ code: candidate });
  while (exists) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(3, '0')}`;
    exists = await MedicineMaster.findOne({ code: candidate });
  }

  return candidate;
}

// 1. Create a new Medicine
export async function createMedicine(req, res) {
  try {
    const {
      code,
      name,
      aliasName,
      category,
      unit,
      manufacturer,
      shelfLifeMonths,
      minimumStock,
      reorderLevel,
    } = req.body;

    // Validation (code is optional!)
    if (!name || !unit || !category) {
      return res.status(400).json({
        success: false,
        message: 'Medicine name, category, and unit are required fields',
      });
    }

    let finalCode = code ? code.trim().toUpperCase() : '';
    if (!finalCode) {
      finalCode = await generateMedicineCode();
    } else {
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
      manufacturer,
      shelfLifeMonths,
      minimumStock,
      reorderLevel,
    } = req.body;

    const medicine = await MedicineMaster.findById(req.params.id);
    if (!medicine) {
      return res.status(404).json({
        success: false,
        message: 'Medicine not found',
      });
    }

    // Update fields safely without corrupting types
    if (name) medicine.name = name.trim();
    if (aliasName !== undefined) medicine.aliasName = aliasName ? aliasName.trim() : '';
    if (category) medicine.category = category.trim();
    if (unit) medicine.unit = unit.trim();
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

    await medicine.save();

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

// 8. Delete a Medicine (Hard delete if no history; prevents deletion if batches/receipts/issues exist)
export async function deleteMedicine(req, res) {
  try {
    const { id } = req.params;
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

    // Check if this medicine has been used in any stock batches, receipts, or issues
    const [batchCount, receiptCount, issueCount] = await Promise.all([
      MedicineBatch.countDocuments({ medicine: id }),
      MedicineReceipt.countDocuments({ medicine: id }),
      MedicineIssue.countDocuments({ medicine: id }),
    ]);

    const totalUsage = batchCount + receiptCount + issueCount;
    if (totalUsage > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete "${medicine.name}" because it has ${batchCount} batch(es), ${receiptCount} receipt(s), and ${issueCount} issue(s) recorded in audit history. Please Deactivate it instead to preserve traceability.`,
      });
    }

    await MedicineMaster.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: `Medicine "${medicine.name}" (${medicine.code || 'No Code'}) deleted successfully.`,
    });
  } catch (error) {
    console.error('deleteMedicine error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete medicine',
    });
  }
}

