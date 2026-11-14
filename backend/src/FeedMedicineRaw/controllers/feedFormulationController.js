import FeedFormulation from '../models/FeedFormulation.js';
import { getNextBomNumber } from '../services/feedFormulationCodeService.js';

/**
 * 1. CREATE FEED FORMULATION (BOM)
 * POST /api/feed-med-raw/formulations
 */
export async function createFormulation(req, res) {
  try {
    const {
      feedName,
      feedType,
      consumedBy,
      flockName,
      targetBatchSize = 1000,
      startDate,
      endDate,
      items = [],
      notes,
    } = req.body;

    // Validation
    if (!feedName || !feedName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Feed Name is required.',
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one ingredient is required in the formulation.',
      });
    }

    // Check duplicate feed name
    const existing = await FeedFormulation.findOne({
      feedName: { $regex: new RegExp(`^${feedName.trim()}$`, 'i') },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A formulation named "${feedName.trim()}" already exists.`,
      });
    }

    const batchSize = Number(targetBatchSize) || 1000;

    // Process items and calculate total weight and percentages
    let calculatedTotal = 0;
    const processedItems = items.map((item) => {
      const qty = Number(item.quantity) || 0;
      calculatedTotal += qty;
      const pct = batchSize > 0 ? Number(((qty / batchSize) * 100).toFixed(2)) : 0;
      return {
        itemId: item.itemId,
        itemType: item.itemType,
        itemName: item.itemName,
        quantity: qty,
        percentage: pct,
        uom: item.uom || 'kg',
      };
    });

    // Auto-generate BOM Number
    const nextBom = await getNextBomNumber();

    const newFormulation = await FeedFormulation.create({
      bomNumber: nextBom,
      feedName: feedName.trim(),
      feedType: feedType || 'PHASE-2',
      consumedBy: consumedBy || 'ALL BIRDS',
      flockName: flockName?.trim() || 'All Flocks',
      targetBatchSize: batchSize,
      totalWeight: Number(calculatedTotal.toFixed(3)),
      startDate: startDate || null,
      endDate: endDate || null,
      items: processedItems,
      notes: notes?.trim() || '',
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Feed Formulation created successfully',
      data: newFormulation,
    });
  } catch (err) {
    console.error('Error creating formulation:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 2. GET ALL FORMULATIONS (with search & filters)
 * GET /api/feed-med-raw/formulations
 */
export async function getFormulations(req, res) {
  try {
    const { search, feedType, status } = req.query;

    const query = {};

    if (feedType && feedType !== 'All') {
      query.feedType = feedType;
    }

    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { feedName: regex },
        { bomNumber: regex },
        { flockName: regex },
      ];
    }

    const formulations = await FeedFormulation.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: formulations.length,
      data: formulations,
    });
  } catch (err) {
    console.error('Error fetching formulations:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 3. GET FORMULATION BY ID
 * GET /api/feed-med-raw/formulations/:id
 */
export async function getFormulationById(req, res) {
  try {
    const { id } = req.params;
    const formulation = await FeedFormulation.findById(id).lean();

    if (!formulation) {
      return res.status(404).json({ success: false, error: 'Formulation not found' });
    }

    return res.status(200).json({ success: true, data: formulation });
  } catch (err) {
    console.error('Error fetching formulation by ID:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 4. UPDATE FORMULATION
 * PUT /api/feed-med-raw/formulations/:id
 */
export async function updateFormulation(req, res) {
  try {
    const { id } = req.params;
    const {
      feedName,
      feedType,
      consumedBy,
      flockName,
      targetBatchSize = 1000,
      startDate,
      endDate,
      items = [],
      notes,
    } = req.body;

    const formulation = await FeedFormulation.findById(id);
    if (!formulation) {
      return res.status(404).json({ success: false, error: 'Formulation not found' });
    }

    // Check duplicate name
    if (feedName && feedName.trim() !== formulation.feedName) {
      const existing = await FeedFormulation.findOne({
        _id: { $ne: id },
        feedName: { $regex: new RegExp(`^${feedName.trim()}$`, 'i') },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: `A formulation named "${feedName.trim()}" already exists.`,
        });
      }
    }

    const batchSize = Number(targetBatchSize) || formulation.targetBatchSize || 1000;

    let calculatedTotal = 0;
    const processedItems = items.map((item) => {
      const qty = Number(item.quantity) || 0;
      calculatedTotal += qty;
      const pct = batchSize > 0 ? Number(((qty / batchSize) * 100).toFixed(2)) : 0;
      return {
        itemId: item.itemId,
        itemType: item.itemType,
        itemName: item.itemName,
        quantity: qty,
        percentage: pct,
        uom: item.uom || 'kg',
      };
    });

    formulation.feedName = feedName?.trim() || formulation.feedName;
    formulation.feedType = feedType || formulation.feedType;
    formulation.consumedBy = consumedBy || formulation.consumedBy;
    formulation.flockName = flockName?.trim() || formulation.flockName;
    formulation.targetBatchSize = batchSize;
    formulation.totalWeight = Number(calculatedTotal.toFixed(3));
    formulation.startDate = startDate || null;
    formulation.endDate = endDate || null;
    formulation.items = processedItems;
    formulation.notes = notes !== undefined ? notes.trim() : formulation.notes;

    await formulation.save();

    return res.status(200).json({
      success: true,
      message: 'Formulation updated successfully',
      data: formulation,
    });
  } catch (err) {
    console.error('Error updating formulation:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * 5. TOGGLE STATUS (Active / Inactive)
 * PATCH /api/feed-med-raw/formulations/:id/toggle-status
 */
export async function toggleFormulationStatus(req, res) {
  try {
    const { id } = req.params;
    const formulation = await FeedFormulation.findById(id);

    if (!formulation) {
      return res.status(404).json({ success: false, error: 'Formulation not found' });
    }

    formulation.isActive = !formulation.isActive;
    await formulation.save();

    return res.status(200).json({
      success: true,
      message: `Formulation marked as ${formulation.isActive ? 'Active' : 'Inactive'}`,
      data: formulation,
    });
  } catch (err) {
    console.error('Error toggling status:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}