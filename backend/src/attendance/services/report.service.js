import Firm from '../../models/Firm.js';
import Worker from '../models/Worker.js';
import WorkLocation from '../models/WorkLocation.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceSession from '../models/AttendanceSession.js';
import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import { firmScope } from '../authorization.js';
import { objectId, dateOnly } from '../validation.js';
import { indiaDateString, formatWorkedHours } from './attendance.service.js';
import { notFoundError, badRequest } from '../../utils/http.js';

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
  if (!firmId) {
    if (user.role === 'developer') {
      const firstFirm = await Firm.findOne({ active: true }).sort({ name: 1 }).select('_id').lean();
      if (firstFirm) firmId = String(firstFirm._id);
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

  // 3. Parallel fetch of workers, deployments, and attendance sessions
  const [workers, deployments, sessions] = await Promise.all([
    Worker.find({ firm: firmObjectId, active: true })
      .select('fullName workerCode designation dateOfJoining')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),

    WorkerDeployment.find({ firm: firmObjectId, effectiveTo: null })
      .select('worker workLocation workLocationNameSnapshot designationNameSnapshot supervisorNameSnapshot')
      .lean(),

    AttendanceSession.find({ firm: firmObjectId, date: targetDate })
      .select('worker workerCodeSnapshot workerNameSnapshot workLocation workLocationNameSnapshot designationNameSnapshot supervisorNameSnapshot dutyIn dutyOut workedMinutes status inLocation outLocation remarks inEvent lunchOut lunchIn lunchMinutes onLunch')
      .populate('inEvent', 'source')
      .lean(),
  ]);

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

    // If worker had not joined yet as of targetDate and has no attendance on this date, skip them
    if (worker.dateOfJoining && targetDate < worker.dateOfJoining && workerSessions.length === 0) {
      continue;
    }

    // Sort chronologically by dutyIn
    if (workerSessions.length > 1) {
      workerSessions.sort((a, b) => new Date(a.dutyIn || 0) - new Date(b.dutyIn || 0));
    }

    const latestSession = workerSessions[workerSessions.length - 1];
    const workLocationId = latestSession?.workLocation ? String(latestSession.workLocation) : (deployment?.workLocation ? String(deployment.workLocation) : null);
    const workLocationName = latestSession?.workLocationNameSnapshot || deployment?.workLocationNameSnapshot || 'Unassigned';
    const designationName = latestSession?.designationNameSnapshot || worker.designation?.name || deployment?.designationNameSnapshot || '—';
    const supervisorName = latestSession?.supervisorNameSnapshot || deployment?.supervisorNameSnapshot || '—';

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
        if (sess.dutyOut) {
          if (!dutyOut || new Date(sess.dutyOut) > new Date(dutyOut)) {
            dutyOut = sess.dutyOut;
          }
        }
      }

      if (hasOpenSession) {
        status = 'ON_DUTY';
        onDutyCount++;
        dutyOut = null; // Still on duty
      } else if (dayWorkedMinutes >= 480) {
        status = 'COMPLETED';
        completedCount++;
      } else if (dayWorkedMinutes >= 240) {
        status = 'HALF_DAY';
        halfDayCount++;
      } else if (dayWorkedMinutes > 0 || workerSessions.length > 0) {
        status = 'PRESENT';
        completedCount++;
      } else {
        status = 'ABSENT';
        absentCount++;
      }
      totalWorkedMinutes += dayWorkedMinutes;
    } else {
      absentCount++;
    }

    // Filter by status if requested
    if (query.status && query.status !== 'ALL') {
      if (query.status !== status) continue;
    }

    rows.push({
      workerId: worker._id,
      workerCode: worker.workerCode,
      workerName: worker.fullName,
      workLocationId,
      workLocationName,
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
      remarks: workerSessions.map((s) => s.remarks).filter(Boolean).join('; ') || '',
    });
  }

  // Sort daily records shed-wise (natural alphanumeric sort by workLocationName, then workerName)
  rows.sort((a, b) => {
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
  if (!firmId) {
    if (user.role === 'developer') {
      const firstFirm = await Firm.findOne({ active: true }).sort({ name: 1 }).select('_id').lean();
      if (firstFirm) firmId = String(firstFirm._id);
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

  // Determine days in month
  const [yearStr, monthStr] = targetMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();

  // Parallel fetch workers, deployments, and month's sessions
  const [workers, deployments, sessions, correctionCounts] = await Promise.all([
    Worker.find({ firm: firmObjectId, active: true })
      .select('fullName workerCode designation dateOfJoining')
      .populate('designation', 'name')
      .sort({ workerCode: 1 })
      .lean(),

    WorkerDeployment.find({ firm: firmObjectId, effectiveTo: null })
      .select('worker workLocation workLocationNameSnapshot designationNameSnapshot')
      .lean(),

    AttendanceSession.find({
      firm: firmObjectId,
      date: { $regex: `^${targetMonth}-` },
    }).select('worker date dutyIn dutyOut workedMinutes status').lean(),
    AttendanceAuditLog.aggregate([
      { $match: { firm: firmObjectId, entityType: 'ATTENDANCE_SESSION', action: 'CORRECTION',
        'newValue.date': { $gte: targetMonth + '-01', $lte: targetMonth + '-' + String(daysInMonth).padStart(2, '0') } } },
      { $group: { _id: '$worker', count: { $sum: 1 } } },
    ]),
  ]);
  const editCounts = new Map(correctionCounts.map(item => [String(item._id), item.count]));

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
    const workLocationId = deployment?.workLocation ? String(deployment.workLocation) : null;
    const workLocationName = deployment?.workLocationNameSnapshot || 'Unassigned';
    const designationName = worker.designation?.name || deployment?.designationNameSnapshot || '—';

    if (query.workLocationId && workLocationId !== String(query.workLocationId)) {
      continue;
    }

    if (query.search) {
      const term = query.search.trim().toLowerCase();
      if (!worker.fullName.toLowerCase().includes(term) && !worker.workerCode.toLowerCase().includes(term)) {
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

        if (isOpen) {
          days[dayStr] = 'OD'; // On duty right now
          presentDays += 1;
        } else if (dayMinutes >= 480) {
          days[dayStr] = 'P'; // Full day (>= 8 hrs)
          presentDays += 1;
        } else if (dayMinutes >= 240) {
          days[dayStr] = 'HD'; // Half day (>= 4 hrs & < 8 hrs)
          presentDays += 0.5;
          absentDays += 0.5;
        } else if (dayMinutes > 0 || daySessions.length > 0) {
          days[dayStr] = 'P'; // Present (< 4 hrs)
          presentDays += 1;
        } else {
          days[dayStr] = 'A';
          absentDays += 1;
        }
      } else if (worker.dateOfJoining && fullDateStr < worker.dateOfJoining) {
        days[dayStr] = '—'; // Not joined yet
      } else if (fullDateStr > todayDate) {
        days[dayStr] = '—'; // Future date
      } else {
        days[dayStr] = 'A'; // Absent
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

