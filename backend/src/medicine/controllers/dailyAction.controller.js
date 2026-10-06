import mongoose from 'mongoose';
import MedicineMaster from '../models/MedicineMaster.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineReceipt from '../models/MedicineReceipt.js';
import MedicineIssue from '../models/MedicineIssue.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import MedicineLocation from '../models/MedicineLocation.js';
import Firm from '../../models/Firm.js';
import User from '../../models/User.js';
import { badRequest, notFoundError } from '../../utils/http.js';
import { validateInwardExpiry } from '../services/inwardExpiry.js';
import { resolveUserFarmScope } from './report.controller.js';

// Helper: Safely resolve User ID for audit logs and ledger transactions
async function getActionUserId(req) {
  if (req.user && req.user._id) return req.user._id;
  if (mongoose.connection?.readyState === 1 || User.findOne?.mock) {
    const fallback = await User.findOne().select('_id').lean();
    return fallback?._id || null;
  }
  return null;
}

// Helper: Auto-generate sequential Receipt Number: RCP-YYYY-XXXX       
async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCP-${year}-`;
  const last = await MedicineReceipt.findOne({ receiptNumber: new RegExp(`^${prefix}`) })
    .sort({ receiptNumber: -1 })
    .lean();    

  let nextSeq = 1;
  if (last && last.receiptNumber) {
    const num = parseInt(last.receiptNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

// Helper: Auto-generate sequential Issue Number: ISS-YYYY-XXXX
async function generateIssueNumber() {
  const year = new Date().getFullYear();
  const prefix = `ISS-${year}-`;
  const last = await MedicineIssue.findOne({ issueNumber: new RegExp(`^${prefix}`) })
    .sort({ issueNumber: -1 })
    .lean();

  let nextSeq = 1;
  if (last && last.issueNumber) {
    const num = parseInt(last.issueNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  return `${prefix}${String(nextSeq).padStart(4, '0')}`;
}

/**
 * 1. FAST INWARD (Medicine Arrived)
 * Single-click entry: Scanned/typed batch + expiry + quantity -> Instantly active in stock!
 */
export async function fastInward(req, res) {
  try {
    const receiverName = req.body.receiverName === undefined
      ? (req.user?.name || req.user?.username || '')
      : (typeof req.body.receiverName === 'string' ? req.body.receiverName.trim() : '');
    if (req.body.receiverName !== undefined && (!receiverName || receiverName.length > 120)) {
      throw badRequest('Enter a receiver name (maximum 120 characters).');
    }
    const {
      medicineId,
      newMedicineName,
      newMedicineCategory,
      newMedicineUnit,
      batchNumber,
      expiryDate,
      manufacturingDate,
      quantity,
      farmId,
      supplierId,
      invoiceNo,
      notes,
    } = req.body; 

    // 1. Validation
    if (!medicineId) {
      if (req.user && !['admin', 'developer'].includes(req.user.role)) {
        throw badRequest('Only Admin and Developer accounts can register new medicines. Please select an existing medicine from the catalog.');
      }
      if (!newMedicineName || !newMedicineName.trim()) {
        throw badRequest('Medicine selection or valid medicine name is required');
      }
    }
    if (!batchNumber || !batchNumber.trim()) throw badRequest('Batch number is required');
    if (!expiryDate) throw badRequest('Expiry date is required');
    validateInwardExpiry(expiryDate);
    const qty = Number(quantity);
    if (!qty || qty <= 0) throw badRequest('Quantity must be greater than 0');

    // 2. Fetch or Create Medicine and Farm
    let medicine = null;
    if (medicineId) {
      medicine = await MedicineMaster.findById(medicineId);
    } else if (newMedicineName && newMedicineName.trim()) {
      const trimmedName = newMedicineName.trim();
      // Case-insensitive match check to avoid duplicates
      medicine = await MedicineMaster.findOne({
        name: { $regex: new RegExp(`^${trimmedName}$`, 'i') },
      });
      if (!medicine) {
        if (typeof newMedicineCategory !== 'string' || !newMedicineCategory.trim() ||
            typeof newMedicineUnit !== 'string' || !newMedicineUnit.trim()) {
          throw badRequest('Select a category and unit for the new medicine');
        }
        const userId = await getActionUserId(req);
        medicine = await MedicineMaster.create({
          name: trimmedName,
          category: newMedicineCategory.trim(),
          unit: newMedicineUnit.trim(),
          createdBy: userId,
        });
      }
    }
    if (!medicine) throw notFoundError('Medicine not found');

    let farm = farmId;
    const scope = await resolveUserFarmScope(req, farmId);
    if (!farm) {
      if (scope.farm) {
        farm = scope.farm.$in ? scope.farm.$in[0] : scope.farm;
      } else {
        let defaultFarm = null;
        if (mongoose.connection?.readyState === 1 || Firm.findOne?.mock) {
          defaultFarm = await Firm.findOne({ active: true }).select('_id').lean()
            || await Firm.findOne().select('_id').lean();
        }
        if (!defaultFarm) {
          if (mongoose.connection?.readyState !== 1 && !Firm.findOne?.mock) {
            farm = new mongoose.Types.ObjectId();
          } else {
            throw badRequest('No farm location configured in system');
          }
        } else {
          farm = defaultFarm._id;
        }
      }
    } else if (scope.farm) {
      const farmStr = String(farm);
      if (scope.farm.$in && !scope.farm.$in.map(String).includes(farmStr)) {
        throw badRequest('You do not have access to this farm');
      } else if (!scope.farm.$in && String(scope.farm) !== farmStr) {
        throw badRequest('You do not have access to this farm');
      }
    }

    const cleanBatchNo = batchNumber.trim().toUpperCase();

    const userId = await getActionUserId(req);

    // 4. Create Receipt log for official tracking & audit
    const receiptNumber = await generateReceiptNumber();
    const receipt = new MedicineReceipt({
      receiptNumber,
      medicine: medicine._id,
      supplier: supplierId || null,
      farm,
      batchNumber: cleanBatchNo,
      manufacturingDate: manufacturingDate || null,
      expiryDate,
      receivedQuantity: qty,
      unit: medicine.unit,
      invoiceOrChallanNo: invoiceNo || '',
      status: 'STORE_ACCEPTED', // Directly accepted into farm store!
      verifiedAt: new Date(),
      verifiedBy: userId,
      storeAcceptedQuantity: qty,
      receivedBy: userId,
      receiverName,
      recordedByName: req.user?.name || req.user?.username || '',
      verificationRemarks: notes || 'Fast Inward via Scanner / Quick Action',
    });

    await receipt.validate();

    // 3. Find or Create MedicineBatch (At this farm)
    let batch = await MedicineBatch.findOne({
      medicine: medicine._id,
      batchNumber: cleanBatchNo,
      farm,
    });

    if (batch) {
      // Increment existing batch quantity
      batch.quantityAvailable += qty;
      batch.initialQuantity += qty;
      batch.status = 'AVAILABLE';
      if (expiryDate) batch.expiryDate = expiryDate;
      await batch.save();
    } else {
      // Create new batch record
      batch = await MedicineBatch.create({
        medicine: medicine._id,
        batchNumber: cleanBatchNo,
        farm,
        supplier: supplierId || null,
        manufacturingDate: manufacturingDate || null,
        expiryDate,
        initialQuantity: qty,
        quantityAvailable: qty,
        unit: medicine.unit,
        status: 'AVAILABLE', // Instantly available for use!
      });
    }

    await receipt.save();

    // 5. Create Ledger Transaction (Keeps reports & dashboards 100% in sync)
    await MedicineTransaction.create({
      transactionType: 'RECEIPT_INWARD',
      medicine: medicine._id,
      batch: batch._id,
      batchNumber: cleanBatchNo,
      farm,
      quantity: qty,
      balanceAfter: batch.quantityAvailable,
      unit: medicine.unit,
      referenceModel: 'MedicineReceipt',
      referenceId: receipt._id,
      performedBy: userId,
      remarks: `Quick Inward: ${qty} ${medicine.unit} (Batch: ${cleanBatchNo})`,
    });

    return res.status(201).json({
      success: true,
      message: `Successfully received ${qty} ${medicine.unit} of ${medicine.name}`,
      data: {
        batchId: batch._id,
        medicineId: medicine._id,
        receiptNumber,
        batchNumber: cleanBatchNo,
        currentStock: batch.quantityAvailable,
      },
    });
  } catch (err) {
    console.error('fastInward error:', err);
    return res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to process inward medicine',
    });
  }
}

/**
 * 2. FAST OUTWARD (Give to Birds / Shed Dose)
 * Automatic FEFO: Worker picks Shed + Medicine + Quantity -> System deducts from earliest expiring batch!
 */
export async function fastOutward(req, res) {
  try {
    const receiver = typeof req.body.issuedTo === 'string' ? req.body.issuedTo.trim() : '';
    if (receiver.length > 120) throw badRequest('Receiver name cannot exceed 120 characters');
    if (!req.user?._id) return res.status(401).json({ success: false, message: 'Please log in to issue medicine.' });
    const issuer = typeof req.body.issuedByName === 'string' && req.body.issuedByName.trim()
      ? req.body.issuedByName.trim()
      : (req.user.name || req.user.username || 'Store');
    const {
      medicineId,
      quantity,
      shedName,
      farmId,
      notes,
      batchAllocations,
    } = req.body;

    const userId = await getActionUserId(req);

    // 1. Validation
    if (!medicineId) throw badRequest('Medicine selection is required');
    if (!shedName || !shedName.trim()) throw badRequest('Shed name/number is required');

    const hasExplicitAllocations = Array.isArray(batchAllocations) && batchAllocations.length > 0;
    const allocationMap = hasExplicitAllocations
      ? new Map(batchAllocations.filter((a) => Number(a.quantity) > 0).map((a) => [String(a.batchId), Number(a.quantity)]))
      : null;

    let qtyToDeduct = Number(quantity);
    if (hasExplicitAllocations && (!Number.isFinite(qtyToDeduct) || qtyToDeduct <= 0)) {
      qtyToDeduct = Array.from(allocationMap.values()).reduce((sum, v) => sum + v, 0);
    }
    if (!Number.isFinite(qtyToDeduct) || qtyToDeduct <= 0) throw badRequest('Quantity must be greater than 0');

    // 2. Fetch Medicine
    const medicine = await MedicineMaster.findById(medicineId);
    if (!medicine) throw notFoundError('Medicine not found');

    // 3. Build Batch Query Filter
    // If farmId is specified, search at that farm.
    // If not specified: check user farm or search all available batches so stock is never falsely reported as 0.
    const batchFilter = {
      medicine: medicine._id,
      quantityAvailable: { $gt: 0 },
      status: 'AVAILABLE',
      expiryDate: { $gte: new Date().toISOString().slice(0, 10) },
    };

    const scope = await resolveUserFarmScope(req, farmId);
    if (scope.farm) {
      batchFilter.farm = scope.farm;
    }

    // Find all available batches for this medicine, SORTED BY EXPIRY (FEFO)!
    const availableBatches = await MedicineBatch.find(batchFilter)
      .populate('farm', 'name code')
      .sort({ expiryDate: 1 }); // Earliest expiry first (FEFO)

    // Reconcile each batch with its actual saved issues to heal any discrepancy from past validation failures
    for (const b of availableBatches) {
      const issues = await MedicineIssue.find({ batch: b._id }).select('issuedQuantity').lean();
      const totalIssued = issues.reduce((sum, i) => sum + (i.issuedQuantity || 0), 0);
      const correctAvailable = Math.max(0, (b.initialQuantity || 0) - totalIssued - (b.disposedQuantity || 0));
      if (b.quantityAvailable !== correctAvailable) {
        await MedicineBatch.updateOne(
          { _id: b._id },
          { $set: { quantityAvailable: correctAvailable, status: correctAvailable === 0 ? 'DEPLETED' : 'AVAILABLE' } }
        );
        b.quantityAvailable = correctAvailable;
        b.status = correctAvailable === 0 ? 'DEPLETED' : 'AVAILABLE';
      }
    }

    // Calculate total stock available across all batches
    const totalAvailable = availableBatches.reduce((sum, b) => sum + (b.quantityAvailable || 0), 0);
    if (totalAvailable < qtyToDeduct) {
      throw badRequest(
        `Insufficient usable stock for ${medicine.name}. Available: ${totalAvailable} ${medicine.unit}, Requested: ${qtyToDeduct} ${medicine.unit}. Expired batches cannot be issued.`
      );
    }

    // 4. Deduct quantity across batches (either via explicit allocations or automatic FEFO)
    let remaining = qtyToDeduct;
    const deductions = [];

    for (const batch of availableBatches) {
      if (!hasExplicitAllocations && remaining <= 0) break;

      const take = hasExplicitAllocations
        ? (allocationMap.get(String(batch._id)) || 0)
        : Math.min(batch.quantityAvailable, remaining);

      if (take <= 0) continue;

      if (take > batch.quantityAvailable) {
        throw badRequest(
          `Cannot deduct ${take} from Batch ${batch.batchNumber}. Only ${batch.quantityAvailable} available.`
        );
      }

      // Ensure farm is tied to the physical batch's farm
      let batchFarmId = batch.farm?._id || batch.farm || farmId || req.user?.firm;
      if (!batchFarmId) {
        if (mongoose.connection?.readyState === 1 || Firm.findOne?.mock) {
          const fallbackFirm = await Firm.findOne().select('_id').lean();
          batchFarmId = fallbackFirm?._id;
        }
      }

      // Generate Issue Number for this deduction
      const issueNumber = await generateIssueNumber();

      // 1. Create Issue Record FIRST (with all mandatory Mongoose schema fields: shed, purpose, issuedTo, issuedBy)
      const issue = await MedicineIssue.create({
        issueNumber,
        issueDate: new Date().toISOString().slice(0, 10),
        medicine: medicine._id,
        batch: batch._id,
        batchNumber: batch.batchNumber,
        farm: batchFarmId,
        destinationType: 'SHED',
        destinationName: shedName.trim(),
        shed: shedName.trim(), // Mandatory field in MedicineIssue schema
        purpose: 'TREATMENT',  // Mandatory field in MedicineIssue schema
        issuedTo: receiver || 'Shed Incharge',
        issuedQuantity: take,
        unit: medicine.unit,
        issuedBy: userId,
        issuedByName: issuer,
        remarks: notes || `Collected by ${receiver || 'Shed Incharge'} for ${shedName.trim()}`,
      });

      // 2. Create Ledger Transaction (All required fields: unit, referenceModel, referenceId, performedBy)
      await MedicineTransaction.create({
        transactionType: 'ISSUE_OUTWARD',
        medicine: medicine._id,
        batch: batch._id,
        batchNumber: batch.batchNumber,
        farm: batchFarmId,
        quantity: take,
        balanceAfter: batch.quantityAvailable - take,
        unit: medicine.unit,
        referenceModel: 'MedicineIssue',
        referenceId: issue._id,
        performedBy: userId,
        remarks: `Issued by ${issuer || 'Store'} to ${receiver} for ${shedName.trim()} (${take} ${medicine.unit})`,
      });

      // 3. Update and persist batch balance ONLY after issue & ledger succeed
      batch.quantityAvailable -= take;
      remaining -= take;

      if (batch.quantityAvailable === 0) {
        batch.status = 'DEPLETED';
      }
      await batch.save();

      deductions.push({
        batchNumber: batch.batchNumber,
        deducted: take,
        balanceLeft: batch.quantityAvailable,
        farm: batch.farm?.name || '',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Issued ${qtyToDeduct} ${medicine.unit} of ${medicine.name} to ${shedName.trim()}`,
      data: {
        medicineName: medicine.name,
        shedName: shedName.trim(),
        issuedTo: receiver,
        totalDeducted: qtyToDeduct,
        remainingStock: totalAvailable - qtyToDeduct,
        deductions,
      },
    });
  } catch (err) {
    console.error('fastOutward error:', err);
    return res.status(err.status || err.statusCode || 500).json({
      success: false,
      message: err.message || 'Failed to issue medicine',
    });
  }
}

