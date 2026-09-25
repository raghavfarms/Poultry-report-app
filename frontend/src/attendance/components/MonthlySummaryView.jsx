import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';
import { exportReportToPdf } from '../../utils/exportPdf.js';
import { useAuth } from '../../context/AuthContext.jsx';
import AttendanceCorrectionModal from './AttendanceCorrectionModal.jsx';
import BulkAttendanceModal from './BulkAttendanceModal.jsx';

function getCurrentMonthString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
}

export default function MonthlySummaryView({
  firmId: propFirmId,
  setFirmId: propSetFirmId,
  firms: propFirms,
  month: propMonth,
  setMonth: propSetMonth,
}) {
  const { user } = useAuth();
  const canEdit = ['admin', 'developer', 'office', 'supervisor', 'farm_incharge', 'security'].includes(user?.role);
  const canBulkApply = ['admin', 'developer'].includes(user?.role);
  const [editingWorker, setEditingWorker] = useState(null);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [notice, setNotice] = useState('');
  const [internalFirms, setInternalFirms] = useState([]);
  const [internalFirmId, setInternalFirmId] = useState('');
  const [internalMonth, setInternalMonth] = useState(getCurrentMonthString());

  const firms = propFirms && propFirms.length ? propFirms : internalFirms;
  const firmId = propFirmId !== undefined ? propFirmId : internalFirmId;
  const setFirmId = propSetFirmId || setInternalFirmId;
  const month = propMonth !== undefined ? propMonth : internalMonth;
  const setMonth = propSetMonth || setInternalMonth;

  const [workLocations, setWorkLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
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
    if (!firmId) {
      setWorkLocations([]);
      return;
    }
    api(attendancePath('work-locations', { firmId, active: true, limit: 100 }))
      .then((res) => setWorkLocations(res.items || []))
      .catch(() => setWorkLocations([]));
  }, [firmId]);

  // 3. Fetch Monthly Summary data
  const loadMonthlySummary = useCallback(() => {
    if (!firmId) return;
    setLoadingData(true);
    const params = { firmId, month };
    if (selectedLocation) params.workLocationId = selectedLocation;
    if (search.trim()) params.search = search.trim();

    api(attendancePath('reports/monthly', params))
      .then((res) => {
        setData(res);
        setError('');
      })
      .catch((err) => setError(err.message || 'Failed to load monthly summary.'))
      .finally(() => setLoadingData(false));
  }, [firmId, month, selectedLocation, search]);

  useEffect(() => {
    loadMonthlySummary();
  }, [loadMonthlySummary]);

  const daysInMonth = data?.daysInMonth || 30;
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => String(i + 1).padStart(2, '0'));
  const records = useMemo(() => {
    const list = data?.records ? [...data.records] : [];
    return list.sort((a, b) => {
      const nameA = a.workerName || '';
      const nameB = b.workerName || '';
      const nameComp = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      if (nameComp !== 0) return nameComp;
      return (a.workerCode || '').localeCompare(b.workerCode || '', undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [data?.records]);
  const totalWorkers = data?.summary?.totalWorkers ?? records.length;

  const editActions = (record) => (
    <div className="flex flex-col items-center gap-0.5">
      <button type="button" className={secondaryButton + ' !min-h-7 !h-7 !px-2.5 text-xs font-semibold rounded-md'}
        aria-label={'Edit attendance for ' + record.workerName}
        onClick={() => setEditingWorker({ _id: record.workerId, fullName: record.workerName })}>
        Edit
      </button>
      <span className="text-[11px] font-semibold text-slate-500" title={`${record.editCount || 0} edits this month`}>
        {record.editCount || 0}
      </span>
    </div>
  );

  // Export Monthly Matrix to CSV
  const exportCsv = () => {
    if (!records.length) return;
    const activeFirm = firms.find((f) => f._id === firmId);
    const firmName = activeFirm ? activeFirm.name.replace(/,/g, ' ') : 'Firm';

    const dayHeaders = daysArray.map((d) => `Day ${Number(d)}`);
    const headers = [
      'Worker Code',
      'Worker Name',
      'Designation',
      'Work Location',
      ...dayHeaders,
      'Total Days Present',
      'Total Days Absent',
    ];

    const rows = records.map((r) => [
      `"${r.workerCode || ''}"`,
      `"${r.workerName || ''}"`,
      `"${r.designationName || ''}"`,
      `"${r.workLocationName || ''}"`,
      ...daysArray.map((d) => `"${r.days[d] || '—'}"`),
      `"${r.totalDaysPresent || 0}"`,
      `"${r.totalDaysAbsent ?? Object.values(r.days || {}).filter((code) => code === 'A').length}"`,
    ]);

    const csvContent = [
      `"Monthly Attendance Summary - ${firmName} (${month})"`,
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `monthly-attendance-${month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export Monthly Matrix to PDF
  const exportPdf = async () => {
    if (!reportRef.current || !records.length) return;
    setExportingPdf(true);
    try {
      const activeFirm = firms.find((f) => f._id === firmId);
      const firmName = activeFirm ? (activeFirm.code || activeFirm.name).replace(/[^a-zA-Z0-9_-]/g, '_') : 'Firm';
      await exportReportToPdf(reportRef.current, {
        filename: `monthly-attendance-${firmName}-${month}.pdf`,
        orientation: 'landscape',
        format: 'a3',
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
      <div className="rounded-xl border border-slate-200 bg-white p-1.5 sm:p-2 shadow-2xs no-print print:hidden">
        <div className="grid grid-cols-2 gap-1.5 items-center">
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

          {/* Search Worker with count */}
          <div>
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
              placeholder="Name or Code…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} !min-h-7 !h-7 !py-0 !px-2 text-xs rounded-lg`}
            />
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      {/* Worker count & export actions strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-slate-50/90 py-1.5 px-2 text-xs shadow-2xs no-print print:hidden">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 whitespace-nowrap shrink-0">
          <span>Total staff:</span>
          <span className="font-black text-slate-900 bg-white px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs">{totalWorkers}</span>
        </div>

        {/* Action Buttons: Export PDF, CSV, Print & Bulk Entry */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5 shrink-0">
          {canBulkApply && (
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              title="Bulk Daily Muster Entry for all workers"
              className="inline-flex items-center gap-1 !h-6.5 !min-h-6.5 px-2 text-[10px] sm:text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded cursor-pointer shadow-2xs transition-colors whitespace-nowrap shrink-0"
            >
              <span>⚡ Bulk Entry</span>
            </button>
          )}

          <button
            type="button"
            onClick={exportPdf}
            disabled={loadingData || !records.length || exportingPdf}
            title="Export Monthly Matrix to PDF"
            className="inline-flex items-center gap-1 !h-6.5 !min-h-6.5 px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
          >
            <svg className="w-3 h-3 text-rose-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
            </svg>
            <span>{exportingPdf ? 'Exporting…' : 'PDF'}</span>
          </button>

          <button
            type="button"
            onClick={exportCsv}
            disabled={loadingData || !records.length}
            title="Export Monthly Matrix to CSV"
            className="inline-flex items-center gap-1 !h-6.5 !min-h-6.5 px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
          >
            <span className="text-emerald-600">📊</span>
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            disabled={loadingData || !records.length}
            title="Print Monthly Summary"
            className="inline-flex items-center gap-1 !h-6.5 !min-h-6.5 px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 disabled:opacity-40 cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
          >
            <svg className="w-3 h-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs px-1 text-slate-500 no-print print:hidden">
        <span className="font-semibold text-[10px] uppercase tracking-wider">Legend:</span>
        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> P (Full Day)
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200/50">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span> HD (Half Day)
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900 border border-emerald-300/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span> OD (On Duty)
        </span>
        <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-200/50">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> A (Absent)
        </span>
      </div>

      {/* Monthly Attendance Calendar Matrix Table */}
      <div ref={reportRef} className="report-export-content overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {/* Printable/Export Header */}
        <div className="pdf-print-header hidden print:block p-2 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                {currentFirm?.name || 'Monthly Attendance Register'}
              </h2>
              <p className="text-[10px] text-slate-500 font-semibold">
                Month: {month} · Total Staff: {totalWorkers} · Generated: {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date())}
              </p>
            </div>
            <div className="text-[9px] font-bold text-slate-400">
              P = Present | HD = Half Day | OD = On Duty | A = Absent
            </div>
          </div>
        </div>

        {loadingData ? (
          <div className="py-12 text-center">
            <Spinner label="Loading monthly attendance matrix…" />
          </div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <p className="text-sm font-semibold">No attendance records found for this month.</p>
          </div>
        ) : (
          <div className="attendance-month-matrix overflow-x-auto overflow-y-auto max-h-[305px] sm:max-h-[330px] print:max-h-none print:overflow-visible report-scroll" tabIndex={0} role="region" aria-label="Monthly attendance matrix; scroll horizontally to see all days">
            <table className="attendance-month-table w-full text-left text-xs border-collapse print:text-[7.5px] print:w-full print:table-fixed">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky top-0 z-20 shadow-[0_1px_2px_rgba(0,0,0,0.04)] print:table-header-group">
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-slate-50 px-2.5 py-1.5 shadow-[1px_0_0_#e2e8f0] whitespace-nowrap print:static print:shadow-none print:px-1 print:py-0.5 print:w-20">
                    Worker
                  </th>
                  <th className="sticky top-0 bg-slate-50 px-2.5 py-1.5 whitespace-nowrap print:px-1 print:py-0.5 print:w-16">Designation</th>
                  <th className="sticky top-0 bg-slate-50 px-2.5 py-1.5 whitespace-nowrap print:px-1 print:py-0.5 print:w-16">Shed</th>
                  {daysArray.map((d) => (
                    <th key={d} className="sticky top-0 bg-slate-50 px-1 py-1.5 text-center min-w-6 print:min-w-0 print:w-3.5 print:px-0 print:py-0.5 whitespace-nowrap">
                      {Number(d)}
                    </th>
                  ))}
                  <th className="sticky top-0 bg-slate-50 px-2.5 py-1.5 text-center whitespace-nowrap print:px-1 print:py-0.5 print:w-10">Present</th>
                  <th className="sticky top-0 bg-slate-50 px-2.5 py-1.5 text-center whitespace-nowrap print:px-1 print:py-0.5 print:w-10">Absent</th>
                  {canEdit && <th className="sticky top-0 bg-slate-50 px-2.5 py-1.5 text-center whitespace-nowrap no-print print:hidden" data-html2canvas-ignore="true">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.workerId} className="hover:bg-slate-50/60 group print:break-inside-avoid">
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors px-2.5 py-1.5 shadow-[1px_0_0_#e2e8f0] font-semibold text-slate-900 whitespace-nowrap print:static print:shadow-none print:px-1 print:py-0.5">
                      <div>
                        <p className="truncate max-w-[130px] print:max-w-[80px] print:text-[8px]">{r.workerName}</p>
                        <p className="text-[10px] print:text-[6.5px] text-slate-400">{r.workerCode}</p>
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 print:px-1 print:py-0.5 text-[11px] print:text-[7.5px] font-medium text-slate-600 whitespace-nowrap truncate print:max-w-[65px]">
                      {r.designationName || '—'}
                    </td>
                    <td className="px-2.5 py-1.5 print:px-1 print:py-0.5 text-[11px] print:text-[7.5px] font-medium text-slate-600 whitespace-nowrap truncate print:max-w-[65px]">
                      {r.workLocationName}
                    </td>

                    {/* Day-by-Day status cells */}
                    {daysArray.map((d) => {
                      const code = r.days[d] || '—';
                      let cellClass = 'text-slate-300';
                      if (code === 'P') cellClass = 'bg-emerald-100 text-emerald-800 font-bold';
                      else if (code === 'HD') cellClass = 'bg-amber-100 text-amber-800 font-bold';
                      else if (code === 'OD') cellClass = 'bg-emerald-600 text-white font-bold';
                      else if (code === 'A') cellClass = 'bg-rose-50 text-rose-600 font-medium';

                      return (
                        <td key={d} className="px-0.5 py-0.5 print:px-0 print:py-0 text-center whitespace-nowrap">
                          <span className={`inline-block w-5 print:w-3.5 rounded py-0.5 print:py-0 text-[10px] print:text-[6.5px] ${cellClass}`}>
                            {code}
                          </span>
                        </td>
                      );
                    })}

                    <td className="px-2.5 py-1.5 print:px-0.5 print:py-0.5 text-center font-bold text-emerald-800 whitespace-nowrap print:text-[7.5px]">
                      {r.totalDaysPresent} d
                    </td>
                    <td className="px-2.5 py-1.5 print:px-0.5 print:py-0.5 text-center font-bold text-rose-700 whitespace-nowrap print:text-[7.5px]">
                      {r.totalDaysAbsent ?? Object.values(r.days || {}).filter((code) => code === 'A').length} d
                    </td>
                    {canEdit && <td className="px-2.5 py-1.5 text-center whitespace-nowrap no-print print:hidden" data-html2canvas-ignore="true">{editActions(r)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editingWorker && <AttendanceCorrectionModal
        worker={editingWorker}
        supervisor={user?.role === 'supervisor'}
        initialDate={month === getCurrentMonthString()
          ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
          : month + '-01'}
        onClose={() => setEditingWorker(null)}
        onSuccess={(message) => { setNotice(message); loadMonthlySummary(); }}
      />}
      {canBulkApply && showBulkModal && <BulkAttendanceModal
        firmId={firmId}
        initialDate={`${month}-01`}
        onClose={() => setShowBulkModal(false)}
        onSuccess={(message) => { setNotice(message); loadMonthlySummary(); }}
      />}
    </div>
  );
}

