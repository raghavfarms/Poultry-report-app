import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';
import { exportReportToPdf } from '../../utils/exportPdf.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function formatLunchBreak(minutes) {
  if (!minutes || minutes <= 0) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0 && mins > 0) {
    return `${hrs} hr ${mins} min`;
  }
  if (hrs > 0) {
    return `${hrs} hr`;
  }
  return `${mins} min`;
}

export default function DailyRegisterView({
  firmId: propFirmId,
  setFirmId: propSetFirmId,
  firms: propFirms,
  date: propDate,
  setDate: propSetDate,
}) {
  const [internalFirms, setInternalFirms] = useState([]);
  const [internalFirmId, setInternalFirmId] = useState('');
  const [internalDate, setInternalDate] = useState(getTodayString());

  const firms = propFirms && propFirms.length ? propFirms : internalFirms;
  const firmId = propFirmId !== undefined ? propFirmId : internalFirmId;
  const setFirmId = propSetFirmId || setInternalFirmId;
  const date = propDate !== undefined ? propDate : internalDate;
  const setDate = propSetDate || setInternalDate;

  const [workLocations, setWorkLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const [loadingFirms, setLoadingFirms] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const reportRef = useRef(null);

  // 1. Load accessible firms if not provided by parent
  useEffect(() => {
    if (propFirms && propFirms.length) {
      setLoadingFirms(false);
      return;
    }
    setLoadingFirms(true);
    api(attendancePath('firms'))
      .then(({ firms: list = [] }) => {
        setInternalFirms(list);
        if (list[0] && !firmId) setFirmId(list[0]._id);
      })
      .catch((err) => setError(err.message || 'Failed to load firms.'))
      .finally(() => setLoadingFirms(false));
  }, [propFirms]);

  // 2. Load active work locations for selected firm
  useEffect(() => {
    if (!firmId) {
      setWorkLocations([]);
      return;
    }
    api(attendancePath('work-locations', { firmId, active: true, limit: 100 }))
      .then((res) => setWorkLocations(res.items || []))
      .catch(() => setWorkLocations([]));
  }, [firmId]);

  // 3. Fetch Daily Register data
  const loadRegister = useCallback(() => {
    if (!firmId) return;
    setLoadingData(true);
    const params = { firmId, date };
    if (selectedLocation) params.workLocationId = selectedLocation;
    if (statusFilter !== 'ALL') params.status = statusFilter;
    if (search.trim()) params.search = search.trim();

    api(attendancePath('reports/daily', params))
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => setError(err.message || 'Failed to load daily register.'))
      .finally(() => setLoadingData(false));
  }, [firmId, date, selectedLocation, statusFilter, search]);

  useEffect(() => {
    loadRegister();
  }, [loadRegister]);

  const summary = data?.summary || {
    totalWorkers: 0,
    presentCount: 0,
    onDutyCount: 0,
    completedCount: 0,
    halfDayCount: 0,
    absentCount: 0,
    totalWorkedHoursFormatted: '0m',
  };

  const records = useMemo(() => {
    const list = data?.records ? [...data.records] : [];
    return list.sort((a, b) => {
      const shedA = a.workLocationName || 'Unassigned';
      const shedB = b.workLocationName || 'Unassigned';
      const locComp = shedA.localeCompare(shedB, undefined, { numeric: true, sensitivity: 'base' });
      if (locComp !== 0) return locComp;
      return (a.workerName || '').localeCompare(b.workerName || '', undefined, { sensitivity: 'base' });
    });
  }, [data?.records]);

  // Export Daily Register to PDF
  const exportPdf = async () => {
    if (!reportRef.current || !records.length) return;
    setExportingPdf(true);
    try {
      const activeFirm = firms.find((f) => f._id === firmId);
      const firmName = activeFirm ? (activeFirm.code || activeFirm.name).replace(/[^a-zA-Z0-9_-]/g, '_') : 'Firm';
      await exportReportToPdf(reportRef.current, {
        filename: `daily-attendance-${firmName}-${date}.pdf`,
        orientation: 'landscape',
        format: 'a4',
        margin: 6,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
      setError(err.message || 'Could not export the PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-1.5 sm:space-y-2">
      {/* Secondary Filters Bar - Ultra-Slim Single Row */}
      <div className="rounded-xl border border-slate-200 bg-white p-1.5 sm:p-2 shadow-2xs">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 items-center">
          {/* Shed / Location Filter */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Shed / Location
            </label>
            <select
              aria-label="Filter by Shed"
              className={`${inputClass} !min-h-7 !h-7 !py-0 !px-1.5 text-xs font-semibold rounded-lg`}
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="">All Sheds & Locations</option>
              {workLocations.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name} ({loc.type})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              Status
            </label>
            <select
              aria-label="Filter by Status"
              className={`${inputClass} !min-h-7 !h-7 !py-0 !px-1.5 text-xs font-semibold rounded-lg`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Staff</option>
              <option value="ON_DUTY">On Duty Now</option>
              <option value="COMPLETED">{"Full Day (>= 7h 55m)"}</option>
              <option value="HALF_DAY">{"Half Day (4h–7h 55m)"}</option>
              <option value="ABSENT">{"Absent (< 4h)"}</option>
            </select>
          </div>

          {/* Search Input with count badge */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between mb-0.5">
              <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">
                Search Worker
              </label>
              <span className="text-[9px] font-bold text-slate-500">
                {records.length} staff {loadingData && <span className="text-cyan-700 animate-pulse font-bold">(loading…)</span>}
              </span>
            </div>
            <input
              type="text"
              placeholder="Name, ID or Code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} !min-h-7 !h-7 !py-0 !px-2 text-xs rounded-lg`}
            />
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* KPI Badges Strip + Quick Export Actions */}
      <div className="flex items-center justify-between gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50/90 py-1 px-1.5 text-xs shadow-2xs">
        {/* Compact Metrics Badges */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-bold text-slate-700 border border-slate-200 shadow-2xs text-[10px] sm:text-[11px]">
            <span className="text-slate-400 uppercase text-[9px]">Total</span>
            <span className="font-black text-slate-900">{summary.totalWorkers}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-800 border border-emerald-200 shadow-2xs text-[10px] sm:text-[11px]">
            <span className="text-emerald-600 uppercase text-[9px]">P</span>
            <span className="font-black text-emerald-950">{summary.presentCount}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 font-bold text-teal-800 border border-teal-200 shadow-2xs text-[10px] sm:text-[11px]">
            <span className="text-teal-600 uppercase text-[9px]">Duty</span>
            <span className="font-black text-teal-950">{summary.onDutyCount}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 font-bold text-sky-800 border border-sky-200 shadow-2xs text-[10px] sm:text-[11px]">
            <span className="text-sky-600 uppercase text-[9px]">Full</span>
            <span className="font-black text-sky-950">{summary.completedCount}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-bold text-amber-800 border border-amber-200 shadow-2xs text-[10px] sm:text-[11px]">
            <span className="text-amber-600 uppercase text-[9px]">Half</span>
            <span className="font-black text-amber-950">{summary.halfDayCount || 0}</span>
          </div>
          <div className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-800 border border-rose-200 shadow-2xs text-[10px] sm:text-[11px]">
            <span className="text-rose-600 uppercase text-[9px]">Abs</span>
            <span className="font-black text-rose-950">{summary.absentCount}</span>
          </div>
        </div>

        {/* Quick PDF & Print Action Buttons */}
        <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-slate-200">
          <button
            type="button"
            onClick={exportPdf}
            disabled={loadingData || !records.length || exportingPdf}
            title="Export Daily Register to PDF"
            className="inline-flex items-center gap-1 !h-6.5 !min-h-6.5 px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer shadow-2xs"
          >
            <svg className="w-3 h-3 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <span>{exportingPdf ? 'Exporting…' : 'PDF'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={loadingData || !records.length}
            title="Print Daily Register"
            className="inline-flex items-center gap-1 !h-6.5 !min-h-6.5 px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer shadow-2xs"
          >
            <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span className="hidden sm:inline">Print</span>
          </button>
        </div>
      </div>

      {/* Muster Roll Table */}
      <div ref={reportRef} className="report-export-content overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loadingData ? (
          <div className="py-12 text-center">
            <Spinner label="Loading daily register…" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p className="text-sm font-semibold">No attendance records found matching filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="attendance-table w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-2 border-r border-slate-200/60 shadow-[1px_0_2px_rgba(0,0,0,0.03)]">Worker ID & Name</th>
                  <th className="px-3 py-2">Work Location</th>
                  <th className="px-3 py-2">Designation</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Duty IN</th>
                  <th className="px-3 py-2">Duty OUT</th>
                  <th className="px-3 py-2">Hours Logged</th>
                  <th className="px-3 py-2">Lunch Time</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const inTimeFormatted = r.dutyIn
                    ? new Date(r.dutyIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
                    : '—';
                  const outTimeFormatted = r.dutyOut
                    ? new Date(r.dutyOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
                    : '—';

                  return (
                    <tr key={r.workerId} className="hover:bg-slate-50/80">
                      <td data-label="Worker" className="sticky left-0 z-10 bg-white px-2.5 py-1 sm:px-3 border-r border-slate-200/60 shadow-[1px_0_2px_rgba(0,0,0,0.03)]">
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-700">
                            {r.workerName?.slice(0, 1)?.toUpperCase() || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[120px] sm:max-w-none text-xs">{r.workerName}</p>
                            <p className="text-[9px] text-slate-400">{r.workerCode}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Work location" className="px-3 py-1.5 font-medium text-slate-800">
                        {r.workLocationName}
                      </td>
                      <td data-label="Designation" className="px-3 py-1.5 text-slate-600">
                        {r.designationName}
                      </td>
                      <td data-label="Status" className="px-3 py-1.5">
                        {r.onLunch ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            🍱 ON LUNCH
                          </span>
                        ) : r.status === 'ON_DUTY' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping"></span>
                            ON DUTY
                          </span>
                        ) : r.status === 'COMPLETED' ? (
                          <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-800">
                            FULL DAY
                          </span>
                        ) : r.status === 'HALF_DAY' ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            HALF DAY
                          </span>
                        ) : r.status === 'PRESENT' ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                            PRESENT
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                            ABSENT
                          </span>
                        )}
                      </td>
                      <td data-label="Duty IN (IST)" className="px-3 py-1.5 font-medium text-slate-800">
                        {inTimeFormatted}
                      </td>
                      <td data-label="Duty OUT (IST)" className="px-3 py-1.5 font-medium text-slate-800">
                        {outTimeFormatted}
                      </td>
                      <td data-label="Worked hours" className="px-3 py-1.5">
                        {r.workedMinutes > 0 ? (
                          <div className="inline-flex flex-col">
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-800 text-[11px] w-fit">
                              {r.workedHoursFormatted}
                            </span>
                            {r.lunchMinutes > 0 && (
                              <span className="text-[9px] font-medium text-slate-500 mt-0.5" title={`Lunch duration: ${r.lunchMinutes}m deducted`}>
                                🍱 {r.lunchMinutes}m lunch
                              </span>
                            )}
                            {r.sessionsCount > 1 && (
                              <span className="text-[10px] font-semibold text-cyan-700" title={`${r.sessionsCount} work sessions recorded today (lunch/breaks excluded)`}>
                                ({r.sessionsCount} shifts)
                              </span>
                            )}
                          </div>
                        ) : r.onLunch ? (
                          <span className="text-[10px] font-medium text-amber-700">🍱 On lunch break</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td data-label="Lunch Time" className="px-3 py-1.5 font-medium text-slate-700 text-xs">
                        {r.onLunch ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 animate-pulse">
                            🍱 On Lunch
                          </span>
                        ) : r.lunchMinutes > 0 ? (
                          <span
                            className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200/70 whitespace-nowrap"
                            title={r.lunchOut && r.lunchIn ? `${new Date(r.lunchOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} – ${new Date(r.lunchIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}` : undefined}
                          >
                            🍱 {formatLunchBreak(r.lunchMinutes)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td data-label="Source" className="px-3 py-1.5">
                        {r.source === 'FACE' ? (
                          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] font-bold text-cyan-800">
                            📷 FACE
                          </span>
                        ) : r.source === 'MANUAL' ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                            ✍ MANUAL
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td data-label="Remarks" className="px-3 py-1.5 text-slate-500 max-w-xs break-words">
                        {r.remarks || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

