import mongoose from 'mongoose';
import Firm from '../../models/Firm.js';
import Worker from '../models/Worker.js';
import WorkLocation from '../models/WorkLocation.js';
import Designation from '../models/Designation.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import { badRequest, notFoundError } from '../../utils/http.js';
import { firmScope } from '../authorization.js';
import { objectId, dateOnly, text, pagination } from '../validation.js';

export function deploymentInstant(value, label = 'Effective date/time') {
  if (typeof value !== 'string') throw badRequest(`${label} is required.`);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    dateOnly(value, label);
    // Both farms use Asia/Kolkata. Calendar dates start at Indian midnight.
    return new Date(`${value}T00:00:00+05:30`);
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) throw badRequest(`${label} must be YYYY-MM-DD or an ISO timestamp with timezone.`);
  dateOnly(match[1], label);
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59 ||
      Number(match[6] || 0) > 14 || Number(match[7] || 0) > 59 ||
      (Number(match[6]) === 14 && Number(match[7]) !== 0)) throw badRequest(`${label} is invalid.`);
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) throw badRequest(`${label} is invalid.`);
  return instant;
}

export function initialDeploymentPayload(body, dateOfJoining) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Initial deployment is required.');
  if (Object.keys(body).some((key) => !['workLocation', 'supervisor', 'effectiveFrom', 'reason'].includes(key))) {
    throw badRequest('Initial deployment contains unsupported or read-only fields.');
  }
  const fallbackDate = dateOfJoining || new Date().toISOString().slice(0, 10);
  const result = {
    workLocation: body.workLocation ? objectId(body.workLocation, 'Work location') : null,
    effectiveFrom: deploymentInstant(body.effectiveFrom ?? fallbackDate),
    reason: body.reason === undefined ? 'Initial deployment' : text(body.reason, 'Reason', 1000, true),
  };
  if (body.supervisor !== undefined) result.supervisor = body.supervisor === null ? null : objectId(body.supervisor, 'Supervisor');
  if (dateOfJoining && result.effectiveFrom < deploymentInstant(dateOfJoining, 'Date of joining')) {
    throw badRequest('Deployment cannot start before the worker’s joining date.');
  }
  return result;
}

export function effectiveAtFilter(at) {
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw badRequest('Invalid deployment lookup time.');
  // Half-open intervals: [from, to). At a transfer boundary only the new row applies.
  return { effectiveFrom: { $lte: at }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }] };
}

export async function findEffectiveDeployment(workerId, at, { session = null, scope = {} } = {}) {
  const rows = await WorkerDeployment.find({ worker: workerId, ...scope, ...effectiveAtFilter(at) })
    .sort({ effectiveFrom: -1, _id: -1 }).limit(2).session(session).lean();
  if (rows.length > 1) {
    const error = new Error('Deployment history overlaps. An administrator must correct it before attendance can be marked.');
    error.status = 409;
    throw error;
  }
  return rows.length ? deploymentView(rows[0]) : null;
}

function deploymentView(item) {
  const result = item.toObject ? item.toObject() : { ...item };
  return { ...result, active: result.effectiveTo == null };
}

// Must run in the same transaction as worker creation or the legacy-worker lock below.
export async function createInitialRecord(user, worker, data, session) {
  if (!session?.inTransaction()) throw new Error('Initial deployment requires a transaction.');
  firmScope(user, String(worker.firm));
  if (!worker.active) throw badRequest('Worker inactive. Activate the worker before assigning a deployment.');
  if (await WorkerDeployment.exists({ worker: worker._id }).session(session)) {
    const error = new Error('This worker already has deployment history. Use the transfer or correction workflow.');
    error.status = 409;
    throw error;
  }
  // Sequential database operations inside a MongoDB transaction.
  const firm = await Firm.findOne({ _id: worker.firm, active: true }).session(session).lean();
  if (!firm) throw badRequest('Select an active firm.');
  const designation = await Designation.findOne({ _id: worker.designation, firm: worker.firm, active: true }).session(session).lean();
  if (!designation) throw badRequest('Select an active designation belonging to this firm.');

  const isSecurity = /security/i.test(designation.name);
  let location = null;
  if (data.workLocation) {
    location = await WorkLocation.findOne({ _id: data.workLocation, firm: worker.firm, active: true }).session(session).lean();
    if (!location) throw badRequest('Select an active work location belonging to this firm.');
  } else if (!isSecurity) {
    throw badRequest('Select an active work location belonging to this firm.');
  }

  const supervisorId = data.supervisor === undefined ? (location?.supervisor || null) : data.supervisor;
  let supervisor = null;
  if (supervisorId) {
    if (String(supervisorId) === String(worker._id)) throw badRequest('A worker cannot supervise themselves.');
    const supervisorDesignations = await Designation.find({ firm: worker.firm, name: /supervisor/i }).select('_id').lean();
    const desigIds = supervisorDesignations.map((d) => d._id);
    supervisor = await Worker.findOne({
      _id: supervisorId,
      firm: worker.firm,
      active: true,
      $or: [{ isSupervisor: true }, { designation: { $in: desigIds } }],
    }).session(session).lean();
    if (supervisor.dateOfJoining && data.effectiveFrom < deploymentInstant(supervisor.dateOfJoining, 'Supervisor joining date')) {
      throw badRequest('Deployment cannot start before the supervisor’s joining date.');
    }
  }
  const [record] = await WorkerDeployment.create([{
    worker: worker._id, firm: worker.firm, workLocation: location?._id || null, designation: designation._id,
    supervisor: supervisor?._id || null, workerCodeSnapshot: worker.workerCode,
    workerNameSnapshot: worker.fullName, firmNameSnapshot: firm.name,
    workLocationNameSnapshot: location?.name || 'None', designationNameSnapshot: designation.name,
    supervisorNameSnapshot: supervisor?.fullName || '', allocationType: 'INITIAL',
    effectiveFrom: data.effectiveFrom, effectiveTo: null, reason: data.reason, createdBy: user._id,
  }], { session });
  return deploymentView(record);
}