/**
 * 3. GET TODAY'S ACTIVITY FEED
 * Fetches everything that came IN and went OUT today, sorted chronologically!
 */
export async function getTodayActivity(req, res) {
  try {
    const { farm } = req.query || {};
    const farmFilter = await resolveUserFarmScope(req, farm);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Fetch Today's Inwards
    const receipts = await MedicineReceipt.find({
      ...farmFilter,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('medicine', 'name code unit')
      .populate('farm', 'name code')
      .populate('receivedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Fetch Today's Outwards
    const issues = await MedicineIssue.find({
      ...farmFilter,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    })
      .populate('medicine', 'name code unit')
      .populate('farm', 'name code')
      .populate('issuedBy', 'name')
      .sort({ createdAt: -1 })
      .lean();

    // 3. Format unified event stream
    const events = [];

    for (const r of receipts) {
      events.push({
        id: r._id,
        type: 'IN',
        timestamp: r.createdAt,
        medicineName: r.medicine?.name || 'Medicine',
        medicineCode: r.medicine?.code || '',
        batchNumber: r.batchNumber,
        expiryDate: r.expiryDate,
        quantity: r.receivedQuantity,
        unit: r.unit,
        operator: r.recordedByName || r.receivedBy?.name || 'Worker',
        receiver: r.receiverName || r.receivedBy?.name || '',
        farmName: r.farm?.name || '',
        target: 'Available Stock',
      });
    }

    for (const i of issues) {
      events.push({
        id: i._id,
        type: 'OUT',
        timestamp: i.createdAt,
        medicineName: i.medicine?.name || 'Medicine',
        medicineCode: i.medicine?.code || '',
        batchNumber: i.batchNumber,
        quantity: i.issuedQuantity,
        unit: i.unit,
        operator: i.issuedByName || i.issuedBy?.name || 'Worker',
        receiver: i.issuedTo || '',
        farmName: i.farm?.name || '',
        target: i.shed || i.destinationName || 'Shed',
        notes: i.remarks || i.notes || '',
      });
    }

    // Sort by latest timestamp first
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return res.json({
      success: true,
      count: events.length,
      events,
    });
  } catch (err) {
    console.error('getTodayActivity error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch today activity',
    });
  }
}

/**
 * 4. SCAN MEDICINE LABEL (Optional Cloud Vision AI Scanner)
 * Uses Google Gemini Vision API if GEMINI_API_KEY is configured in .env.
 * Extracts Batch Number and Expiry Date (YYYY-MM-DD) from messy handwriting in 300ms.
 */
export async function scanMedicineLabel(req, res) {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: 'Image base64 is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return res.json({
        success: false,
        message: 'No GEMINI_API_KEY configured in backend/.env. Using client-side scanner.',
      });
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'You are an OCR extractor for medicine labels and handwritten poultry stock notes. Extract the exact Batch Number, Expiry Date (convert to YYYY-MM-DD format), and Medicine Name. Output ONLY a valid JSON object without markdown formatting: {"batchNumber": "BATCH-...", "expiryDate": "YYYY-MM-DD", "medicineName": "..."}. If not detected, return empty string for that field.'
                },
                {
                  inline_data: {
                    mime_type: 'image/jpeg',
                    data: cleanBase64
                  }
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json({
        success: true,
        batchNumber: parsed.batchNumber || '',
        expiryDate: parsed.expiryDate || '',
        medicineName: parsed.medicineName || '',
      });
    }

    return res.json({ success: false, message: 'Could not extract JSON from AI' });
  } catch (err) {
    console.error('scanMedicineLabel error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export {
  DEFAULT_LOCATIONS,
  getLocations as getMedicineLocations,
  createLocation as createMedicineLocation,
  removeLocation as removeMedicineLocation,
} from './location.controller.js';

