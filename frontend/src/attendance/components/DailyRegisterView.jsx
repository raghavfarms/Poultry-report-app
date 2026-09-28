import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath, saveAttendance, getWorkLocationSortRank } from '../services/adminApi.js';
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

function renderMiniMapLink(r) {
  const inLoc = r.inLocation;
  const outLoc = r.outLocation;
  const hasInCoords = inLoc?.status === 'CAPTURED' && Number.isFinite(inLoc.latitude) && Number.isFinite(inLoc.longitude);
  const hasOutCoords = outLoc?.status === 'CAPTURED' && Number.isFinite(outLoc.latitude) && Number.isFinite(outLoc.longitude);
  if (!hasInCoords && !hasOutCoords) return null;

  const targetLoc = hasOutCoords ? outLoc : inLoc;
  return (
    <a
      href={`https://www.google.com/maps?q=${targetLoc.latitude},${targetLoc.longitude}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`GPS Location: ${targetLoc.latitude.toFixed(5)}, ${targetLoc.longitude.toFixed(5)} (±${Math.round(targetLoc.accuracyMetres || 0)}m)`}
      className="inline-flex items-center text-slate-400 hover:text-sky-700 text-[11px] transition ml-0.5"
    >
      📍
    </a>
  );
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

  const currentFirm = useMemo(() => {
    return (firms || []).find((f) => String(f._id) === String(firmId));
  }, [firms, firmId]);
  const isOffice = currentFirm?.code === 'OFFICE' || /office/i.test(currentFirm?.name || '');

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
    if (!firmId || firmId === 'all') {
      setWorkLocations([]);
      return;
    }
    api(attendancePath('work-locations', { firmId, active: true, limit: 100 }))
      .then((res) => {
        const items = res.items || [];
        items.sort((a, b) => {
          const rankA = getWorkLocationSortRank(a.name, a.type, a.order);
          const rankB = getWorkLocationSortRank(b.name, b.type, b.order);
          if (rankA !== rankB) return rankA - rankB;
          return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
        });
        setWorkLocations(items);
      })
      .catch(() => setWorkLocations([]));
  }, [firmId]);

  // 3. Fetch Daily Register data
  const loadRegister = useCallback(() => {
    if (!firmId || firmId === 'all') return;
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
    const locMap = new Map();
    for (const loc of workLocations) {
      if (loc._id) locMap.set(String(loc._id), loc);
      if (loc.name) locMap.set(loc.name.toLowerCase().trim(), loc);
    }

    return list.sort((a, b) => {
      const locA = (a.workLocationId && locMap.get(String(a.workLocationId)))
        || locMap.get((a.workLocationName || '').toLowerCase().trim())
        || { name: a.workLocationName, type: a.workLocationType, order: a.workLocationOrder };
      const locB = (b.workLocationId && locMap.get(String(b.workLocationId)))
        || locMap.get((b.workLocationName || '').toLowerCase().trim())
        || { name: b.workLocationName, type: b.workLocationType, order: b.workLocationOrder };

      const nameA = a.workLocationName || locA.name || 'Unassigned';
      const nameB = b.workLocationName || locB.name || 'Unassigned';

      const rankA = getWorkLocationSortRank(nameA, locA.type, locA.order);
      const rankB = getWorkLocationSortRank(nameB, locB.type, locB.order);
      if (rankA !== rankB) return rankA - rankB;

      const locComp = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      if (locComp !== 0) return locComp;

      return (a.workerName || '').localeCompare(b.workerName || '', undefined, { sensitivity: 'base' });
    });
  }, [data?.records, workLocations]);

  const [autoCuttingWorkerId, setAutoCuttingWorkerId] = useState(null);
  const [autoCutNotice, setAutoCutNotice] = useState('');

  const handleAutoCut = async (r) => {
    const confirmed = window.confirm(
      `Auto-Cut attendance for ${r.workerName}?\n\nThis will mark them DUTY OUT now and calculate logged hours.`
    );
    if (!confirmed) return;

    setAutoCuttingWorkerId(r.workerId);
    setError('');
    setAutoCutNotice('');
    try {
      const res = await saveAttendance('sessions/auto-cut', {
        workerId: r.workerId,
        sessionId: r.sessionId,
        date,
      });
      setAutoCutNotice(res.message || `${r.workerName} auto-cut completed.`);
      setTimeout(() => setAutoCutNotice(''), 4000);
      loadRegister();
    } catch (err) {
      setError(err.message || 'Failed to auto-cut attendance.');
    } finally {
      setAutoCuttingWorkerId(null);
    }
  };

  const renderAutoCutColumn = (r) => {
    if (r.status === 'ABSENT' && !r.dutyIn && !r.dutyOut) {
      return <span className="text-slate-300">—</span>;
    }

    const isOnDuty = r.status === 'ON_DUTY' || r.onLunch;

    if (isOnDuty) {
      const isCutting = autoCuttingWorkerId === r.workerId;
      return (
        <div className="inline-flex items-center justify-center gap-1.5">
          <button
            type="button"
            disabled={isCutting}
            onClick={() => handleAutoCut(r)}
            className="inline-flex items-center gap-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-200 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold shadow-2xs transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="Worker did not scan face on OUT? Click to auto-cut duty out."
          >
            <span>✂️</span>
            <span>{isCutting ? 'Cutting…' : 'Auto Cut'}</span>
          </button>
          {renderMiniMapLink(r)}
        </div>
      );
    }

    return (
      <div className="inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold">
          <span>✓</span>
          <span>Out</span>
        </span>
        {renderMiniMapLink(r)}
      </div>
    );
  };

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
          {/* Location / Department Filter */}
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
              {isOffice ? 'Department / Location' : 'Shed / Location'}
            </label>
            <select
              aria-label={isOffice ? 'Filter by Department' : 'Filter by Shed'}
              className={`${inputClass} !min-h-7 !h-7 !py-0 !px-1.5 text-xs font-semibold rounded-lg`}
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
            >
              <option value="">{isOffice ? 'All Departments & Locations' : 'All Sheds & Locations'}</option>
              {workLocations.map((loc) => (
                <option key={loc._id} value={loc._id}>
                  {loc.name} {loc.type && loc.type !== 'MISCELLANEOUS' ? `(${loc.type})` : ''}
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
      {autoCutNotice && <Alert type="success">{autoCutNotice}</Alert>}

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

      {autoCutNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 flex items-center justify-between shadow-2xs">
          <span>✂️ {autoCutNotice}</span>
          <button type="button" onClick={() => setAutoCutNotice('')} className="text-emerald-600 hover:text-emerald-800 text-xs cursor-pointer">✕</button>
        </div>
      )}

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
          <div className="overflow-x-auto overflow-y-auto max-h-[305px] sm:max-h-[330px] print:max-h-none print:overflow-visible report-scroll">
            <table className="attendance-table w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-slate-50 px-2.5 py-1.5 sm:px-3 sm:py-2 border-r border-slate-200/60 shadow-[1px_0_2px_rgba(0,0,0,0.03)] whitespace-nowrap">Worker ID & Name</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Work Location</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Designation</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Status</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Duty IN</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Duty OUT</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Hours Logged</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Lunch Time</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap">Source</th>
                  <th className="sticky top-0 bg-slate-50 px-3 py-2 whitespace-nowrap text-center">Auto Cut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const inTimeFormatted = r.dutyIn
                    ? new Date(r.dutyIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
                    : '—';
                  const isNextDayOut = r.dutyIn && r.dutyOut && new Date(r.dutyOut).getDate() !== new Date(r.dutyIn).getDate();
                  const outTimeFormatted = r.dutyOut
                    ? new Date(r.dutyOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })
                    : '—';

                  return (
                    <tr key={r.workerId} className="hover:bg-slate-50/80 group">
                      <td data-label="Worker" className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors px-2.5 py-1 sm:px-3 border-r border-slate-200/60 shadow-[1px_0_2px_rgba(0,0,0,0.03)]">
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
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
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
                        <span>{outTimeFormatted}</span>
                        {isNextDayOut && (
                          <span
                            className="ml-1 text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1 py-0.5 rounded"
                            title="Checked out on the next calendar day (overnight shift)"
                          >
                            +1 day
                          </span>
                        )}
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
                      <td data-label="Auto Cut" className="px-3 py-1.5 whitespace-nowrap text-center">
                        {renderAutoCutColumn(r)}
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

