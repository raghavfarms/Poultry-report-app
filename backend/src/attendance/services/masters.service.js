import User from '../../models/User.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Firm from '../../models/Firm.js';
import Designation from '../models/Designation.js';
import WorkLocation from '../models/WorkLocation.js';
import AttendanceGeofence from '../models/AttendanceGeofence.js';
import Worker from '../models/Worker.js';
import WorkerCounter from '../models/WorkerCounter.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import AttendanceSession from '../models/AttendanceSession.js';
import AttendanceEvent from '../models/AttendanceEvent.js';
import WorkerFaceProfile from '../models/WorkerFaceProfile.js';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialRecord, initialDeploymentPayload } from './deployment.service.js';
import { getWorkLocationSortRank } from './report.service.js';
import { badRequest, notFoundError } from '../../utils/http.js';
import { firmScope, sortFirms } from '../authorization.js';
import { masterPayload, workerPayload, objectId, pagination, searchFilter, validateWorkerDates } from '../validation.js';

const masterModels = { designations: Designation, 'work-locations': WorkLocation, geofences: AttendanceGeofence };
export function locationWithCapacity(item) {
  const result = item.toObject ? item.toObject() : { ...item };
  result.birdCapacity = result.birdCapacity == null ? null : {
    male: result.birdCapacity.male,
    female: result.birdCapacity.female,
    total: result.birdCapacity.male + result.birdCapacity.female,
  };
  return result;
}

function validateLocationCapacity(item) {
  if (item.type !== 'SHED' && item.birdCapacity != null) throw badRequest('Bird capacity can only be assigned to a shed. Clear capacity before changing its type.');
}

export async function firmCapacity(user, query) {
  const scope = firmScope(user, query.firmId);
  const firms = sortFirms(await Firm.find({ active: true, ...(scope.firm ? { _id: scope.firm } : {}) })
    .select('name code').lean());
  const totals = await WorkLocation.aggregate([
    { $match: { firm: { $in: firms.map((firm) => firm._id) }, active: true, type: 'SHED' } },
    { $group: {
      _id: '$firm', shedCount: { $sum: 1 },
      configuredSheds: { $sum: { $cond: [{ $ne: [{ $ifNull: ['$birdCapacity', null] }, null] }, 1, 0] } },
      male: { $sum: { $ifNull: ['$birdCapacity.male', 0] } },
      female: { $sum: { $ifNull: ['$birdCapacity.female', 0] } },
    } },
  ]);
  const byFirm = new Map(totals.map((item) => [String(item._id), item]));
  return { firms: firms.map((firm) => {
    const count = byFirm.get(String(firm._id)) || { shedCount: 0, configuredSheds: 0, male: 0, female: 0 };
    return {
      firm, shedCount: count.shedCount, configuredSheds: count.configuredSheds,
      unconfiguredSheds: count.shedCount - count.configuredSheds,
      capacityComplete: count.shedCount > 0 && count.configuredSheds === count.shedCount,
      birdCapacity: { male: count.male, female: count.female, total: count.male + count.female },
    };
  }) };
}
const workerPopulation = [
  { path: 'firm', select: 'name code active' },
  { path: 'designation', select: 'name active' },
];

async function activeFirm(user, id) {
  firmScope(user, String(id));
  const firm = await Firm.findOne({ _id: id, active: true }).lean();
  if (!firm) throw badRequest('Select an active firm.');
  return firm;
}

async function validDesignation(id, firm) {
  if (!await Designation.exists({ _id: id, firm, active: true })) throw badRequest('Select an active designation belonging to this firm.');
}

async function validSupervisor(id, firm) {
  if (id) {
    const supervisorDesignations = await Designation.find({ firm, name: /supervisor/i }).select('_id').lean();
    const desigIds = supervisorDesignations.map((d) => d._id);
    const exists = await Worker.exists({
      _id: id,
      firm,
      active: true,
      $or: [{ isSupervisor: true }, { designation: { $in: desigIds } }],
    });
    if (!exists) throw badRequest('Select an active supervisor belonging to this firm.');
  }
}

