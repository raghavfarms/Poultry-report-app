import Firm from '../../models/Firm.js';
import Worker from '../models/Worker.js';
import WorkLocation from '../models/WorkLocation.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceSession from '../models/AttendanceSession.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import { firmScope, sortFirms } from '../authorization.js';
import { objectId, dateOnly } from '../validation.js';
import { indiaDateString, formatWorkedHours, autoCutExpiredSessions } from './attendance.service.js';
import { notFoundError, badRequest } from '../../utils/http.js';

/**
 * Calculates a sorting rank for work locations ensuring:
 * 1. Laying Sheds (1, 2, 3...) appear first
 * 2. Brood Sheds (1, 2, 3...) appear second
 * 3. Other production sheds appear third
 * 4. Miscellaneous units (Feed Mill, Guard Room, Cold Room, Office, etc.) appear last
 * 5. Explicit user-defined `order > 0` is prioritized within each tier
 */
export function getWorkLocationSortRank(name, type, order) {
  const lower = String(name || '').toLowerCase().trim();
  if (!lower || lower === 'unassigned' || lower === 'none' || lower === '—') return 999999;

  const numMatch = lower.match(/\d+/);
  const num = numMatch ? parseInt(numMatch[0], 10) : 0;

  const isLaying = lower.includes('laying');
  const isBrood = lower.includes('brood') || lower.includes('chick');
  const isShed = type === 'SHED' || lower.includes('shed') || isLaying || isBrood;
  const ord = Number(order) || 0;

  if (isLaying) {
    return 1000 + (ord > 0 ? ord : num);
  }
  if (isBrood) {
    return 2000 + (ord > 0 ? ord : num);
  }
  if (isShed) {
    return 3000 + (ord > 0 ? ord : num);
  }

  // Miscellaneous / non-shed locations (Feed Mill, Guard Room, etc.)
  if (ord > 0) {
    return 10000 + ord;
  }
  return 20000;
}

/**
 * Generates daily muster roll register for a firm on a specific date.
 * Includes all deployed workers, marking them as ON_DUTY, COMPLETED, or ABSENT.
 */
