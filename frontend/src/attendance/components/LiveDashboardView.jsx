import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton, primaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function LiveDashboardView() {
  const [firms, setFirms] = useState([]);
  const [firmId, setFirmId] = useState('');
  const [date, setDate] = useState(getTodayString());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loadingFirms, setLoadingFirms] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Filters for the on-duty table
  const [searchTerm, setSearchTerm] = useState('');
  const [shedFilter, setShedFilter] = useState('');

  // 1. Load accessible firms
  useEffect(() => {
    setLoadingFirms(true);
    api(attendancePath('firms'))
      .then(({ firms: list = [] }) => {
        setFirms(list);
        if (list[0]) setFirmId(list[0]._id);
      })
      .catch((err) => setError(err.message || 'Failed to load firms.'))
      .finally(() => setLoadingFirms(false));
  }, []);

  // 2. Fetch live dashboard data
  const loadDashboard = useCallback(() => {
    if (!firmId) return;
    setLoadingData(true);
    api(attendancePath('dashboard/live', { firmId, date }))
      .then((res) => {
        setData(res);
        setLastUpdated(new Date());
        setError('');
      })
      .catch((err) => setError(err.message || 'Failed to load dashboard data.'))
      .finally(() => setLoadingData(false));
  }, [firmId, date]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // 3. Auto-refresh polling every 30 seconds
  useEffect(() => {
    if (!autoRefresh || !firmId) return;
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, firmId, loadDashboard]);

  const summary = data?.summary || {
    totalActiveWorkers: 0,
    onDutyCount: 0,
    completedCount: 0,
    notReportedCount: 0,
    attendanceRatePercent: 0,
    totalWorkedHoursFormatted: '0m',
  };

  const sheds = data?.sheds || [];
  const onDutyStaff = data?.onDutyStaff || [];
  const recentActivity = data?.recentActivity || [];

  // Filtered on-duty staff
  const filteredStaff = onDutyStaff.filter((worker) => {
    const matchesSearch =
      !searchTerm ||
      worker.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      worker.workerCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      worker.designationName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesShed = !shedFilter || String(worker.workLocationId) === shedFilter;
    return matchesSearch && matchesShed;
  });

  const isToday = date === getTodayString();

  return (
    <div className="space-y-6">
      {/* Top Header & Controls Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full sm:w-auto">
          {/* Firm Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Select Firm
            </label>
            {loadingFirms ? (
              <span className="text-xs text-slate-400">Loading firms…</span>
            ) : (
              <select
                aria-label="Select Firm"
                className={`${inputClass} !min-h-9 w-full sm:!w-44 !py-1 text-sm font-semibold text-slate-800`}
                value={firmId}
                onChange={(e) => setFirmId(e.target.value)}
              >
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Date
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="Attendance Date"
                className={`${inputClass} !min-h-9 w-full sm:!w-36 !py-1 text-xs font-semibold text-slate-800`}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              {!isToday && (
                <button
                  type="button"
                  onClick={() => setDate(getTodayString())}
                  className="rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 min-h-[36px]"
                  title="Reset to today"
                >
                  Today
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls: Auto-refresh & Manual Refresh */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-slate-100">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="flex items-center gap-1.5">
              {autoRefresh && (
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
              )}
              Auto-refresh (30s)
            </span>
          </label>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loadingData || !firmId}
            className={`${secondaryButton} !min-h-9 !gap-1.5 !px-3 !py-1 text-xs font-semibold`}
          >
            <span className={loadingData ? 'animate-spin' : ''}>↻</span>
            <span>{loadingData ? 'Refreshing…' : 'Refresh'}</span>
          </button>

          {lastUpdated && (
            <span className="hidden text-[11px] text-slate-400 xl:inline">
              Updated: {lastUpdated.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        {/* On Duty Now */}
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 p-2.5 sm:p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-800">
              On Duty Now
            </span>
            <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full bg-emerald-600"></span>
            </span>
          </div>
          <p className="mt-1 text-2xl sm:text-3xl font-black text-emerald-950">
            {summary.onDutyCount}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-xs font-medium text-emerald-700 truncate">
            Active open shifts working
          </p>
        </div>

        {/* Duty Completed */}
        <div className="rounded-xl sm:rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-500/10 via-white to-sky-500/5 p-2.5 sm:p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-800">
              Duty Completed
            </span>
            <span className="text-xs sm:text-sm text-sky-600 font-bold">✓</span>
          </div>
          <p className="mt-1 text-2xl sm:text-3xl font-black text-sky-950">
            {summary.completedCount}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-xs font-medium text-sky-700 truncate">
            {summary.totalWorkedHoursFormatted} logged today
          </p>
        </div>

        {/* Not Reported */}
        <div className="rounded-xl sm:rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 p-2.5 sm:p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-800">
              Not Reported
            </span>
            <span className="text-xs sm:text-sm text-amber-600">⏱</span>
          </div>
          <p className="mt-1 text-2xl sm:text-3xl font-black text-amber-950">
            {summary.notReportedCount}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-xs font-medium text-amber-700 truncate">
            Workers with no punch
          </p>
        </div>

        {/* Total Workforce */}
        <div className="rounded-xl sm:rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-500/10 via-white to-indigo-500/5 p-2.5 sm:p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-indigo-800">
              Active Workforce
            </span>
            <span className="text-xs sm:text-sm text-indigo-600">👥</span>
          </div>
          <p className="mt-1 text-2xl sm:text-3xl font-black text-indigo-950">
            {summary.totalActiveWorkers}
          </p>
          <p className="mt-0.5 text-[10px] sm:text-xs font-medium text-indigo-700 truncate">
            {summary.attendanceRatePercent}% attendance rate
          </p>
        </div>
      </div>

      {/* Shed Manpower & Bird Capacities Section */}
      <div className="rounded-xl sm:rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-5 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Shed Manpower & Bird Capacities
            </h2>
            <p className="text-xs text-slate-500">
              Real-time worker deployment and attendance per shed location
            </p>
          </div>
          <span className="self-start rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 sm:self-center">
            {sheds.length} {sheds.length === 1 ? 'Location' : 'Locations'}
          </span>
        </div>

        {sheds.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No active sheds or work locations configured for this firm. Add sheds in Attendance Admin.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sheds.map((shed) => {
              const capacityTotal = shed.birdCapacity?.total || 0;
              return (
                <div
                  key={shed._id}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition hover:border-slate-300 hover:bg-white"
                >
                  <div>
                    {/* Shed Title & Type */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{shed.name}</h3>
                        {shed.supervisor && (
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            Supv: <span className="font-semibold text-slate-700">{shed.supervisor.fullName}</span>
                          </p>
                        )}
                      </div>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          shed.type === 'SHED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {shed.type}
                      </span>
                    </div>

                    {/* Bird Capacity Info */}
                    {shed.type === 'SHED' && (
                      <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 p-2 text-xs">
                        <div className="flex items-center justify-between font-medium text-amber-900">
                          <span>Bird Capacity:</span>
                          <span className="font-bold">{capacityTotal.toLocaleString('en-IN')} birds</span>
                        </div>
                        {capacityTotal > 0 && (
                          <div className="mt-1 flex justify-between text-[10px] text-amber-700">
                            <span>M: {shed.birdCapacity.male.toLocaleString('en-IN')}</span>
                            <span>F: {shed.birdCapacity.female.toLocaleString('en-IN')}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manpower Breakdown */}
                    <div className="mt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Assigned Workers:</span>
                        <span className="font-semibold text-slate-800">{shed.assignedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-emerald-700">Present on Duty:</span>
                        <span className="font-bold text-emerald-800">{shed.onDutyCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sky-700">Completed Shift:</span>
                        <span className="font-semibold text-sky-800">{shed.completedCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-amber-700">Not Reported:</span>
                        <span className="font-semibold text-amber-800">{shed.notReportedCount}</span>
                      </div>
                    </div>
                  </div>

                  {/* Manpower Coverage Progress Bar */}
                  <div className="mt-4 pt-2 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-slate-500">Duty Coverage:</span>
                      <span
                        className={
                          shed.coveragePercent >= 100
                            ? 'text-emerald-700'
                            : shed.coveragePercent > 0
                            ? 'text-amber-700'
                            : 'text-slate-400'
                        }
                      >
                        {shed.coveragePercent}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          shed.coveragePercent >= 100
                            ? 'bg-emerald-600'
                            : shed.coveragePercent > 0
                            ? 'bg-amber-500'
                            : 'bg-slate-300'
                        }`}
                        style={{ width: `${Math.min(100, shed.coveragePercent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-Column Section: Live On-Duty Roster & Recent Activity Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Live On-Duty Staff Table */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Currently On Duty Staff
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                  {onDutyStaff.length} Working
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Staff with open shifts clocked in right now
              </p>
            </div>

            {/* Table Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search staff…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputClass} !min-h-9 flex-1 sm:!w-40 !py-1 text-xs`}
              />
              <select
                aria-label="Filter by Shed"
                value={shedFilter}
                onChange={(e) => setShedFilter(e.target.value)}
                className={`${inputClass} !min-h-9 flex-1 sm:!w-36 !py-1 text-xs font-semibold`}
              >
                <option value="">All Sheds</option>
                {sheds.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredStaff.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
              <p className="text-sm font-medium">No workers currently on duty.</p>
              <p className="mt-1 text-xs text-slate-400">
                Clock-in records made from the Face Scanner or manual punch will show up here live.
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="attendance-table w-full min-w-[620px] text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="pb-2.5 sticky left-0 z-20 bg-white border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] pr-3 min-w-[140px] whitespace-nowrap">Worker</th>
                    <th className="pb-2.5 px-2">Work Location</th>
                    <th className="pb-2.5 px-2">Designation</th>
                    <th className="pb-2.5 px-2">Duty IN</th>
                    <th className="pb-2.5 px-2">Elapsed</th>
                    <th className="pb-2.5 px-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((staff) => {
                    const inTime = new Date(staff.dutyIn);
                    const formattedIn = inTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    });
                    return (
                      <tr key={staff.sessionId} className="hover:bg-slate-50/80 group">
                        <td data-label="Worker" className="py-2.5 sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] pr-3 min-w-[140px]">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                              {staff.workerName?.slice(0, 1)?.toUpperCase() || '?'}
                            </span>
                            <div>
                              <p className="font-semibold text-slate-900">{staff.workerName}</p>
                              <p className="text-[10px] text-slate-400">{staff.workerCode}</p>
                            </div>
                          </div>
                        </td>
                        <td data-label="Work location" className="py-2.5 font-medium text-slate-800">
                          {staff.workLocationName}
                        </td>
                        <td data-label="Designation" className="py-2.5 text-slate-600">
                          {staff.designationName || '—'}
                        </td>
                        <td data-label="Duty IN (IST)" className="py-2.5 font-semibold text-emerald-700">
                          {formattedIn}
                        </td>
                        <td data-label="Elapsed" className="py-2.5">
                          <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">
                            {staff.elapsedFormatted}
                          </span>
                        </td>
                        <td data-label="Source" className="py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              staff.source === 'FACE'
                                ? 'bg-cyan-100 text-cyan-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {staff.source === 'FACE' ? '📷 FACE' : '✍ MANUAL'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 1 Col: Recent Attendance Activity Log */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">
              Recent Activity
            </h2>
            <span className="text-xs text-slate-400">Live feed</span>
          </div>
          <p className="text-xs text-slate-500">
            Latest punch events recorded today
          </p>

          {recentActivity.length === 0 ? (
            <p className="mt-6 text-center text-xs text-slate-400">
              No punch events recorded for this date.
            </p>
          ) : (
            <div className="mt-4 flow-root">
              <ul className="-mb-4 divide-y divide-slate-100">
                {recentActivity.map((event) => {
                  const isDutyIn = event.eventType === 'DUTY_IN';
                  const eventTime = new Date(event.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  });
                  return (
                    <li key={event._id} className="py-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                              isDutyIn
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isDutyIn ? 'IN' : 'OUT'}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-slate-800">
                              {event.workerName}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {event.workLocationName} · {event.source}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium text-slate-400">
                          {eventTime}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

