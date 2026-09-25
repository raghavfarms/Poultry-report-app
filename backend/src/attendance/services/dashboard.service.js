import Firm from '../../models/Firm.js';
import Worker from '../models/Worker.js';
import WorkLocation from '../models/WorkLocation.js';
import Designation from '../models/Designation.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceSession from '../models/AttendanceSession.js';
import AttendanceEvent from '../models/AttendanceEvent.js';
import { firmScope, sortFirms } from '../authorization.js';
import { objectId, dateOnly } from '../validation.js';
import { indiaDateString, formatWorkedHours } from './attendance.service.js';
import { getWorkLocationSortRank } from './report.service.js';
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
  if (!firmId || firmId === 'all') {
    if (user.role === 'developer') {
      const allActive = sortFirms(await Firm.find({ active: true }).select('_id name code').lean());
      if (allActive[0]) firmId = String(allActive[0]._id);
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

  // 3. Parallel queries for active workers, active sheds/locations, open deployments, sessions, events, and designations
  const [activeWorkers, workLocations, openDeployments, sessions, recentEvents, firmDesignations] = await Promise.all([
    Worker.find({ firm: firmObjectId, active: true })
      .select('fullName workerCode photo designation gender isSupervisor faceStatus dateOfJoining createdAt')
      .populate('designation', 'name')
      .lean(),

    WorkLocation.find({ firm: firmObjectId, active: true })
      .sort({ order: 1, name: 1 })
      .populate('supervisor', 'fullName workerCode')
      .lean(),

    WorkerDeployment.find({ firm: firmObjectId, effectiveTo: null })
      .select('worker workLocation designation designationNameSnapshot supervisor effectiveFrom')
      .lean(),

    AttendanceSession.find({ firm: firmObjectId, date: targetDate })
      .select('worker workerCodeSnapshot workerNameSnapshot workLocation workLocationNameSnapshot designationNameSnapshot supervisorNameSnapshot dutyIn dutyOut workedMinutes status inLocation outLocation remarks inEvent')
      .populate('inEvent', 'source')
      .sort({ dutyIn: -1 })
      .lean(),

    AttendanceEvent.find({ firm: firmObjectId, $or: [{ attendanceDate: targetDate }, { date: targetDate }] })
      .sort({ timestamp: -1 })
      .limit(15)
      .select('worker workerCodeSnapshot workerNameSnapshot eventType timestamp source workLocationNameSnapshot location')
      .lean(),

    Designation.find({ firm: firmObjectId, active: true })
      .sort({ name: 1 })
      .lean(),
  ]);

  // Sort work locations: Laying Sheds (1, 2...) -> Brood Sheds (1, 2...) -> Other Sheds -> Miscellaneous -> Unassigned
  workLocations.sort((a, b) => {
    const rankA = getWorkLocationSortRank(a.name, a.type, a.order);
    const rankB = getWorkLocationSortRank(b.name, b.type, b.order);
    if (rankA !== rankB) return rankA - rankB;
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
  });

  // 4. Classify sessions & compute KPIs
  const onDutySessions = sessions.filter((s) => s.status === 'PRESENT');
  const completedSessions = sessions.filter((s) => s.status === 'DUTY_COMPLETED');
  const uniqueAttendedWorkerIds = new Set(sessions.map((s) => String(s.worker)));

  const deploymentMap = new Map(openDeployments.map((dep) => [String(dep.worker), dep]));
  const relevantWorkers = activeWorkers.filter((w) => {
    const dep = deploymentMap.get(String(w._id));
    const effectiveJoining = w.dateOfJoining
      || (dep?.effectiveFrom ? indiaDateString(dep.effectiveFrom) : null)
      || (w.createdAt ? indiaDateString(w.createdAt) : null);
    const hasAttended = uniqueAttendedWorkerIds.has(String(w._id));
    if (effectiveJoining && targetDate < effectiveJoining && !hasAttended) {
      return false;
    }
    return true;
  });

  const totalActiveWorkers = relevantWorkers.length;
  const onDutyCount = onDutySessions.length;
  const completedCount = completedSessions.length;
  const notReportedCount = Math.max(0, totalActiveWorkers - uniqueAttendedWorkerIds.size);
  const attendanceRatePercent = totalActiveWorkers > 0
    ? Math.round(((onDutyCount + completedCount) / totalActiveWorkers) * 100)
    : 0;

  const totalWorkedMinutes = completedSessions.reduce((acc, s) => acc + (s.workedMinutes || 0), 0);

  // 5. Aggregate Daily Attendance by Worker (0.5 Half-Day, 1.0 Full-Day/On-Duty, 0 Absent)
  const sessionsByWorker = new Map();
  for (const sess of sessions) {
    const wId = String(sess.worker);
    if (!sessionsByWorker.has(wId)) sessionsByWorker.set(wId, []);
    sessionsByWorker.get(wId).push(sess);
  }

  const workerMap = new Map(activeWorkers.map((w) => [String(w._id), w]));
  const locationMap = new Map();
  for (const loc of workLocations) {
    if (loc._id) locationMap.set(String(loc._id), String(loc._id));
    if (loc.name) locationMap.set(loc.name.toLowerCase().trim(), String(loc._id));
  }

  // Map of wId -> { weight, status, workLocationId, isSupervisor, isFemale, isSecurity, workerName }
  const workerDailyAttendance = new Map();

  for (const [wId, wSessions] of sessionsByWorker.entries()) {
    const w = workerMap.get(wId);
    let dayWorkedMinutes = 0;
    let hasOpenSession = false;

    for (const sess of wSessions) {
      if (sess.status === 'PRESENT') {
        hasOpenSession = true;
      } else {
        dayWorkedMinutes += (sess.workedMinutes || 0);
      }
    }

    // Determine attendance weight matching client Excel rules:
    // Full Day / On Duty: 1.0
    // Half Day (>= 4 hrs): 0.5
    // Absent (< 4 hrs): 0 (not counted)
    let weight = 0;
    let status = 'ABSENT';

    if (hasOpenSession) {
      weight = 1.0;
      status = 'ON_DUTY';
    } else if (dayWorkedMinutes >= 475) {
      weight = 1.0;
      status = 'COMPLETED';
    } else if (dayWorkedMinutes >= 240) {
      weight = 0.5;
      status = 'HALF_DAY';
    } else {
      weight = 0;
      status = 'ABSENT';
    }

    if (weight === 0) continue;

    const latestSession = wSessions[wSessions.length - 1];
    const dep = deploymentMap.get(wId);
    let workLocationId = dep?.workLocation
      ? String(dep.workLocation)
      : (latestSession?.workLocation ? String(latestSession.workLocation) : null);

    if (workLocationId && !locationMap.has(workLocationId) && latestSession?.workLocationNameSnapshot) {
      const byName = locationMap.get(latestSession.workLocationNameSnapshot.toLowerCase().trim());
      if (byName) workLocationId = byName;
    }

    const desig = (w?.designation?.name || dep?.designationNameSnapshot || latestSession?.designationNameSnapshot || '').toLowerCase();
    const isSecurity = desig.includes('security');
    const isSupervisor = !isSecurity && (w?.isSupervisor || desig.includes('supervisor') || desig.includes('incharge') || desig.includes('in-charge'));
    const isFemale = !isSecurity && !isSupervisor && (w?.gender === 'FEMALE');

    workerDailyAttendance.set(wId, {
      weight,
      status,
      workLocationId,
      isSecurity,
      isSupervisor,
      isFemale,
      workerName: latestSession?.workerNameSnapshot || w?.fullName || 'Worker',
    });
  }

  const deploymentCountByLocation = new Map();
  for (const dep of openDeployments) {
    if (!dep.workLocation) continue;
    const w = workerMap.get(String(dep.worker));
    const desig = (w?.designation?.name || dep.designationNameSnapshot || '').toLowerCase();
    if (desig.includes('security')) continue;
    const locKey = String(dep.workLocation);
    deploymentCountByLocation.set(locKey, (deploymentCountByLocation.get(locKey) || 0) + 1);
  }

  // Track supervisors who are already counted inside a specific shed/location
  const supervisorsCountedInSheds = new Set();

  const sheds = workLocations.map((loc) => {
    const locId = String(loc._id);
    const assignedCount = deploymentCountByLocation.get(locId) || 0;

    let labourCount = 0;
    let ladiesLabourCount = 0;
    let supervisorCount = 0;
    let locOnDuty = 0;
    let locCompleted = 0;

    for (const [wId, att] of workerDailyAttendance.entries()) {
      if (att.workLocationId !== locId) continue;
      if (att.isSecurity) continue; // Security is separated into dedicated SECURITY row

      if (att.status === 'ON_DUTY') locOnDuty++;
      if (att.status === 'COMPLETED' || att.status === 'HALF_DAY') locCompleted++;

      if (att.isSupervisor) {
        supervisorCount += att.weight;
        supervisorsCountedInSheds.add(wId);
      } else if (att.isFemale) {
        ladiesLabourCount += att.weight;
      } else {
        labourCount += att.weight;
      }
    }

    const totalAttended = labourCount + ladiesLabourCount + supervisorCount;
    const locNotReported = Math.max(0, assignedCount - (locOnDuty + locCompleted));

    return {
      _id: loc._id,
      name: loc.name,
      type: loc.type,
      order: loc.order,
      labourCount,
      ladiesLabourCount,
      supervisorCount,
      totalAttended,
      assignedCount,
      onDutyCount: locOnDuty,
      completedCount: locCompleted,
      notReportedCount: locNotReported,
    };
  });

  // Calculate farm special roles for bottom of the sheet
  let securityCount = 0;
  for (const [, att] of workerDailyAttendance.entries()) {
    if (att.isSecurity) {
      securityCount += att.weight;
    }
  }

  // Calculate Other Supervisors (Roving/General supervisors not counted in any specific shed)
  const otherSupervisorsList = [];
  let otherSupervisorsCount = 0;

  for (const [wId, att] of workerDailyAttendance.entries()) {
    if (att.isSupervisor && !supervisorsCountedInSheds.has(wId)) {
      otherSupervisorsList.push(att.workerName);
      otherSupervisorsCount += att.weight;
    }
  }

  // 6. Designation-wise headcount & attendance breakdown (Used for Office Option A)
  const isOffice = firm.code === 'OFFICE' || /office/i.test(firm.name || '');
  const designationStats = new Map();
  for (const d of firmDesignations) {
    designationStats.set(String(d._id), {
      _id: d._id,
      name: d.name,
      totalStaff: 0,
      onDutyCount: 0,
      completedCount: 0,
      halfDayCount: 0,
      presentCount: 0,
      absentCount: 0,
    });
  }

  for (const w of relevantWorkers) {
    const dId = String(w.designation?._id || w.designation || '');
    if (!designationStats.has(dId)) {
      const dName = w.designation?.name || 'General Staff';
      designationStats.set(dId, {
        _id: dId || 'unassigned',
        name: dName,
        totalStaff: 0,
        onDutyCount: 0,
        completedCount: 0,
        halfDayCount: 0,
        presentCount: 0,
        absentCount: 0,
      });
    }
    const stat = designationStats.get(dId);
    stat.totalStaff += 1;

    const att = workerDailyAttendance.get(String(w._id));
    if (att) {
      if (att.status === 'ON_DUTY') {
        stat.onDutyCount += 1;
        stat.presentCount += 1;
      } else if (att.status === 'COMPLETED') {
        stat.completedCount += 1;
        stat.presentCount += 1;
      } else if (att.status === 'HALF_DAY') {
        stat.halfDayCount += 1;
        stat.presentCount += 1;
      }
    }
  }

  for (const stat of designationStats.values()) {
    stat.absentCount = Math.max(0, stat.totalStaff - (stat.onDutyCount + stat.completedCount + stat.halfDayCount));
  }

  const designations = Array.from(designationStats.values());

  // 7. Build Live On-Duty Staff List
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
    isOffice,
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
      securityCount,
      otherSupervisors: otherSupervisorsList,
      otherSupervisorsCount,
    },
    sheds,
    designations,
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
