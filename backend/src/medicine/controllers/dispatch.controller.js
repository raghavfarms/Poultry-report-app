import MedicineDispatch from '../models/MedicineDispatch.js';
import MedicineBatch from '../models/MedicineBatch.js';
import MedicineTransaction from '../models/MedicineTransaction.js';
import MedicineMaster from '../models/MedicineMaster.js';
import Firm from '../../models/Firm.js';
import { badRequest, notFoundError } from '../../utils/http.js';

// Auto-generate sequential Dispatch Number: DISP-YYYY-XXXX
async function generateDispatchNumber() {
  const currentYear = new Date().getFullYear();
  const prefix = `DISP-${currentYear}-`;

  const lastDispatch = await MedicineDispatch.findOne({
    dispatchNumber: new RegExp(`^${prefix}`),
  })
    .sort({ createdAt: -1 })
    .lean();

  let nextSequence = 1;
  if (lastDispatch && lastDispatch.dispatchNumber) {
    const parts = lastDispatch.dispatchNumber.split('-');
    const lastSeq = parseInt(parts[2], 10);
    if (!isNaN(lastSeq)) {
      nextSequence = lastSeq + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
}

/**
 * 1. POST /api/medicine/dispatches
 * Create a new Head Office dispatch note (In Transit)
 */
export async function createDispatch(req, res) {
  try {
    const {
      destinationFarm,
      dispatchDate,
      vehicleNumber,
      driverName,
      driverMobile,
      items,
      remarks,
    } = req.body;

    if (!destinationFarm || !items || !Array.isArray(items) || items.length === 0) {
      return badRequest(res, 'Destination farm and at least one dispatch item are required');
    }

    const farm = await Firm.findById(destinationFarm);
    if (!farm || !farm.active) {
      return badRequest(res, 'Selected destination farm does not exist or is inactive');
    }

    const dispatchNumber = await generateDispatchNumber();

    const newDispatch = await MedicineDispatch.create({
      dispatchNumber,
      sourceLocation: 'Head Office Central Store',
      destinationFarm: farm._id,
      dispatchDate: dispatchDate || new Date().toISOString().slice(0, 10),
      vehicleNumber: vehicleNumber?.trim() || '',
      driverName: driverName?.trim() || '',
      driverMobile: driverMobile?.trim() || '',
      items,
      status: 'DISPATCHED',
      dispatchedBy: req.user._id,
      remarks: remarks?.trim() || '',
    });

    const populated = await MedicineDispatch.findById(newDispatch._id)
      .populate('destinationFarm', 'name code')
      .populate('items.medicine', 'code name unit')
      .populate('dispatchedBy', 'name role');

    return res.status(201).json({
      success: true,
      message: `Dispatch ${dispatchNumber} created successfully. In-transit to ${farm.name}.`,
      dispatch: populated,
    });
  } catch (error) {
    console.error('createDispatch error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 2. GET /api/medicine/dispatches
 * List all dispatches with filtering
 */
export async function getDispatches(req, res) {
  try {
    const { destinationFarm, status, search } = req.query;
    const filter = {};

    if (destinationFarm) filter.destinationFarm = destinationFarm;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { dispatchNumber: new RegExp(search.trim(), 'i') },
        { vehicleNumber: new RegExp(search.trim(), 'i') },
        { driverName: new RegExp(search.trim(), 'i') },
      ];
    }

    const dispatches = await MedicineDispatch.find(filter)
      .populate('destinationFarm', 'name code')
      .populate('items.medicine', 'code name unit')
      .populate('dispatchedBy', 'name role')
      .populate('gateArrival.securityGuard', 'name role')
      .populate('storeAcceptance.storekeeper', 'name role')
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      count: dispatches.length,
      dispatches,
    });
  } catch (error) {
    console.error('getDispatches error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 3. POST /api/medicine/dispatches/:id/gate-confirm
 * Farm Gate Security arrival confirmation.
 * Does NOT increase available inventory; marks as GATE_RECEIVED.
 */
export async function confirmGateReceipt(req, res) {
  try {
    const { id } = req.params;
    const { packagesCount, hasVisibleDamage, remarks } = req.body;

    const dispatch = await MedicineDispatch.findById(id);
    if (!dispatch) return notFoundError(res, 'Dispatch not found');

    if (dispatch.status !== 'DISPATCHED') {
      return badRequest(
        res,
        `Cannot confirm gate arrival. Dispatch is currently in '${dispatch.status}' status.`
      );
    }

    dispatch.status = 'GATE_RECEIVED';
    dispatch.gateArrival = {
      arrivedAt: new Date(),
      securityGuard: req.user._id,
      packagesCount: Number(packagesCount) || dispatch.items.length,
      hasVisibleDamage: Boolean(hasVisibleDamage),
      remarks: remarks?.trim() || '',
    };

    await dispatch.save();

    return res.json({
      success: true,
      message: `Security arrival confirmed for ${dispatch.dispatchNumber}. Sent for storekeeper verification.`,
      dispatch,
    });
  } catch (error) {
    console.error('confirmGateReceipt error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * 4. POST /api/medicine/dispatches/:id/store-accept
 * Storekeeper accepts verified physical material.
 * Atomically increments/creates MedicineBatch inventory and logs transaction.
 */
export async function storeAcceptDispatch(req, res) {
  try {
    const { id } = req.params;
    const { remarks } = req.body;

    const dispatch = await MedicineDispatch.findById(id).populate('items.medicine');
    if (!dispatch) return notFoundError(res, 'Dispatch not found');

    if (dispatch.status !== 'GATE_RECEIVED') {
      return badRequest(
        res,
        `Cannot accept into store. Dispatch must first be confirmed at Farm Gate Security (Current status: ${dispatch.status})`
      );
    }

    // Atomically create or increment batch inventory for each item
    for (const item of dispatch.items) {
      let batch = await MedicineBatch.findOne({
        medicine: item.medicine._id,
        batchNumber: item.batchNumber,
        farm: dispatch.destinationFarm,
      });

      if (batch) {
        batch.quantityAvailable += item.dispatchedQuantity;
        batch.initialQuantity += item.dispatchedQuantity;
        if (batch.status === 'DEPLETED') batch.status = 'AVAILABLE';
        await batch.save();
      } else {
        batch = await MedicineBatch.create({
          medicine: item.medicine._id,
          batchNumber: item.batchNumber,
          farm: dispatch.destinationFarm,
          supplier: null, // Internal transfer from Head Office
          manufacturingDate: item.manufacturingDate,
          expiryDate: item.expiryDate,
          initialQuantity: item.dispatchedQuantity,
          quantityAvailable: item.dispatchedQuantity,
          unit: item.unit,
          status: 'AVAILABLE',
        });
      }

      // Log transaction in immutable audit ledger
      await MedicineTransaction.create({
        transactionType: 'TRANSFER_IN',
        medicine: item.medicine._id,
        batch: batch._id,
        batchNumber: item.batchNumber,
        farm: dispatch.destinationFarm,
        quantity: item.dispatchedQuantity,
        unit: item.unit,
        balanceAfter: batch.quantityAvailable,
        referenceModel: 'MedicineDispatch',
        referenceId: dispatch._id,
        performedBy: req.user._id,
        remarks: `Transferred via ${dispatch.dispatchNumber} from Head Office Store. ${remarks || ''}`.trim(),
      });
    }

    dispatch.status = 'STORE_ACCEPTED';
    dispatch.storeAcceptance = {
      acceptedAt: new Date(),
      storekeeper: req.user._id,
      acceptedQuantity: dispatch.items.reduce((acc, it) => acc + it.dispatchedQuantity, 0),
      remarks: remarks?.trim() || '',
    };

    await dispatch.save();

    return res.json({
      success: true,
      message: `Dispatch ${dispatch.dispatchNumber} accepted into store. Live batch stock updated!`,
      dispatch,
    });
  } catch (error) {
    console.error('storeAcceptDispatch error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
