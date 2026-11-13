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