export async function getDailyAttendanceReport(user, query = {}) {
  const now = new Date();
  const todayDate = indiaDateString(now);

  // 1. Resolve date (YYYY-MM-DD)
  let targetDate = todayDate;
  if (query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      throw badRequest('Date must be formatted as YYYY-MM-DD.');
    }
    targetDate = dateOnly(query.date, 'date');
  }

  // 2. Resolve firm
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

  if (!firmId) throw badRequest('Please specify a firmId.');

  firmScope(user, firmId);
  const firmObjectId = objectId(firmId, 'Firm');

  const firm = await Firm.findById(firmObjectId).select('name code active').lean();
  if (!firm) throw notFoundError('Firm not found.');

  // Auto-cut any sessions exceeding 15hr threshold or past-date unclosed before querying
  await autoCutExpiredSessions(firmObjectId, now);

  // 3. Parallel fetch of workers, deployments, attendance sessions, and active work locations
  const [workers, deployments, sessions, workLocations] = await Promise.all([
    Worker.find({ firm: firmObjectId, active: true })
      .select('fullName workerCode designation dateOfJoining createdAt')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),

    WorkerDeployment.find({ firm: firmObjectId, effectiveTo: null })
      .select('worker workLocation workLocationNameSnapshot designationNameSnapshot supervisorNameSnapshot effectiveFrom')
      .lean(),

    AttendanceSession.find({ firm: firmObjectId, date: targetDate })
      .select('worker workerCodeSnapshot workerNameSnapshot workLocation workLocationNameSnapshot designationNameSnapshot supervisorNameSnapshot dutyIn dutyOut workedMinutes status inLocation outLocation remarks inEvent lunchOut lunchIn lunchMinutes onLunch')
      .populate('inEvent', 'source')
      .lean(),

    WorkLocation.find({ firm: firmObjectId, active: true })
      .select('name type order')
      .lean(),
  ]);

  const locationById = new Map();
  const locationByName = new Map();
  for (const loc of workLocations) {
    if (loc._id) locationById.set(String(loc._id), loc);
    if (loc.name) locationByName.set(loc.name.toLowerCase().trim(), loc);
  }

  const deploymentByWorker = new Map();
  for (const dep of deployments) {
    deploymentByWorker.set(String(dep.worker), dep);
  }

  const sessionsByWorker = new Map();
  for (const sess of sessions) {
    const wId = String(sess.worker);
    if (!sessionsByWorker.has(wId)) sessionsByWorker.set(wId, []);
    sessionsByWorker.get(wId).push(sess);
  }

  // 4. Build muster roll entries
  const rows = [];
  let onDutyCount = 0;
  let completedCount = 0;
  let halfDayCount = 0;
  let absentCount = 0;
  let totalWorkedMinutes = 0;

  for (const worker of workers) {
    const workerIdStr = String(worker._id);
    const deployment = deploymentByWorker.get(workerIdStr);
    const workerSessions = sessionsByWorker.get(workerIdStr) || [];

    const effectiveJoining = worker.dateOfJoining
      || (deployment?.effectiveFrom ? indiaDateString(deployment.effectiveFrom) : null)
      || (worker.createdAt ? indiaDateString(worker.createdAt) : null);

    // If worker had not joined yet as of targetDate and has no attendance on this date, skip them
    if (effectiveJoining && targetDate < effectiveJoining && workerSessions.length === 0) {
      continue;
    }

    // Sort chronologically by dutyIn
    if (workerSessions.length > 1) {
      workerSessions.sort((a, b) => new Date(a.dutyIn || 0) - new Date(b.dutyIn || 0));
    }

    const latestSession = workerSessions[workerSessions.length - 1];
    const workLocationId = latestSession?.workLocation ? String(latestSession.workLocation) : (deployment?.workLocation ? String(deployment.workLocation) : null);
    const designationName = worker.designation?.name || latestSession?.designationNameSnapshot || deployment?.designationNameSnapshot || '—';
    const supervisorName = latestSession?.supervisorNameSnapshot || deployment?.supervisorNameSnapshot || '—';
    const isSecurity = /security/i.test(designationName);

    let workLocationName = latestSession?.workLocationNameSnapshot || deployment?.workLocationNameSnapshot || 'None';
    if (workLocationName === 'Unassigned' || (isSecurity && !workLocationId)) {
      workLocationName = 'None';
    }

    const cleanLocName = String(workLocationName || '').toLowerCase().trim();
    const matchedLoc = (workLocationId && locationById.get(workLocationId))
      || (cleanLocName && locationByName.get(cleanLocName))
      || null;
    const workLocationType = matchedLoc?.type || (cleanLocName.includes('shed') ? 'SHED' : 'MISCELLANEOUS');
    const workLocationOrder = matchedLoc?.order ?? 0;

    // Filter by workLocation if requested
    if (query.workLocationId && workLocationId !== String(query.workLocationId)) {
      continue;
    }

    // Filter by search query if requested
    if (query.search) {
      const term = query.search.trim().toLowerCase();
      const matchesName = worker.fullName.toLowerCase().includes(term);
      const matchesCode = worker.workerCode.toLowerCase().includes(term);
      const matchesShed = workLocationName.toLowerCase().includes(term);
      if (!matchesName && !matchesCode && !matchesShed) {
        continue;
      }
    }

    // Determine aggregated timing and status
    let status = 'ABSENT';
    let dayWorkedMinutes = 0;
    let dutyIn = null;
    let dutyOut = null;
    let hasOpenSession = false;

    if (workerSessions.length > 0) {
      dutyIn = workerSessions[0].dutyIn || null;

      for (const sess of workerSessions) {
        if (sess.status === 'PRESENT') {
          hasOpenSession = true;
        } else {
          dayWorkedMinutes += (sess.workedMinutes || 0);
        }
      }

      if (hasOpenSession) {
        status = 'ON_DUTY';
        onDutyCount++;
      } else {
        const lastSession = workerSessions[workerSessions.length - 1];
        dutyOut = lastSession.dutyOut || null;

        if (dayWorkedMinutes >= 480) {
          status = 'COMPLETED';
          completedCount++;
        } else if (dayWorkedMinutes >= 240) {
          status = 'HALF_DAY';
          halfDayCount++;
        } else {
          status = 'ABSENT';
          absentCount++;
        }
      }
      totalWorkedMinutes += dayWorkedMinutes;
    } else {
      absentCount++;
    }

    // Filter by status if requested
    if (query.status && query.status !== 'ALL') {
      if (query.status !== status) continue;
    }

    const firstSession = workerSessions[0];
    const inLoc = workerSessions.find((s) => s.inLocation?.status === 'CAPTURED')?.inLocation || firstSession?.inLocation || null;
    const outLoc = workerSessions.slice().reverse().find((s) => s.outLocation?.status === 'CAPTURED')?.outLocation || latestSession?.outLocation || null;

    rows.push({
      sessionId: latestSession?._id || null,
      workerId: worker._id,
      workerCode: worker.workerCode,
      workerName: worker.fullName,
      workLocationId,
      workLocationName,
      workLocationType,
      workLocationOrder,
      designationName,
      supervisorName,
      dutyIn,
      dutyOut,
      workedMinutes: dayWorkedMinutes,
      workedHoursFormatted: formatWorkedHours(dayWorkedMinutes),
      lunchOut: latestSession?.lunchOut || null,
      lunchIn: latestSession?.lunchIn || null,
      lunchMinutes: latestSession?.lunchMinutes || 0,
      onLunch: Boolean(latestSession?.onLunch),
      status,
      sessionsCount: workerSessions.length,
      source: latestSession?.inEvent?.source || (workerSessions.length ? 'MANUAL' : '—'),
      inLocation: inLoc,
      outLocation: outLoc,
      remarks: workerSessions.map((s) => s.remarks).filter(Boolean).join('; ') || '',
    });
  }

  // Sort daily records shed-wise:
  // Laying Sheds (1, 2...) -> Brood Sheds (1, 2...) -> Other Sheds -> Miscellaneous units -> Unassigned
  // Within the same location, sorted alphabetically by workerName.
  rows.sort((a, b) => {
    const rankA = getWorkLocationSortRank(a.workLocationName, a.workLocationType, a.workLocationOrder);
    const rankB = getWorkLocationSortRank(b.workLocationName, b.workLocationType, b.workLocationOrder);
    if (rankA !== rankB) return rankA - rankB;

    const shedA = a.workLocationName || 'Unassigned';
    const shedB = b.workLocationName || 'Unassigned';
    const locComp = shedA.localeCompare(shedB, undefined, { numeric: true, sensitivity: 'base' });
    if (locComp !== 0) return locComp;
    return (a.workerName || '').localeCompare(b.workerName || '', undefined, { sensitivity: 'base' });
  });

  return {
    firm: {
      _id: firm._id,
      name: firm.name,
      code: firm.code,
    },
    date: targetDate,
    summary: {
      totalWorkers: rows.length,
      onDutyCount,
      completedCount,
      halfDayCount,
      presentCount: onDutyCount + completedCount + halfDayCount,
      absentCount,
      totalWorkedMinutes,
      totalWorkedHoursFormatted: formatWorkedHours(totalWorkedMinutes),
    },
    records: rows,
  };
}

