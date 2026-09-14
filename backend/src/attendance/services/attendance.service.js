import { correctionActor } from './supervisor.service.js';
import { requireRegisteredWorker } from './registeredUser.service.js';
import mongoose from 'mongoose';
import Worker from '../models/Worker.js';
import AttendanceEvent from '../models/AttendanceEvent.js';
import AttendanceSession from '../models/AttendanceSession.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import { findEffectiveDeployment } from './deployment.service.js';
import { normalizeAttendanceLocation } from './location.service.js';
import { firmScope } from '../authorization.js';
import { objectId, pagination, dateOnly, text } from '../validation.js';
import { badRequest, notFoundError, conflictError, forbiddenError } from '../../utils/http.js';

export const DUPLICATE_COOLDOWN_MS = 60 * 1000; // 60 seconds duplicate protection window

export function indiaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

export function formatWorkedHours(minutes) {
  if (typeof minutes !== 'number' || minutes < 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
}

export async function recordAttendance(user, payload = {}, options = {}) {
  const { workerId, eventType, source = 'MANUAL', location = null, remarks = '', date, timestamp } = payload;
  let now = options.now instanceof Date ? options.now : new Date();

  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!isNaN(parsed.getTime())) now = parsed;
  } else if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const curr = options.now instanceof Date ? options.now : new Date();
    const hh = String(curr.getHours()).padStart(2, '0');
    const mm = String(curr.getMinutes()).padStart(2, '0');
    const ss = String(curr.getSeconds()).padStart(2, '0');
    const parsed = new Date(`${date}T${hh}:${mm}:${ss}+05:30`);
    if (!isNaN(parsed.getTime())) now = parsed;
  }

  let resolvedEventType = eventType;
  if (!resolvedEventType || resolvedEventType === 'AUTO') {
    resolvedEventType = 'AUTO';
  } else if (!['DUTY_IN', 'DUTY_OUT', 'LUNCH_OUT', 'LUNCH_IN', 'LUNCH'].includes(resolvedEventType)) {
    throw badRequest('Event type must be DUTY_IN, DUTY_OUT, LUNCH_OUT, LUNCH_IN, LUNCH, or AUTO.');
  }

  if (!['FACE', 'MANUAL', 'TEST', 'CORRECTION'].includes(source)) {
    throw badRequest('Source must be FACE, MANUAL, TEST, or CORRECTION.');
  }

  const workerObjectId = objectId(workerId, 'Worker');

  // Location normalization: optional, never blocks attendance
  const normalizedLocation = normalizeAttendanceLocation(location, now);

  const executeInSession = async (dbSession) => {
    // 1. Verify worker exists and is accessible by current user's assigned firms
    const worker = await Worker.findById(workerObjectId).session(dbSession);
    if (!worker) throw notFoundError('Worker not found.');

    const scope = firmScope(user, worker.firm);
    if (!scope) throw forbiddenError('You do not have access to this worker’s firm.');

    if (!worker.active) {
      throw badRequest(`Worker ${worker.fullName} (${worker.workerCode}) is inactive. Inactive workers cannot mark attendance.`);
    }

    await requireRegisteredWorker(worker, dbSession);

    if (source === 'FACE' && worker.faceStatus !== 'REGISTERED') {
      throw badRequest(`Worker ${worker.fullName} does not have a registered face profile. Please enrol their face first.`);
    }

    // 2. Find effective deployment at this instant
    let deployment = await findEffectiveDeployment(worker._id, now, { session: dbSession });
    if (!deployment) {
      // Fallback: if marking attendance on a past/test date, check if worker has an initial/earliest deployment
      const earliestDeployment = await WorkerDeployment.findOne({ worker: worker._id })
        .sort({ effectiveFrom: 1 })
        .session(dbSession)
        .lean();
      if (earliestDeployment) {
        deployment = earliestDeployment;
      } else {
        throw badRequest(`Worker ${worker.fullName} has no active deployment at this time. Assign a work location before recording attendance.`);
      }
    }

    const todayDate = indiaDateString(now);

    // If worker's formal joining date is after this attendance date, auto-adjust joining date so they aren't marked unjoined or absent
    if (worker.dateOfJoining && todayDate < worker.dateOfJoining) {
      worker.dateOfJoining = todayDate;
      await worker.save({ session: dbSession });
    }

    // 3. Duplicate scan protection: check the worker's latest event
    const lastEvent = await AttendanceEvent.findOne({ worker: worker._id })
      .sort({ timestamp: -1 })
      .session(dbSession);

    if (lastEvent) {
      const elapsedMs = Math.abs(now.getTime() - lastEvent.timestamp.getTime());
      if (elapsedMs < DUPLICATE_COOLDOWN_MS) {
        throw conflictError('2 times not allowed: Attendance already marked. Duplicate scan detected.');
      }
    }

    // Fetch existing attendance sessions for this date
    let openSession = await AttendanceSession.findOne({
      worker: worker._id,
      date: todayDate,
      status: 'PRESENT',
    }).session(dbSession);

    // If there is an open session from another date (e.g. night shift started yesterday), handle overnight checkout
    if (!openSession) {
      const anyOpenSession = await AttendanceSession.findOne({
        worker: worker._id,
        status: 'PRESENT',
      }).session(dbSession);

      if (anyOpenSession && anyOpenSession.date !== todayDate) {
        const elapsedHours = (now.getTime() - anyOpenSession.dutyIn.getTime()) / (1000 * 60 * 60);
        // If night shift started within the last 16 hours and this is an OUT scan or AUTO scan, close the night shift!
        if (elapsedHours >= 0.25 && elapsedHours <= 16 && resolvedEventType !== 'DUTY_IN') {
          openSession = anyOpenSession;
        } else {
          anyOpenSession.status = 'DUTY_COMPLETED';
          if (!anyOpenSession.dutyOut) {
            anyOpenSession.dutyOut = new Date(anyOpenSession.dutyIn.getTime() + 8 * 60 * 60 * 1000);
            anyOpenSession.workedMinutes = 480;
          }
          await anyOpenSession.save({ session: dbSession });
        }
      }
    }

    const completedTodaySession = await AttendanceSession.findOne({
      worker: worker._id,
      date: todayDate,
      status: 'DUTY_COMPLETED',
    }).sort({ dutyOut: -1 }).session(dbSession);

    const MIN_AUTO_DUTY_OUT_MS = 15 * 60 * 1000; // 15 mins minimum between IN and auto-OUT

    // Auto-resolve event type if LUNCH or AUTO:
    if (resolvedEventType === 'LUNCH') {
      if (!openSession) {
        if (completedTodaySession) {
          const outTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(completedTodaySession.dutyOut);
          throw conflictError(`2 times not allowed: Worker ${worker.fullName} has already completed duty today (Marked OUT at ${outTime}).`);
        }
        throw badRequest(`Cannot mark lunch: Worker ${worker.fullName} has not checked in for duty today.`);
      }
      resolvedEventType = openSession.onLunch ? 'LUNCH_IN' : 'LUNCH_OUT';
    } else if (resolvedEventType === 'AUTO') {
      if (openSession) {
        if (openSession.onLunch) {
          // Worker is on lunch, so scanning in Auto mode means returning from lunch!
          resolvedEventType = 'LUNCH_IN';
        } else {
          const elapsedSinceIn = now.getTime() - openSession.dutyIn.getTime();
          if (elapsedSinceIn < MIN_AUTO_DUTY_OUT_MS) {
            const inTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(openSession.dutyIn);
            throw conflictError(`2 times not allowed: Worker ${worker.fullName} is already marked IN since ${inTime}. Cannot mark again!`);
          }
          resolvedEventType = 'DUTY_OUT';
        }
      } else if (completedTodaySession) {
        const outTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(completedTodaySession.dutyOut);
        throw conflictError(`2 times not allowed: Worker ${worker.fullName} has already completed duty today (Marked OUT at ${outTime}). Duplicate attendance not allowed.`);
      } else {
        resolvedEventType = 'DUTY_IN';
      }
    }

    if (resolvedEventType === 'DUTY_IN') {
      // 4. Handle DUTY_IN
      if (openSession) {
        if (openSession.onLunch) {
          throw conflictError(`Worker ${worker.fullName} is currently on lunch break. Please mark LUNCH_IN to return from lunch.`);
        }
        const inTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(openSession.dutyIn);
        throw conflictError(`2 times not allowed: Worker ${worker.fullName} is already marked IN since ${inTime}. Mark DUTY_OUT before checking in again.`);
      }

      if (completedTodaySession) {
        const outTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(completedTodaySession.dutyOut);
        throw conflictError(`2 times not allowed: Worker ${worker.fullName} has already completed duty today (Marked OUT at ${outTime}). Duplicate IN not allowed.`);
      }

      // Create immutable event
      const [event] = await AttendanceEvent.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        eventType: 'DUTY_IN',
        timestamp: now,
        attendanceDate: todayDate,
        source,
        location: normalizedLocation,
        recordedBy: user._id,
        remarks: typeof remarks === 'string' ? remarks.slice(0, 1000) : '',
      }], { session: dbSession });

      // Create attendance session
      const [sessionDoc] = await AttendanceSession.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        date: todayDate,
        dutyIn: now,
        inEvent: event._id,
        inLocation: normalizedLocation,
        status: 'PRESENT',
      }], { session: dbSession });

      // Link event to session
      event.sessionId = sessionDoc._id;
      await event.save({ session: dbSession });

      const timeFormatted = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(now);
      return {
        message: `DUTY IN recorded for ${worker.fullName} at ${timeFormatted}.`,
        event: event.toObject(),
        session: sessionDoc.toObject(),
        workedDuration: null,
      };
    }

    if (resolvedEventType === 'LUNCH_OUT') {
      // Handle LUNCH_OUT (Leaving farm for lunch - shift remains OPEN)
      if (!openSession) {
        if (completedTodaySession) {
          const outTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(completedTodaySession.dutyOut);
          throw conflictError(`2 times not allowed: Worker ${worker.fullName} has already completed duty today (Marked OUT at ${outTime}).`);
        }
        throw badRequest(`Cannot mark LUNCH_OUT: Worker ${worker.fullName} has not checked in for duty today.`);
      }

      if (openSession.onLunch) {
        const outTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(openSession.lunchOut);
        throw conflictError(`2 times not allowed: Worker ${worker.fullName} is already on lunch break since ${outTime}!`);
      }

      if (openSession.lunchIn) {
        const inTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(openSession.lunchIn);
        throw conflictError(`2 times not allowed: Worker ${worker.fullName} already completed lunch break today (Returned at ${inTime}).`);
      }

      // Create immutable event
      const [event] = await AttendanceEvent.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        eventType: 'LUNCH_OUT',
        timestamp: now,
        attendanceDate: todayDate,
        source,
        location: normalizedLocation,
        sessionId: openSession._id,
        recordedBy: user._id,
        remarks: typeof remarks === 'string' ? remarks.slice(0, 1000) : '',
      }], { session: dbSession });

      openSession.lunchOut = now;
      openSession.lunchOutEvent = event._id;
      openSession.onLunch = true;
      await openSession.save({ session: dbSession });

      const timeFormatted = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(now);
      return {
        message: `🍱 Lunch break started for ${worker.fullName} at ${timeFormatted}.`,
        event: event.toObject(),
        session: openSession.toObject(),
        workedDuration: null,
      };
    }

    if (resolvedEventType === 'LUNCH_IN') {
      // Handle LUNCH_IN (Returning from lunch - shift continues)
      if (!openSession) {
        throw badRequest(`Cannot mark LUNCH_IN: Worker ${worker.fullName} has not checked in for duty today.`);
      }

      if (!openSession.onLunch) {
        if (openSession.lunchIn) {
          const inTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(openSession.lunchIn);
          throw conflictError(`2 times not allowed: Worker ${worker.fullName} has already returned from lunch at ${inTime}.`);
        }
        throw badRequest(`Cannot mark LUNCH_IN: Worker ${worker.fullName} has not marked lunch out.`);
      }

      const lunchDurationMs = now.getTime() - openSession.lunchOut.getTime();
      const lunchMinutes = Math.max(0, Math.round(lunchDurationMs / (60 * 1000)));

      // Create immutable event
      const [event] = await AttendanceEvent.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        eventType: 'LUNCH_IN',
        timestamp: now,
        attendanceDate: todayDate,
        source,
        location: normalizedLocation,
        sessionId: openSession._id,
        recordedBy: user._id,
        remarks: typeof remarks === 'string' ? remarks.slice(0, 1000) : '',
      }], { session: dbSession });

      openSession.lunchIn = now;
      openSession.lunchInEvent = event._id;
      openSession.onLunch = false;
      openSession.lunchMinutes = lunchMinutes;
      await openSession.save({ session: dbSession });

      const lunchDurationStr = formatWorkedHours(lunchMinutes);
      const timeFormatted = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(now);
      return {
        message: `🍱 Returned from lunch at ${timeFormatted}. Lunch break duration: ${lunchDurationStr}.`,
        event: event.toObject(),
        session: openSession.toObject(),
        workedDuration: lunchDurationStr,
      };
    }

    if (resolvedEventType === 'DUTY_OUT') {
      // 5. Handle DUTY_OUT (End of workday)
      if (!openSession) {
        if (completedTodaySession) {
          const outTime = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(completedTodaySession.dutyOut);
          throw conflictError(`2 times not allowed: Worker ${worker.fullName} has already marked OUT for today at ${outTime}. Cannot mark OUT twice!`);
        }
        throw badRequest(`Cannot mark DUTY_OUT: Worker ${worker.fullName} has not marked IN today.`);
      }

      // If worker was still on lunch break when marking DUTY_OUT, auto-conclude lunch
      if (openSession.onLunch && openSession.lunchOut) {
        const lunchElapsedMs = now.getTime() - openSession.lunchOut.getTime();
        openSession.lunchMinutes = Math.max(0, Math.round(lunchElapsedMs / (60 * 1000)));
        openSession.lunchIn = now;
        openSession.onLunch = false;
      }

      // Check min duration from IN
      const elapsedSinceIn = now.getTime() - openSession.dutyIn.getTime();
      if (elapsedSinceIn < DUPLICATE_COOLDOWN_MS) {
        throw conflictError('2 times not allowed: Duplicate scan detected. Please wait before checking out.');
      }

      const grossMinutes = Math.max(0, Math.round(elapsedSinceIn / (60 * 1000)));
      const lunchMins = openSession.lunchMinutes || 0;
      const netWorkedMinutes = Math.max(0, grossMinutes - lunchMins);

      // Create immutable event
      const [event] = await AttendanceEvent.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        eventType: 'DUTY_OUT',
        timestamp: now,
        attendanceDate: todayDate,
        source,
        location: normalizedLocation,
        sessionId: openSession._id,
        recordedBy: user._id,
        remarks: typeof remarks === 'string' ? remarks.slice(0, 1000) : '',
      }], { session: dbSession });

      // Update session to DUTY_COMPLETED
      openSession.dutyOut = now;
      openSession.outEvent = event._id;
      openSession.outLocation = normalizedLocation;
      openSession.workedMinutes = netWorkedMinutes;
      openSession.status = 'DUTY_COMPLETED';
      await openSession.save({ session: dbSession });

      const workedDurationStr = formatWorkedHours(netWorkedMinutes);
      const lunchSuffix = lunchMins > 0 ? ` (Lunch: ${formatWorkedHours(lunchMins)} deducted)` : '';
      const timeFormatted = new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(now);
      return {
        message: `DUTY OUT recorded for ${worker.fullName} at ${timeFormatted}. Net worked: ${workedDurationStr}${lunchSuffix}.`,
        event: event.toObject(),
        session: openSession.toObject(),
        workedDuration: workedDurationStr,
      };
    }
  };

  if (options.session) {
    return executeInSession(options.session);
  }

  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => {
      result = await executeInSession(dbSession);
    });
    return result;
  } finally {
    await dbSession.endSession();
  }
}

