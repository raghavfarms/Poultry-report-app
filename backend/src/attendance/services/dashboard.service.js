import Firm from '../../models/Firm.js';
import Worker from '../models/Worker.js';
import WorkLocation from '../models/WorkLocation.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceSession from '../models/AttendanceSession.js';
import AttendanceEvent from '../models/AttendanceEvent.js';
import { firmScope } from '../authorization.js';
import { objectId, dateOnly } from '../validation.js';
import { indiaDateString, formatWorkedHours } from './attendance.service.js';
import { notFoundError, badRequest } from '../../utils/http.js';

/**
 * Aggregates real-time workforce headcount, shed-wise manpower,
 * bird capacity allocations, and live staff feed.
 */
export async function getLiveDashboardData(user, query = {}) {
  const now = new Date();
  const todayDate = indiaDateString(now);

  // 1. Resolve target date (defaults to today's date in Asia/Kolkata)
  let targetDate = todayDate;
  if (query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      throw badRequest('Date must be formatted as YYYY-MM-DD.');
    }
    targetDate = dateOnly(query.date, 'date');
  }

  // 2. Resolve target firm with strict permission scoping
  let firmId = query.firmId;
  if (!firmId) {
    if (user.role === 'developer') {
      const firstFirm = await Firm.findOne({ active: true }).sort({ name: 1 }).select('_id').lean();
      if (firstFirm) firmId = String(firstFirm._id);
    } else {
      const permitted = (user.firms || []).map((id) => String(id._id || id));
      if (permitted.length > 0) firmId = permitted[0];
    }
  }

  if (!firmId) {
    throw badRequest('Please specify a firmId.');
  }

  firmScope(user, firmId); // validates user has access to this firm
  const firmObjectId = objectId(firmId, 'Firm');

  const firm = await Firm.findById(firmObjectId).select('name code active').lean();
  if (!firm) throw notFoundError('Firm not found.');

  // 3. Parallel queries for active workers, active sheds/locations, open deployments, sessions, and events
  const [activeWorkers, workLocations, openDeployments, sessions, recentEvents] = await Promise.all([
    Worker.find({ firm: firmObjectId, active: true })
      .select('fullName workerCode photo designation faceStatus')
      .populate('designation', 'name')
      .lean(),

    WorkLocation.find({ firm: firmObjectId, active: true })
      .sort({ order: 1, name: 1 })
      .populate('supervisor', 'fullName workerCode')
      .lean(),

    WorkerDeployment.find({ firm: firmObjectId, effectiveTo: null })
      .select('worker workLocation designation supervisor')
      .lean(),

    AttendanceSession.find({ firm: firmObjectId, date: targetDate })
      .select('worker workerCodeSnapshot workerNameSnapshot workLocation workLocationNameSnapshot designationNameSnapshot supervisorNameSnapshot dutyIn dutyOut workedMinutes status inLocation outLocation remarks inEvent')
      .populate('inEvent', 'source')
      .sort({ dutyIn: -1 })
      .lean(),

    AttendanceEvent.find({ firm: firmObjectId, date: targetDate })
      .sort({ timestamp: -1 })
      .limit(15)
      .select('worker workerCodeSnapshot workerNameSnapshot eventType timestamp source workLocationNameSnapshot location')
      .lean(),
  ]);

  // 4. Classify sessions & compute KPIs
  const onDutySessions = sessions.filter((s) => s.status === 'PRESENT');
  const completedSessions = sessions.filter((s) => s.status === 'DUTY_COMPLETED');
  const uniqueAttendedWorkerIds = new Set(sessions.map((s) => String(s.worker)));

  const totalActiveWorkers = activeWorkers.length;
  const onDutyCount = onDutySessions.length;
  const completedCount = completedSessions.length;
  const notReportedCount = Math.max(0, totalActiveWorkers - uniqueAttendedWorkerIds.size);
  const attendanceRatePercent = totalActiveWorkers > 0
    ? Math.round(((onDutyCount + completedCount) / totalActiveWorkers) * 100)
    : 0;

  const totalWorkedMinutes = completedSessions.reduce((acc, s) => acc + (s.workedMinutes || 0), 0);

  // 5. Aggregate Shed Manpower and Bird Capacity
  const deploymentCountByLocation = new Map();
  for (const dep of openDeployments) {
    const locKey = String(dep.workLocation);
    deploymentCountByLocation.set(locKey, (deploymentCountByLocation.get(locKey) || 0) + 1);
  }

  const sheds = workLocations.map((loc) => {
    const locId = String(loc._id);
    const assignedCount = deploymentCountByLocation.get(locId) || 0;
    const locSessions = sessions.filter((s) => String(s.workLocation) === locId);
    const locOnDuty = locSessions.filter((s) => s.status === 'PRESENT').length;
    const locCompleted = locSessions.filter((s) => s.status === 'DUTY_COMPLETED').length;
    const locNotReported = Math.max(0, assignedCount - (locOnDuty + locCompleted));

    let birdCapacity = null;
    if (loc.type === 'SHED' && loc.birdCapacity) {
      const male = loc.birdCapacity.male || 0;
      const female = loc.birdCapacity.female || 0;
      birdCapacity = { male, female, total: male + female };
    }

    const coveragePercent = assignedCount > 0
      ? Math.round((locOnDuty / assignedCount) * 100)
      : 0;

    return {
      _id: loc._id,
      name: loc.name,
      type: loc.type,
      order: loc.order,
      birdCapacity,
      supervisor: loc.supervisor ? {
        _id: loc.supervisor._id,
        fullName: loc.supervisor.fullName,
        workerCode: loc.supervisor.workerCode,
      } : null,
      assignedCount,
      onDutyCount: locOnDuty,
      completedCount: locCompleted,
      notReportedCount: locNotReported,
      coveragePercent,
    };
  });

  // 6. Build Live On-Duty Staff List
  const onDutyStaff = onDutySessions.map((session) => {
    const dutyInTime = new Date(session.dutyIn).getTime();
    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - dutyInTime) / 60000));
    return {
      sessionId: session._id,
      workerId: session.worker,
      workerCode: session.workerCodeSnapshot,
      workerName: session.workerNameSnapshot,
      designationName: session.designationNameSnapshot,
      workLocationId: session.workLocation,
      workLocationName: session.workLocationNameSnapshot,
      supervisorName: session.supervisorNameSnapshot,
      dutyIn: session.dutyIn,
      elapsedMinutes,
      elapsedFormatted: formatWorkedHours(elapsedMinutes),
      source: session.inEvent?.source || 'MANUAL',
      inLocation: session.inLocation,
      remarks: session.remarks,
    };
  });

  return {
    firm: {
      _id: firm._id,
      name: firm.name,
      code: firm.code,
    },
    date: targetDate,
    isToday: targetDate === todayDate,
    generatedAt: now.toISOString(),
    summary: {
      totalActiveWorkers,
      onDutyCount,
      completedCount,
      notReportedCount,
      attendanceRatePercent,
      totalWorkedMinutes,
      totalWorkedHoursFormatted: formatWorkedHours(totalWorkedMinutes),
    },
    sheds,
    onDutyStaff,
    recentActivity: recentEvents.map((evt) => ({
      _id: evt._id,
      workerId: evt.worker,
      workerCode: evt.workerCodeSnapshot,
      workerName: evt.workerNameSnapshot,
      eventType: evt.eventType,
      timestamp: evt.timestamp,
      source: evt.source,
      workLocationName: evt.workLocationNameSnapshot,
      location: evt.location,
    })),
  };
}