/**
 * Generates monthly attendance summary matrix for a firm.
 * Day-by-day status: P (Present >= 4h), HD (Half Day < 4h), OD (On Duty), A (Absent), — (Future).
 */
export async function getMonthlyAttendanceSummary(user, query = {}) {
  const now = new Date();
  const todayDate = indiaDateString(now);
  const currentMonth = todayDate.slice(0, 7); // YYYY-MM

  let targetMonth = currentMonth;
  if (query.month) {
    if (!/^\d{4}-\d{2}$/.test(query.month)) {
      throw badRequest('Month must be formatted as YYYY-MM.');
    }
    targetMonth = query.month;
  }

  // Resolve firm
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

  if (!firmId) throw badRequest('Please specify a firmId.');

  firmScope(user, firmId);
  const firmObjectId = objectId(firmId, 'Firm');

  const firm = await Firm.findById(firmObjectId).select('name code active').lean();
  if (!firm) throw notFoundError('Firm not found.');

  // Auto-cut any sessions exceeding 15hr threshold or past-date unclosed before querying
  await autoCutExpiredSessions(firmObjectId, now);

  // Determine days in month
  const [yearStr, monthStr] = targetMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Parallel fetch workers, deployments, and month's sessions
  const [workers, deployments, sessions, correctionCounts] = await Promise.all([
    Worker.find({ firm: firmObjectId, active: true })
      .select('fullName workerCode designation dateOfJoining createdAt')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),

    WorkerDeployment.find({ firm: firmObjectId, effectiveTo: null })
      .select('worker workLocation workLocationNameSnapshot designationNameSnapshot effectiveFrom')
      .lean(),

    AttendanceSession.find({
      firm: firmObjectId,
      date: { $regex: `^${targetMonth}-` },
    }).select('worker date dutyIn dutyOut workedMinutes status').lean(),
    AttendanceAuditLog.aggregate([
      { $match: { firm: firmObjectId, entityType: 'ATTENDANCE_SESSION', action: 'CORRECTION',
        'newValue.date': { $gte: targetMonth + '-01', $lte: targetMonth + '-' + String(daysInMonth).padStart(2, '0') } } },
      { $group: { _id: '$worker', count: { $sum: 1 } } },
    ]).catch((err) => {
      console.warn('AttendanceAuditLog aggregate error:', err?.message);
      return [];
    }),
  ]);
  const editCounts = new Map((correctionCounts || []).map(item => [String(item._id), item.count]));

  const deploymentByWorker = new Map();
  for (const dep of deployments) {
    deploymentByWorker.set(String(dep.worker), dep);
  }

  // WorkerId -> { dateStr -> Session[] }
  const workerSessions = new Map();
  for (const s of sessions) {
    const wId = String(s.worker);
    if (!workerSessions.has(wId)) workerSessions.set(wId, new Map());
    const dateMap = workerSessions.get(wId);
    if (!dateMap.has(s.date)) dateMap.set(s.date, []);
    dateMap.get(s.date).push(s);
  }

  const records = [];
  let farmTotalWorkedMinutes = 0;
  let farmTotalPresentDays = 0;

  for (const worker of workers) {
    const workerIdStr = String(worker._id);
    const deployment = deploymentByWorker.get(workerIdStr);
    const designationName = worker.designation?.name || deployment?.designationNameSnapshot || '—';
    const isSecurity = /security/i.test(designationName);
    const workLocationId = deployment?.workLocation ? String(deployment.workLocation) : null;
    let workLocationName = deployment?.workLocationNameSnapshot || 'None';
    if (workLocationName === 'Unassigned' || (isSecurity && !workLocationId)) {
      workLocationName = 'None';
    }

    const effectiveJoining = worker.dateOfJoining
      || (deployment?.effectiveFrom ? indiaDateString(deployment.effectiveFrom) : null)
      || (worker.createdAt ? indiaDateString(worker.createdAt) : null);

    if (query.workLocationId && workLocationId !== String(query.workLocationId)) {
      continue;
    }

    if (query.search) {
      const term = query.search.trim().toLowerCase();
      const matchesName = String(worker.fullName || '').toLowerCase().includes(term);
      const matchesCode = String(worker.workerCode || '').toLowerCase().includes(term);
      if (!matchesName && !matchesCode) {
        continue;
      }
    }

    const sessionsForWorker = workerSessions.get(workerIdStr) || new Map();
    const days = {};
    let presentDays = 0;
    let absentDays = 0;
    let workerWorkedMinutes = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = String(day).padStart(2, '0');
      const fullDateStr = `${targetMonth}-${dayStr}`;

      if (sessionsForWorker.has(fullDateStr)) {
        const daySessions = sessionsForWorker.get(fullDateStr);
        let dayMinutes = 0;
        let isOpen = false;

        for (const sess of daySessions) {
          if (sess.status === 'PRESENT') {
            isOpen = true;
          }
          dayMinutes += (sess.workedMinutes || 0);
        }

        workerWorkedMinutes += dayMinutes;

        if (isOpen && fullDateStr === todayDate) {
          days[dayStr] = 'OD'; // On duty right now
          presentDays += 1;
        } else if (isOpen || dayMinutes >= 480) {
          days[dayStr] = 'P'; // Full day (>= 8 hrs or auto-cut)
          presentDays += 1;
        } else if (dayMinutes >= 240) {
          days[dayStr] = 'HD'; // Half day (>= 4 hrs & < 8 hrs)
          presentDays += 0.5;
          absentDays += 0.5;
        } else {
          days[dayStr] = 'A';
          absentDays += 1;
        }
      } else if (effectiveJoining && fullDateStr < effectiveJoining) {
        days[dayStr] = '—'; // Not joined yet
      } else if (fullDateStr > todayDate) {
        days[dayStr] = '—'; // Future date
      } else {
        days[dayStr] = 'A'; // Absent after joining
        absentDays += 1;
      }
    }

    farmTotalWorkedMinutes += workerWorkedMinutes;
    farmTotalPresentDays += presentDays;

    const avgDailyMinutes = presentDays > 0 ? Math.round(workerWorkedMinutes / presentDays) : 0;

    records.push({
      workerId: worker._id,
      workerCode: worker.workerCode,
      workerName: worker.fullName,
      workLocationName,
      designationName,
      days,
      totalDaysPresent: presentDays,
      totalDaysAbsent: absentDays,
      totalWorkedMinutes: workerWorkedMinutes,
      totalWorkedHoursFormatted: formatWorkedHours(workerWorkedMinutes),
      avgDailyHoursFormatted: formatWorkedHours(avgDailyMinutes),
      editCount: editCounts.get(workerIdStr) || 0,
    });
  }

  // Sort monthly records name-wise (alphabetical A-Z by workerName, then workerCode)
  records.sort((a, b) => {
    const nameA = a.workerName || '';
    const nameB = b.workerName || '';
    const nameComp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    if (nameComp !== 0) return nameComp;
    return (a.workerCode || '').localeCompare(b.workerCode || '', undefined, { numeric: true, sensitivity: 'base' });
  });

  return {
    firm: {
      _id: firm._id,
      name: firm.name,
      code: firm.code,
    },
    month: targetMonth,
    daysInMonth,
    summary: {
      totalWorkers: records.length,
      farmTotalWorkedMinutes,
      farmTotalWorkedHoursFormatted: formatWorkedHours(farmTotalWorkedMinutes),
      farmTotalPresentDays,
      avgPresentDaysPerWorker: records.length > 0 ? Number((farmTotalPresentDays / records.length).toFixed(1)) : 0,
    },
    records,
  };
}

