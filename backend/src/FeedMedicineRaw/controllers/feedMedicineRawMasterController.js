import FeedMedRawMaster from "../models/FeedMedRawMaster.js";
import { getNextFeedMedRawCode } from "../services/feedMedicineRawCodeService.js";

/**
 * 1. CREATE FEED ITEM (Medicine or Raw Material)
 * POST /api/feed-med-raw/master
 */
export async function createFeedItem(req, res) {
  try {
    const {
      itemType,
      name,
      companyName,
      aliasName,
      uom,
      packagingType,
      packSize,
      category,
      currentStock,
      batchNumber,
      expiryDate,
      reorderLevel,
    } = req.body;

    // Validation
    if (!itemType || !name || !uom) {
      return res.status(400).json({  
        success: false,
        error: 'itemType, name, and uom are required fields.',
      });
    }

    if (itemType !== 'Feed Medicine' && itemType !== 'Raw Material') {
      return res.status(400).json({
        success: false,
        error: 'itemType must be either "Feed Medicine" or "Raw Material".',
      });
    }

    // Check duplicate name within the same itemType
    const existing = await FeedMedRawMaster.findOne({
      itemType,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A ${itemType} with name "${name.trim()}" already exists.`,
      });
    }

    // Category: Feed Medicine gets Regular/Treatment, Raw Material is null
    const finalCategory = itemType === 'Feed Medicine' ? (category || 'Regular') : null;

    // Generate unique code: FMR-001, FMR-002...
    const nextCode = await getNextFeedMedRawCode();

    const newItem = await FeedMedRawMaster.create({
      code: nextCode,
      itemType,
      name: name.trim(),
      companyName: companyName?.trim() || '',
      aliasName: aliasName?.trim() || '',
      uom,
      packagingType: packagingType || 'Bag',
      packSize: Number(packSize) || 1,
      category: finalCategory,
      currentStock: Number(currentStock) || 0,
      batchNumber: itemType === 'Feed Medicine' ? (batchNumber?.trim() || '') : '',
      expiryDate: expiryDate?.trim() || '',
      reorderLevel: Number(reorderLevel) || 0,
    });

    return res.status(201).json({
      success: true,
      message: `${itemType} created successfully`,
      data: newItem,
    });
  } catch (err) {
    console.error('Error creating feed item:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 2. GET ALL FEED ITEMS (with search and filters)
 * GET /api/feed-med-raw/master
 */
export async function getFeedItems(req, res) {
  try {
    const { search, itemType, status } = req.query;

    const query = {};

    // Filter by itemType: 'Feed Medicine' | 'Raw Material'
    if (itemType && itemType !== 'All') {
      query.itemType = itemType;
    }

    // Filter by status: 'active' | 'inactive'
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    // Search across name, aliasName, companyName, or code
    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      query.$or = [
        { name: regex },
        { aliasName: regex },
        { companyName: regex },
        { code: regex },
      ];
    }

    const items = await FeedMedRawMaster.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (err) {
    console.error('Error fetching feed items:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 3. GET SINGLE FEED ITEM BY ID
 * GET /api/feed-med-raw/master/:id
 */
export async function getFeedItemById(req, res) {
  try {
    const item = await FeedMedRawMaster.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    console.error('Error fetching feed item:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 4. UPDATE FEED ITEM
 * PUT /api/feed-med-raw/master/:id
 */
export async function updateFeedItem(req, res) {
  try {
    const {
      name,
      companyName,
      aliasName,
      uom,
      packagingType,
      packSize,
      category,
      currentStock,
      batchNumber,
      expiryDate,
      reorderLevel,
    } = req.body;

    const item = await FeedMedRawMaster.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    // If name is changing, check duplicate
    if (name && name.trim().toLowerCase() !== item.name.toLowerCase()) {
      const existing = await FeedMedRawMaster.findOne({
        _id: { $ne: item._id },
        itemType: item.itemType,
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `Another ${item.itemType} with name "${name.trim()}" already exists.`,
        });
      }
      item.name = name.trim();
    }

    if (companyName !== undefined) item.companyName = companyName.trim();
    if (aliasName !== undefined) item.aliasName = aliasName.trim();
    if (uom) item.uom = uom;
    if (packagingType) item.packagingType = packagingType;
    if (packSize !== undefined) item.packSize = Number(packSize) || 1;

    if (item.itemType === 'Feed Medicine' && category) {
      item.category = category;
    }

    if (currentStock !== undefined) item.currentStock = Number(currentStock) || 0;
    if (batchNumber !== undefined) item.batchNumber = item.itemType === 'Feed Medicine' ? batchNumber.trim() : '';
    if (expiryDate !== undefined) item.expiryDate = expiryDate.trim();
    if (reorderLevel !== undefined) item.reorderLevel = Number(reorderLevel) || 0;

    await item.save();

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: item,
    });
  } catch (err) {
    console.error('Error updating feed item:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 5. TOGGLE STATUS (Active / Inactive)
 * PATCH /api/feed-med-raw/master/:id/toggle
 */
export async function toggleFeedItemStatus(req, res) {
  try {
    const item = await FeedMedRawMaster.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }

    item.isActive = !item.isActive;
    await item.save();

    return res.status(200).json({
      success: true,
      message: `Item marked as ${item.isActive ? 'Active' : 'Inactive'}`,
      data: item,
    });
  } catch (err) {
    console.error('Error toggling status:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 6. BULK IMPORT FEED ITEMS (from Excel)
 * POST /api/feed-med-raw/master/bulk-import
 */
export async function bulkImportFeedItems(req, res) {
  try {
    const { items, defaultItemType } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No items data provided for bulk import.',
      });
    }

    // Find current maximum numeric code among existing FMR- items
    const allExisting = await FeedMedRawMaster.find({ code: /^FMR-\d+$/ })
      .select('code')
      .lean();

    let counter = 0;
    for (const doc of allExisting) {
      const match = (doc.code || '').match(/^FMR-(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > counter) {
          counter = num;
        }
      }
    }

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const validUoms = ['kg', 'gm', 'ltr', 'ml', 'ton'];

    for (const raw of items) {
      const name = raw.name ? String(raw.name).trim() : '';
      if (!name) {
        skippedCount++;
        continue;
      } 

      const itemType =
        raw.itemType === 'Raw Material' || defaultItemType === 'Raw Material'
          ? 'Raw Material'
          : 'Feed Medicine';

      // Normalize UOM
      let uom = String(raw.uom || 'kg').toLowerCase().trim();
      if (!validUoms.includes(uom)) {
        uom = 'kg';
      }

      // Packaging Type & Pack Size
      const packagingType = raw.packagingType
        ? String(raw.packagingType).trim()
        : 'Bag';
      const packSize =
        Number(raw.packSize) > 0
          ? Number(raw.packSize)
          : itemType === 'Raw Material'
            ? 50
            : 1;

      // Category for Feed Medicine: Regular or Treatment
      let category = null;
      if (itemType === 'Feed Medicine') {
        const cat = raw.category ? String(raw.category).trim() : 'Regular';
        category = /treatment/i.test(cat) ? 'Treatment' : 'Regular';
      }

      const companyName = raw.companyName ? String(raw.companyName).trim() : '';
      const aliasName = raw.aliasName ? String(raw.aliasName).trim() : '';
      const currentStock = Number(raw.currentStock || raw.stock || 0) || 0;
      const batchNumber = itemType === 'Feed Medicine' ? String(raw.batchNumber || '').trim() : '';
      const expiryDate = String(raw.expiryDate || '').trim();
      const reorderLevel = Number(raw.reorderLevel) || 0;

      // Check if item with same name exists under this itemType (case-insensitive)
      const existing = await FeedMedRawMaster.findOne({
        itemType,
        name: { $regex: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      });

      if (existing) {
        // Update existing item
        if (companyName) existing.companyName = companyName;
        if (aliasName) existing.aliasName = aliasName;
        if (uom) existing.uom = uom;
        if (packagingType) existing.packagingType = packagingType;
        if (packSize) existing.packSize = packSize;
        if (category) existing.category = category;
        if (raw.currentStock !== undefined || raw.stock !== undefined) {
          existing.currentStock = currentStock;
        }
        if (batchNumber) existing.batchNumber = batchNumber;
        if (expiryDate) existing.expiryDate = expiryDate;
        if (raw.reorderLevel !== undefined) existing.reorderLevel = reorderLevel;
        existing.isActive = true; // reactivate if was inactive
        await existing.save();
        updatedCount++;
      } else {
        // Create new item with next sequential code
        counter++;
        const code = `FMR-${String(counter).padStart(3, '0')}`;
        await FeedMedRawMaster.create({
          code,
          itemType,
          name,
          companyName,
          aliasName,
          uom,
          packagingType,
          packSize,
          category,
          currentStock,
          batchNumber,
          expiryDate,
          reorderLevel,
          isActive: true,
        });
        addedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Imported successfully! (${addedCount} added, ${updatedCount} updated${
        skippedCount > 0 ? `, ${skippedCount} skipped` : ''
      })`,
      summary: {
        addedCount,
        updatedCount,
        skippedCount,
        totalProcessed: items.length,
      },
    });
  } catch (err) {
    console.error('Error during bulk import of feed items:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal  Sever Error ',
    });
  }
}