export async function getWorkerAttendanceStatus(user, workerId, at = new Date()) {
  const worker = await Worker.findById(objectId(workerId, 'Worker')).lean();
  if (!worker) throw notFoundError('Worker not found.');

  firmScope(user, worker.firm);

  const deployment = await findEffectiveDeployment(worker._id, at);
  const todayDate = indiaDateString(at);

  const activeSession = await AttendanceSession.findOne({ worker: worker._id, status: 'PRESENT' }).lean();
  const latestTodaySession = activeSession || (await AttendanceSession.findOne({ worker: worker._id, date: todayDate }).sort({ createdAt: -1 }).lean());

  const status = activeSession ? 'PRESENT' : latestTodaySession?.status === 'DUTY_COMPLETED' ? 'DUTY_COMPLETED' : 'NOT_REPORTED';

  return {
    worker: {
      _id: worker._id,
      workerCode: worker.workerCode,
      fullName: worker.fullName,
      active: worker.active,
      isSupervisor: worker.isSupervisor,
    },
    status,
    currentDeployment: deployment,
    session: latestTodaySession,
    workedDuration: latestTodaySession?.workedMinutes ? formatWorkedHours(latestTodaySession.workedMinutes) : null,
  };
}

export async function listAttendanceEvents(user, query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { ...firmScope(user, query.firmId) };

  if (query.workerId) filter.worker = objectId(query.workerId, 'Worker');
  if (query.workLocation) filter.workLocation = objectId(query.workLocation, 'Work location');
  if (query.eventType) {
    if (!['DUTY_IN', 'DUTY_OUT', 'LUNCH_OUT', 'LUNCH_IN'].includes(query.eventType)) throw badRequest('Invalid event type.');
    filter.eventType = query.eventType;
  }
  if (query.date) {
    dateOnly(query.date, 'Date');
    filter.attendanceDate = query.date;
  }

  const [items, total] = await Promise.all([
    AttendanceEvent.find(filter).sort({ timestamp: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    AttendanceEvent.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function listAttendanceSessions(user, query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { ...firmScope(user, query.firmId) };

  if (query.workerId) filter.worker = objectId(query.workerId, 'Worker');
  if (query.workLocation) filter.workLocation = objectId(query.workLocation, 'Work location');
  if (query.status) {
    if (!['PRESENT', 'DUTY_COMPLETED', 'ABSENT'].includes(query.status)) throw badRequest('Invalid status.');
    filter.status = query.status;
  }
  if (query.date) {
    dateOnly(query.date, 'Date');
    filter.date = query.date;
  }

  const [items, total] = await Promise.all([
    AttendanceSession.find(filter).sort({ dutyIn: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    AttendanceSession.countDocuments(filter),
  ]);

  return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

function parseAttendanceInstant(value, dateStr, label) {
  if (!value) throw badRequest(`${label} is required.`);
  if (value instanceof Date) return value;
  if (typeof value !== 'string') throw badRequest(`${label} must be a valid date or time.`);
  if (/^(\d{2}):(\d{2})(?::(\d{2}))?$/.test(value)) {
    const timeWithSeconds = value.length === 5 ? `${value}:00` : value;
    const d = new Date(`${dateStr}T${timeWithSeconds}+05:30`);
    if (!Number.isFinite(d.getTime())) throw badRequest(`${label} is invalid.`);
    return d;
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw badRequest(`${label} is invalid.`);
  return d;
}

/**
 * Administrative Attendance Correction.
 * Allows an authorized admin to correct or insert attendance with mandatory justification and audit trail.
 */
export async function correctAttendanceSession(user, payload = {}) {
  const { workerId, date, dutyIn, dutyOut, lunchOut, lunchIn, reason, sessionId } = payload;

  const workerObjectId = objectId(workerId, 'Worker');
  const targetDate = dateOnly(date, 'Date');
  const justification = text(reason || 'Attendance edited', 'Reason', 1000, true);

  const dutyInDate = parseAttendanceInstant(dutyIn, targetDate, 'Duty IN');
  const dutyOutDate = dutyOut ? parseAttendanceInstant(dutyOut, targetDate, 'Duty OUT') : null;

  if (dutyOutDate && dutyOutDate <= dutyInDate) {
    throw badRequest('Duty OUT must be after Duty IN.');
  }

  const lunchOutDate = lunchOut ? parseAttendanceInstant(lunchOut, targetDate, 'Lunch OUT') : null;
  const lunchInDate = lunchIn ? parseAttendanceInstant(lunchIn, targetDate, 'Lunch IN') : null;

  let lunchMinutes = 0;
  if (lunchOutDate && lunchInDate) {
    if (lunchInDate <= lunchOutDate) {
      throw badRequest('Lunch IN must be after Lunch OUT.');
    }
    lunchMinutes = Math.max(0, Math.floor((lunchInDate.getTime() - lunchOutDate.getTime()) / 60000));
  }

  const grossMinutes = dutyOutDate
    ? Math.max(0, Math.floor((dutyOutDate.getTime() - dutyInDate.getTime()) / 60000))
    : 0;
  const workedMinutes = Math.max(0, grossMinutes - lunchMinutes);

  const executeCorrection = async (dbSession) => {
    const worker = await Worker.findById(workerObjectId).session(dbSession);
    if (!worker) throw notFoundError('Worker not found.');

    firmScope(user, worker.firm);

    // Effective deployment at dutyIn
    const deployment = await findEffectiveDeployment(worker._id, dutyInDate, { session: dbSession });
    if (!deployment) {
      throw badRequest('Worker has no active deployment at this attendance date/time.');
    }

    const actor = await correctionActor(user, worker, deployment);
    if (indiaDateString(dutyInDate) !== targetDate) throw badRequest('Duty IN must belong to the selected attendance date.');
    if (dutyInDate > new Date() || (dutyOutDate && dutyOutDate > new Date())) throw badRequest('Attendance corrections cannot be in the future.');

    // Bind an existing session to the requested worker, date and authorized deployment before writing anything.
    let session = null;
    let previousValue = null;
    if (sessionId) {
      session = await AttendanceSession.findOne({ _id: objectId(sessionId, 'Session'), worker: worker._id, date: targetDate }).session(dbSession);
      if (!session) throw badRequest('The selected session does not belong to this worker and date.');
    } else {
      const sessions = await AttendanceSession.find({ worker: worker._id, date: targetDate }).limit(2).session(dbSession);
      if (sessions.length > 1) throw badRequest('Multiple sessions exist. Select the session to correct.');
      session = sessions[0] || null;
    }
    if (session) {
      firmScope(user, session.firm);
      if (actor.role === 'supervisor' && (String(session.supervisor) !== String(deployment.supervisor) || String(session.firm) !== String(deployment.firm))) {
        throw forbiddenError('This attendance session is not assigned to you.');
      }
    }

    // Create immutable events for the correction
    const [inEvent] = await AttendanceEvent.create([{
      worker: worker._id,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName,
      firm: deployment.firm,
      firmNameSnapshot: deployment.firmNameSnapshot,
      workLocation: deployment.workLocation,
      workLocationNameSnapshot: deployment.workLocationNameSnapshot,
      designation: deployment.designation,
      designationNameSnapshot: deployment.designationNameSnapshot,
      supervisor: deployment.supervisor || null,
      supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
      eventType: 'DUTY_IN',
      timestamp: dutyInDate,
      attendanceDate: targetDate,
      source: 'CORRECTION',
      location: { status: 'NOT_PROVIDED' },
      remarks: justification,
      recordedBy: actor._id,
    }], { session: dbSession });

    let outEvent = null;
    if (dutyOutDate) {
      [outEvent] = await AttendanceEvent.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        eventType: 'DUTY_OUT',
        timestamp: dutyOutDate,
        attendanceDate: targetDate,
        source: 'CORRECTION',
        location: { status: 'NOT_PROVIDED' },
        remarks: justification,
        recordedBy: actor._id,
      }], { session: dbSession });
    }

    const newStatus = dutyOutDate ? 'DUTY_COMPLETED' : 'PRESENT';

    if (session) {
      previousValue = {
        dutyIn: session.dutyIn,
        dutyOut: session.dutyOut,
        workedMinutes: session.workedMinutes,
        status: session.status,
        remarks: session.remarks,
      };

      session.dutyIn = dutyInDate;
      session.inEvent = inEvent._id;
      session.dutyOut = dutyOutDate;
      session.outEvent = outEvent ? outEvent._id : null;
      session.lunchOut = lunchOutDate;
      session.lunchIn = lunchInDate;
      session.lunchMinutes = lunchMinutes;
      session.onLunch = false;
      session.workedMinutes = workedMinutes;
      session.status = newStatus;
      session.remarks = justification;
      await session.save({ session: dbSession });
    } else {
      [session] = await AttendanceSession.create([{
        worker: worker._id,
        workerCodeSnapshot: worker.workerCode,
        workerNameSnapshot: worker.fullName,
        firm: deployment.firm,
        firmNameSnapshot: deployment.firmNameSnapshot,
        workLocation: deployment.workLocation,
        workLocationNameSnapshot: deployment.workLocationNameSnapshot,
        designation: deployment.designation,
        designationNameSnapshot: deployment.designationNameSnapshot,
        supervisor: deployment.supervisor || null,
        supervisorNameSnapshot: deployment.supervisorNameSnapshot || '',
        date: targetDate,
        dutyIn: dutyInDate,
        inEvent: inEvent._id,
        dutyOut: dutyOutDate,
        outEvent: outEvent ? outEvent._id : null,
        lunchOut: lunchOutDate,
        lunchIn: lunchInDate,
        lunchMinutes,
        onLunch: false,
        workedMinutes,
        status: newStatus,
        remarks: justification,
      }], { session: dbSession });
    }

    // Create immutable audit log entry
    await AttendanceAuditLog.create([{
      firm: deployment.firm,
      firmNameSnapshot: deployment.firmNameSnapshot,
      worker: worker._id,
      workerCodeSnapshot: worker.workerCode,
      workerNameSnapshot: worker.fullName,
      entityType: 'ATTENDANCE_SESSION',
      entityId: session._id,
      action: 'CORRECTION',
      previousValue,
      newValue: {
        date: targetDate,
        dutyIn: dutyInDate,
        dutyOut: dutyOutDate,
        workedMinutes,
        status: newStatus,
      },
      reason: justification,
      performedBy: actor._id,
      performedByName: actor.name || 'Admin',
      performedByRole: actor.role,
    }], { session: dbSession });

    return { session };
  };

  const dbSession = await mongoose.startSession();
  try {
    let result;
    await dbSession.withTransaction(async () => { result = await executeCorrection(dbSession); });
    return result;
  } finally {
    await dbSession.endSession();
  }
}