export async function assignInitialDeployment(user, id, body) {
  const workerId = objectId(id, 'Worker');
  return mongoose.connection.transaction(async (session) => {
    // Serializes two initial assignments and conflicts with concurrent worker edits.
    const worker = await Worker.findOneAndUpdate(
      { _id: workerId, ...firmScope(user) }, { $inc: { __v: 1 } }, { new: true, session },
    );
    if (!worker) throw notFoundError('Worker not found.');
    const data = initialDeploymentPayload(body, worker.dateOfJoining);
    return createInitialRecord(user, worker, data, session);
  });
}

async function requireVisibleWorker(user, id) {
  const worker = objectId(id, 'Worker');
  const scope = firmScope(user);
  if (!await Worker.exists({ _id: worker, ...scope }) && !await WorkerDeployment.exists({ worker, ...scope })) {
    throw notFoundError('Worker not found.');
  }
  return worker;
}

export async function currentDeployment(user, id, query) {
  const workerId = await requireVisibleWorker(user, id);
  const at = query.at === undefined ? new Date() : deploymentInstant(query.at, 'Lookup date/time');
  return { at, deployment: await findEffectiveDeployment(workerId, at, { scope: firmScope(user) }) };
}

export async function listDeployments(user, query, workerId) {
  const { page, limit, skip } = pagination(query);
  const filter = { ...firmScope(user, query.firmId) };
  if (workerId !== undefined) filter.worker = await requireVisibleWorker(user, workerId);
  else if (query.workerId !== undefined) filter.worker = await requireVisibleWorker(user, query.workerId);
  for (const key of ['workLocation', 'designation', 'supervisor']) {
    if (query[key] && query[key] !== 'all') filter[key] = objectId(query[key], key);
  }
  if (query.at !== undefined) Object.assign(filter, effectiveAtFilter(deploymentInstant(query.at, 'Lookup date/time')));
  const [items, total] = await Promise.all([
    WorkerDeployment.find(filter).sort({ effectiveFrom: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    WorkerDeployment.countDocuments(filter),
  ]);
  return { items: items.map(deploymentView), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

/**
 * Transfers a worker to a new work location (Shed Transfer)
 * or to a new firm (Inter-Firm Transfer) with atomic continuity and audit log.
 */
export async function transferWorker(user, id, body = {}) {
  const workerId = objectId(id, 'Worker');
  const reason = body.reason !== undefined
    ? text(body.reason, 'Reason', 1000, true)
    : (body.toFirmId ? 'Inter-firm transfer' : 'Shed transfer');
  const effectiveFrom = deploymentInstant(body.effectiveFrom, 'Effective date');
  const toWorkLocationId = objectId(body.toWorkLocation, 'Destination work location');
  const toFirmId = body.toFirmId ? objectId(body.toFirmId, 'Destination firm') : null;
  const toDesignationId = body.toDesignation ? objectId(body.toDesignation, 'Destination designation') : null;
  const supervisorId = body.supervisor !== undefined ? (body.supervisor === null ? null : objectId(body.supervisor, 'Supervisor')) : undefined;

  return mongoose.connection.transaction(async (session) => {
    const worker = await Worker.findById(workerId).session(session);
    if (!worker) throw notFoundError('Worker not found.');

    firmScope(user, String(worker.firm));
    if (!worker.active) throw badRequest('Cannot transfer an inactive worker. Reactivate the worker first.');

    // Find current active deployment
    const currentDep = await WorkerDeployment.findOne({ worker: worker._id, effectiveTo: null }).session(session);
    if (!currentDep) throw badRequest('Worker has no active deployment to transfer from.');

    if (effectiveFrom < currentDep.effectiveFrom) {
      throw badRequest('Transfer effective date cannot be before the current deployment start date.');
    }

    const isInterFirm = Boolean(toFirmId && String(toFirmId) !== String(worker.firm));
    const targetFirmId = isInterFirm ? toFirmId : worker.firm;

    if (isInterFirm) {
      firmScope(user, String(targetFirmId));
      if (!toDesignationId) throw badRequest('Destination designation is required for inter-firm transfer.');
    }

    const destFirm = await Firm.findOne({ _id: targetFirmId, active: true }).session(session).lean();
    if (!destFirm) throw badRequest('Destination firm not found or inactive.');

    const destLocation = await WorkLocation.findOne({ _id: toWorkLocationId, firm: targetFirmId, active: true }).session(session).lean();
    if (!destLocation) throw badRequest('Destination work location not found or inactive in target firm.');

    const destDesignationId = toDesignationId || currentDep.designation;
    const destDesignation = await Designation.findOne({ _id: destDesignationId, firm: targetFirmId, active: true }).session(session).lean();
    if (!destDesignation) throw badRequest('Destination designation not found or inactive in target firm.');

    const resolvedSupervisorId = supervisorId === undefined ? destLocation.supervisor : supervisorId;
    let supervisor = null;
    if (resolvedSupervisorId) {
      if (String(resolvedSupervisorId) === String(worker._id)) throw badRequest('A worker cannot supervise themselves.');
      const supervisorDesignations = await Designation.find({ firm: targetFirmId, name: /supervisor/i }).select('_id').lean();
      const desigIds = supervisorDesignations.map((d) => d._id);
      supervisor = await Worker.findOne({
        _id: resolvedSupervisorId,
        firm: targetFirmId,
        active: true,
        $or: [{ isSupervisor: true }, { designation: { $in: desigIds } }],
      }).session(session).lean();
      if (!supervisor) throw badRequest('Selected supervisor is invalid or inactive in target firm.');
      if (supervisor.dateOfJoining && effectiveFrom < deploymentInstant(supervisor.dateOfJoining, 'Supervisor joining date')) {
        throw badRequest('Deployment cannot start before the supervisor’s joining date.');
      }
    }

    // 1. Close current deployment
    currentDep.effectiveTo = effectiveFrom;
    await currentDep.save({ session });

    // 2. Create new deployment
    const [newDep] = await WorkerDeployment.create([{
      worker: worker._id,
      firm: targetFirmId,
      workLocation: destLocation._id,
      designation: destDesignation._id,
      supervisor: supervisor?._id || null,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName,
      firmNameSnapshot: destFirm.name,
      workLocationNameSnapshot: destLocation.name,
      designationNameSnapshot: destDesignation.name,
      supervisorNameSnapshot: supervisor?.fullName || '',
      allocationType: isInterFirm ? 'FARM_TRANSFER' : 'SHED_TRANSFER',
      effectiveFrom,
      effectiveTo: null,
      reason,
      createdBy: user._id,
    }], { session });

    // 3. Update worker firm/designation if inter-firm
    if (isInterFirm) {
      worker.firm = targetFirmId;
      worker.designation = destDesignation._id;
      await worker.save({ session });
    }

    // 4. Create immutable audit log
    await AttendanceAuditLog.create([{
      firm: targetFirmId,
      firmNameSnapshot: destFirm.name,
      worker: worker._id,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName,
      entityType: 'WORKER_DEPLOYMENT',
      entityId: newDep._id,
      action: isInterFirm ? 'FARM_TRANSFER' : 'SHED_TRANSFER',
      previousValue: {
        firmId: currentDep.firm,
        firmName: currentDep.firmNameSnapshot,
        workLocationId: currentDep.workLocation,
        workLocationName: currentDep.workLocationNameSnapshot,
        designationId: currentDep.designation,
        designationName: currentDep.designationNameSnapshot,
        effectiveFrom: currentDep.effectiveFrom,
        effectiveTo: currentDep.effectiveTo,
      },
      newValue: {
        firmId: newDep.firm,
        firmName: newDep.firmNameSnapshot,
        workLocationId: newDep.workLocation,
        workLocationName: newDep.workLocationNameSnapshot,
        designationId: newDep.designation,
        designationName: newDep.designationNameSnapshot,
        effectiveFrom: newDep.effectiveFrom,
      },
      reason,
      performedBy: user._id,
      performedByName: user.name || 'Admin',
      performedByRole: user.role || 'admin',
    }], { session });

    return {
      worker,
      deployment: deploymentView(newDep),
    };
  });
}

 