async function pageResult(Model, filter, query, sort, populate = []) {
  const { page, limit, skip } = pagination(query);
  const [items, total] = await Promise.all([
    Model.find(filter).sort(sort).skip(skip).limit(limit).populate(populate).lean(),
    Model.countDocuments(filter),
  ]);
  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function listMasters(kind, user, query) {
  let filter = { ...searchFilter(query, ['name']) };
  const scope = firmScope(user, query.firmId);
  if (kind === 'geofences') {
    if (scope.firm) {
      filter.$or = [{ firm: scope.firm }, { firm: null }];
    }
  } else {
    filter = { ...filter, ...scope };
  }
  if (kind === 'work-locations' && query.type !== undefined) {
    if (!['SHED', 'MISCELLANEOUS'].includes(query.type)) throw badRequest('Invalid location type.');
    filter.type = query.type;
  }
  const result = await pageResult(masterModels[kind], filter, query, { order: 1, name: 1, _id: 1 }, [
    { path: 'firm', select: 'name code active' },
    ...(kind === 'work-locations' ? [{ path: 'supervisor', select: 'fullName workerCode active' }] : []),
  ]);
  if (kind === 'work-locations') {
    result.items = result.items.map(locationWithCapacity);
    result.items.sort((a, b) => {
      const rankA = getWorkLocationSortRank(a.name, a.type, a.order);
      const rankB = getWorkLocationSortRank(b.name, b.type, b.order);
      if (rankA !== rankB) return rankA - rankB;
      return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  }
  return result;
}

export async function getMaster(kind, user, id) {
  const scope = firmScope(user);
  let filter = { _id: objectId(id) };
  if (kind === 'geofences') {
    if (scope.firm) filter.$or = [{ firm: scope.firm }, { firm: null }];
  } else {
    filter = { ...filter, ...scope };
  }
  const item = await masterModels[kind].findOne(filter);
  if (!item) throw notFoundError('Record not found.');
  return item;
}

export async function createMaster(kind, user, body) {
  const data = masterPayload(kind, body, true);
  if (data.firm) {
    await activeFirm(user, data.firm);
  }
  if (kind === 'work-locations') {
    validateLocationCapacity(data);
    await validSupervisor(data.supervisor, data.firm);
  }
  const item = await masterModels[kind].create({ ...data, createdBy: user._id });
  return kind === 'work-locations' ? locationWithCapacity(item) : item;
}

export async function updateMaster(kind, user, id, body) {
  const data = masterPayload(kind, body);
  const item = await getMaster(kind, user, id);
  if (item.firm) {
    await activeFirm(user, item.firm);
  }
  if (data.firm) {
    await activeFirm(user, data.firm);
  }
  if (kind === 'work-locations' && data.supervisor !== undefined) await validSupervisor(data.supervisor, item.firm);
  item.set(data);
  if (kind === 'work-locations') validateLocationCapacity(item);
  await item.save();
  return kind === 'work-locations' ? locationWithCapacity(item) : item;
}

export async function deleteMaster(kind, user, id) {
  const item = await getMaster(kind, user, id);
  if (item.firm) {
    await activeFirm(user, item.firm);
  }
  if (kind === 'designations') {
    const assignedWorkers = await Worker.countDocuments({ designation: item._id });
    if (assignedWorkers > 0) {
      throw badRequest(`Cannot delete designation "${item.name}" because ${assignedWorkers} worker(s) are assigned to it. Deactivate it instead.`);
    }
  } else if (kind === 'work-locations') {
    const assignedDeployments = await WorkerDeployment.countDocuments({ location: item._id, active: true });
    if (assignedDeployments > 0) {
      throw badRequest(`Cannot delete location "${item.name}" because active worker deployments exist here. Deactivate it instead.`);
    }
  }
  await item.deleteOne();
  return { message: `${item.name} deleted successfully.` };
}

export function workerCodePrefix(firmCode) {
  const prefix = { RAGHAV: 'RGF', SANJANA: 'SJF', OFFICE: 'OFC' }[firmCode];
  if (!prefix) throw badRequest('Worker ID prefix is not configured for this firm.');
  return prefix;
}

export async function nextWorkerCode(firmCode) {
  const prefix = workerCodePrefix(firmCode);
  const increment = () => WorkerCounter.findOneAndUpdate(
    { _id: prefix }, { $inc: { sequence: 1 } }, { upsert: true, new: true, runValidators: true },
  );
  let counter;
  try { counter = await increment(); }
  catch (error) {
    // The first concurrent upserts can race on the counter's unique _id.
    if (error.code !== 11000) throw error;
    counter = await increment();
  }
  // Reserve outside future deployment transactions: a failed creation may leave a gap,
  // but an allocated number is never reissued.
  return `${prefix}-${String(counter.sequence).padStart(4, '0')}`;
}

export function publicWorker(worker) {
  const result = worker.toObject ? worker.toObject() : { ...worker };
  delete result.aadhaarNumber;
  delete result.bankDetails;
  delete result.photographFile;
  delete result.pinHash;
  return result;
}

export async function listWorkers(user, query) {
  const filter = { ...firmScope(user, query.firmId), ...searchFilter(query, ['fullName', 'workerCode', 'mobileNumber', 'referenceName']) };
  if (query.designation !== undefined) filter.designation = objectId(query.designation, 'Designation');
  if (query.isSupervisor !== undefined) {
    if (!['true', 'false'].includes(query.isSupervisor)) throw badRequest('Supervisor filter must be true or false.');
    if (query.isSupervisor === 'true') {
      const supervisorDesignations = await Designation.find({ name: /supervisor/i }).select('_id').lean();
      const desigIds = supervisorDesignations.map((d) => d._id);
      filter.$or = [
        { isSupervisor: true },
        { designation: { $in: desigIds } },
      ];
    } else {
      filter.isSupervisor = false;
    }
  }
  return pageResult(Worker, filter, query, { fullName: 1, _id: 1 }, workerPopulation);
}

export async function getWorker(user, id, sensitive = false) {
  let query = Worker.findOne({ _id: objectId(id, 'Worker'), ...firmScope(user) });
  if (sensitive) query = query.select('+aadhaarNumber +bankDetails');
  const worker = await query.populate(workerPopulation);
  if (!worker) throw notFoundError('Worker not found.');
  if (sensitive) return { aadhaarNumber: worker.aadhaarNumber || null, bankDetails: worker.bankDetails || null };
  return publicWorker(worker);
}

export async function listRegisteredUsers(user, query) {
  const firm = await activeFirm(user, objectId(query.firmId, 'Firm'));
  const linked = await Worker.distinct('userId');
  const filter = { active: true, firms: firm._id, _id: { $nin: linked }, ...searchFilter({ search: query.search }, ['name', 'email']) };
  const { page, limit, skip } = pagination(query);
  const [items, total] = await Promise.all([
    User.find(filter).select('name email').sort({ name: 1, _id: 1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items: items.map(item => ({ ...item, name: item.name + ' (' + item.email + ')', fullName: item.name })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function createWorker(user, body) {
  const firm = await activeFirm(user, objectId(body.firmId, 'Firm'));
  let userId = null;
  let fullName = body.fullName ? String(body.fullName).trim() : '';

  if (body.userId) {
    userId = objectId(body.userId, 'Registered user');
    const account = await User.findOne({ _id: userId, active: true, 'firms.0': { $exists: true } }).lean();
    if (!account) throw badRequest('Select an active user already registered under a firm.');
    if (await Worker.exists({ userId })) throw badRequest('This user already has an attendance worker profile.');
    if (!account.firms.some(id => String(id) === String(firm._id))) throw badRequest('The selected user must be registered under this firm.');
    if (!fullName) fullName = account.name;
  }

  if (!fullName) {
    throw badRequest('Full name is required.');
  }

  const { userId: ignored, ...workerBody } = body;
  const data = {
    ...workerPayload({ ...workerBody, fullName }, true),
    ...(userId ? { userId } : {}),
  };

  const designationDoc = await Designation.findById(data.designation).lean();
  const isSupervisorByDesig = designationDoc && /supervisor/i.test(designationDoc.name);
  if (body.isSupervisor !== undefined) {
    data.isSupervisor = Boolean(body.isSupervisor);
  } else if (isSupervisorByDesig) {
    data.isSupervisor = true;
  }

  const initial = initialDeploymentPayload(body.initialDeployment, data.dateOfJoining);
  await validDesignation(data.designation, data.firm);
  validateWorkerDates({ active: true, ...data });

  // Generate initial PIN (default: last 4 digits of mobile, or '1234')
  const cleanMobile = String(data.mobileNumber || '').replace(/\D/g, '');
  const rawPin = body.pin ? String(body.pin).trim() : (cleanMobile.length >= 4 ? cleanMobile.slice(-4) : '1234');
  const pinHash = await bcrypt.hash(rawPin, 10);

  // Validate before reserving an ID. MongoDB's unique index is the final guarantee.
  const worker = new Worker({ ...data, workerCode: 'PENDING', pinHash, createdBy: user._id });
  await worker.validate();
  const workerCode = await nextWorkerCode(firm.code);
  return mongoose.connection.transaction(async (session) => {
    // Construct a fresh document on each automatic transaction retry.
    const [created] = await Worker.create([{ ...data, workerCode, pinHash, createdBy: user._id }], { session });
    const deployment = await createInitialRecord(user, created, initial, session);
    return { worker: publicWorker(created), deployment };
  });
}

export async function updateWorker(user, id, body) {
  const data = workerPayload(body);
  const worker = await Worker.findOne({ _id: objectId(id, 'Worker'), ...firmScope(user) });
  if (!worker) throw notFoundError('Worker not found.');
  await activeFirm(user, worker.firm);

  let desigDoc = null;
  if (data.designation !== undefined) {
    desigDoc = await Designation.findOne({ _id: data.designation, firm: worker.firm, active: true }).lean();
    if (!desigDoc) throw badRequest('Select an active designation belonging to this firm.');
  }

  if (body.isSupervisor !== undefined) {
    data.isSupervisor = Boolean(body.isSupervisor);
  } else if (desigDoc) {
    if (/supervisor/i.test(desigDoc.name)) {
      data.isSupervisor = true;
    }
  }

  let locDoc = null;
  if (data.workLocation !== undefined && data.workLocation !== null) {
    locDoc = await WorkLocation.findOne({ _id: data.workLocation, firm: worker.firm, active: true }).lean();
    if (!locDoc) throw badRequest('Select an active work location belonging to this firm.');
  }

  if (data.active === true && data.designation === undefined) {
    await validDesignation(worker.designation, worker.firm);
  }

  if (data.dateOfJoining !== undefined && data.dateOfJoining !== worker.dateOfJoining) {
    const firstDep = await WorkerDeployment.findOne({ worker: worker._id }).sort({ effectiveFrom: 1 }).lean();
    if (firstDep && new Date(`${data.dateOfJoining}T00:00:00+05:30`) > firstDep.effectiveFrom) {
      throw badRequest('Date of joining cannot be after the worker’s initial deployment date.');
    }
  }

  if ((data.active === false || data.isSupervisor === false) && await WorkLocation.exists({ supervisor: worker._id, active: true })) {
    throw badRequest('Reassign this supervisor’s active work locations first.');
  }
  if ((data.active === false || data.isSupervisor === false) && await WorkerDeployment.exists({
    supervisor: worker._id, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: new Date() } }],
  })) {
    throw badRequest('Reassign this supervisor’s current or future worker deployments first.');
  }
  if (body.pin) {
    const rawPin = String(body.pin).trim();
    if (rawPin.length < 4 || rawPin.length > 8) throw badRequest('PIN must be 4–8 digits.');
    worker.pinHash = await bcrypt.hash(rawPin, 10);
  }

  // Synchronize active deployment if designation, workLocation, or worker name changed
  const currentDep = await WorkerDeployment.findOne({ worker: worker._id, effectiveTo: null });
  if (currentDep) {
    let depChanged = false;
    const oldValues = {};
    const newValues = {};

    if (desigDoc && String(currentDep.designation) !== String(desigDoc._id)) {
      oldValues.designationId = currentDep.designation;
      oldValues.designationName = currentDep.designationNameSnapshot;
      currentDep.designation = desigDoc._id;
      currentDep.designationNameSnapshot = desigDoc.name;
      newValues.designationId = desigDoc._id;
      newValues.designationName = desigDoc.name;
      depChanged = true;
    }

    if (locDoc && String(currentDep.workLocation) !== String(locDoc._id)) {
      oldValues.workLocationId = currentDep.workLocation;
      oldValues.workLocationName = currentDep.workLocationNameSnapshot;
      currentDep.workLocation = locDoc._id;
      currentDep.workLocationNameSnapshot = locDoc.name;
      newValues.workLocationId = locDoc._id;
      newValues.workLocationName = locDoc.name;
      depChanged = true;
    }

    if (data.fullName && data.fullName !== currentDep.workerNameSnapshot) {
      currentDep.workerNameSnapshot = data.fullName;
      depChanged = true;
    }

    if (depChanged) {
      await currentDep.save();

      try {
        const firmDoc = await Firm.findById(worker.firm).select('name').lean();
        await AttendanceAuditLog.create({
          firm: worker.firm,
          firmNameSnapshot: firmDoc?.name || '',
          worker: worker._id,
          workerCodeSnapshot: worker.workerCode,
          workerNameSnapshot: data.fullName || worker.fullName,
          entityType: 'WORKER_DEPLOYMENT',
          entityId: currentDep._id,
          action: 'CORRECTION',
          previousValue: oldValues,
          newValue: newValues,
          reason: body.reason ? String(body.reason).trim() : 'Worker details correction (designation/location update)',
          performedBy: user._id,
          performedByName: user.name || 'Admin',
          performedByRole: user.role || 'admin',
        });
      } catch (auditErr) {
        console.warn('Audit log creation note:', auditErr.message);
      }
    }
  } else if (locDoc) {
    // No active deployment found, create initial deployment
    try {
      const firmDoc = await Firm.findById(worker.firm).select('name').lean();
      const desig = desigDoc || await Designation.findById(data.designation || worker.designation).lean();
      await WorkerDeployment.create({
        worker: worker._id,
        firm: worker.firm,
        workLocation: locDoc._id,
        designation: desig._id,
        supervisor: locDoc.supervisor || null,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: data.fullName || worker.fullName,
        firmNameSnapshot: firmDoc?.name || '',
        workLocationNameSnapshot: locDoc.name,
        designationNameSnapshot: desig?.name || '',
        supervisorNameSnapshot: '',
        allocationType: 'INITIAL',
        effectiveFrom: worker.dateOfJoining ? new Date(`${worker.dateOfJoining}T00:00:00+05:30`) : new Date(),
        effectiveTo: null,
        reason: 'Initial deployment via worker edit',
        createdBy: user._id,
      });
    } catch (createDepErr) {
      console.warn('Initial deployment creation note:', createDepErr.message);
    }
  }

  const { workLocation: _wl, ...workerData } = data;
  worker.set(workerData);
  validateWorkerDates(worker);
  await worker.save();
  await worker.populate(workerPopulation);
  return publicWorker(worker);
}

export async function deleteWorker(user, id) {
  const worker = await Worker.findOne({ _id: objectId(id, 'Worker'), ...firmScope(user) }).select('+photographFile');
  if (!worker) throw notFoundError('Worker not found.');
  await activeFirm(user, worker.firm);

  // 1. Clear any supervisor references on locations and deployments
  await WorkLocation.updateMany({ supervisor: worker._id }, { $set: { supervisor: null } });
  await WorkerDeployment.updateMany({ supervisor: worker._id }, { $set: { supervisor: null } });

  // 2. Cascade delete all related worker records: deployments, face profiles, attendance sessions and events
  await WorkerDeployment.deleteMany({ worker: worker._id });
  await WorkerFaceProfile.deleteOne({ worker: worker._id });
  await AttendanceSession.deleteMany({ worker: worker._id });
  await AttendanceEvent.deleteMany({ worker: worker._id });

  // 3. Cleanup stored photo file if exists
  if (worker.photographFile?.key) {
    try {
      const root = process.env.ATTENDANCE_PHOTO_DIR || fileURLToPath(new URL('../../../uploads/attendance/', import.meta.url));
      await unlink(path.resolve(root, worker.photographFile.key)).catch(() => {});
    } catch {
      // Non-blocking file cleanup
    }
  }

  // 4. Delete the worker document
  await Worker.deleteOne({ _id: worker._id });

  return { message: `Worker ${worker.fullName} (${worker.workerCode}) deleted successfully.` };
}

