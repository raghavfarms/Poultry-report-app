import React, { useState, useEffect, useMemo, useRef } from 'react';
import { fetchIssues } from '../api/issueApi.js';
import { fetchMedicineLocations } from '../api/dailyActionApi.js';

export default function MedicineConsumptionRegister({
  selectedFarm = '',
  firms = [],
  onBackToDaily,
}) {
  // Helper to format ISO date to YYYY-MM-DD in local time
  const formatYMD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Compute default "This Month" date range
  const now = new Date();
  const defaultMonthStart = formatYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultMonthEnd = formatYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  // Filters State
  const [datePreset, setDatePreset] = useState('THIS_MONTH');
  const [startDate, setStartDate] = useState(defaultMonthStart);
  const [endDate, setEndDate] = useState(defaultMonthEnd);
  const [activeFarm, setActiveFarm] = useState(selectedFarm || '');
  const [selectedShed, setSelectedShed] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15); // Default 15 items per page as requested

  // Data State
  const [issues, setIssues] = useState([]);
  const [unitSummary, setUnitSummary] = useState([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Shed Locations List for Filter
  const [shedList, setShedList] = useState([]);

  // Sync prop changes
  useEffect(() => {
    setActiveFarm(selectedFarm || '');
  }, [selectedFarm]);

  // Load Sheds when farm changes
  useEffect(() => {
    const loadSheds = async () => {
      try {
        const res = await fetchMedicineLocations(activeFarm);
        setShedList(res.locations || []);
      } catch (err) {
        setShedList([]);
      }
    };
    loadSheds();
  }, [activeFarm]);

  // Preset Handler
  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    setPage(1);
    const curr = new Date();
    if (preset === 'THIS_MONTH') {
      setStartDate(formatYMD(new Date(curr.getFullYear(), curr.getMonth(), 1)));
      setEndDate(formatYMD(new Date(curr.getFullYear(), curr.getMonth() + 1, 0)));
    } else if (preset === 'LAST_MONTH') {
      setStartDate(formatYMD(new Date(curr.getFullYear(), curr.getMonth() - 1, 1)));
      setEndDate(formatYMD(new Date(curr.getFullYear(), curr.getMonth(), 0)));
    } else if (preset === 'TODAY') {
      const todayStr = formatYMD(curr);
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'LAST_7_DAYS') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(curr.getDate() - 6);
      setStartDate(formatYMD(sevenDaysAgo));
      setEndDate(formatYMD(curr));
    } else if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  // Main Data Loader
  const loadRegister = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {
        farm: activeFarm || undefined,
        shed: selectedShed !== 'ALL' ? selectedShed : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        search: search.trim() || undefined,
        page,
        limit,
      };

      const res = await fetchIssues(params);
      if (res.success) {
        setIssues(res.issues || []);
        setUnitSummary(res.unitSummary || []);
        setTotalRecords(res.pagination?.total || 0);
        setTotalPages(res.pagination?.totalPages || 1);
      } else {
        setError(res.message || 'Failed to fetch consumption register');
      }
    } catch (err) {
      setError(err.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  // Trigger data load when filters change
  useEffect(() => {
    loadRegister();
  }, [activeFarm, selectedShed, startDate, endDate, page, limit]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadRegister();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Farm Name lookup
  const currentFarmName = useMemo(() => {
    if (!activeFarm) return 'All Farms';
    const f = firms.find((firm) => firm._id === activeFarm);
    return f ? f.name : 'Farm';
  }, [activeFarm, firms]);

  // Native Print Handler
  const handlePrint = () => {
    window.print();
  };

  // Export to CSV Handler
  const handleExportCSV = () => {
    if (!issues || issues.length === 0) {
      alert('No data available to export');
      return;
    }

    const headers = [
      'S.No',
      'Date',
      'Time',
      'Farm',
      'Medicine Name',
      'Batch Number',
      'Location/Shed',
      'Quantity Consumed',
      'Unit',
      'Issued By',
      'Received By (Worker)',
      'Purpose',
      'Remarks',
    ];

    const rows = issues.map((iss, index) => {
      const d = new Date(iss.createdAt);
      const dateStr = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      return [
        index + 1 + (page - 1) * limit,
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"${iss.farm?.name || ''}"`,
        `"${iss.medicine?.name || ''}"`,
        `"${iss.batchNumber || ''}"`,
        `"${iss.shed || ''}"`,
        iss.issuedQuantity || 0,
        `"${iss.unit || ''}"`,
        `"${iss.issuedByName || iss.issuedBy?.name || ''}"`,
        `"${iss.issuedTo || ''}"`,
        `"${iss.purpose || 'TREATMENT'}"`,
        `"${(iss.remarks || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Medicine_Consumption_Register_${currentFarmName.replace(/\s+/g, '_')}_${startDate || 'all'}_to_${endDate || 'all'}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-3.5 w-full max-w-6xl mx-auto pb-12 print:p-0 print:m-0 print:max-w-none">
      {/* ======================================================== */}
      {/* 1. TOP HEADER & AUDIT SUMMARY BAR (Screen & Print)      */}
      {/* ======================================================== */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 print:border-none print:shadow-none print:p-0 print:mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl print:hidden">📋</span>
            <h1 className="text-sm sm:text-base font-extrabold text-slate-800 tracking-tight">
              Medicine Consumption & Shed Issue Register
            </h1>
            <span className="bg-blue-100 text-blue-800 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md">
              🏢 {currentFarmName}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Official monthly verification register for bird treatment, flock dosages and physical store audit
          </p>
          <div className="hidden print:block text-[11px] font-semibold text-slate-600 mt-1">
            <span>Period: {startDate || 'Start'} to {endDate || 'Present'}</span>
            <span className="mx-2">|</span>
            <span>Printed on: {new Date().toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Action Buttons: Print, Export CSV, Refresh */}
        <div className="flex items-center gap-2 shrink-0 print:hidden w-full sm:w-auto justify-end">
          {onBackToDaily && (
            <button
              type="button"
              onClick={onBackToDaily}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
            >
              <span>⚡</span> In / Out
            </button>
          )}

          <button
            type="button"
            onClick={loadRegister}
            disabled={loading}
            className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition"
            title="Refresh records"
          >
            <span>↻</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={loading || issues.length === 0}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition disabled:opacity-50"
            title="Export CSV for Excel"
          >
            <span>📥</span> Excel / CSV
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || issues.length === 0}
            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition disabled:opacity-50"
            title="Print A4 Register for verification"
          >
            <span>🖨️</span> Print Register
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. FILTER STRIP (Presets, Dates, Farm, Shed, Search)     */}
      {/* ======================================================== */}
      <div className="bg-white p-3 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3 print:hidden">
        {/* Row A: Quick Presets */}
        <div className="flex items-center justify-between gap-2 flex-wrap pb-2 border-b border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Period:
            </span>
            {[
              { id: 'THIS_MONTH', label: '📅 This Month' },
              { id: 'LAST_MONTH', label: 'Last Month' },
              { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
              { id: 'TODAY', label: 'Today' },
              { id: 'ALL', label: 'All Records' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Records Count Badge */}
          <div className="text-xs font-semibold text-slate-500">
            Found: <strong className="text-slate-800">{totalRecords}</strong> issue records
          </div>
        </div>

        {/* Row B: Filter Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 items-end">
          {/* 1. From Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('CUSTOM');
                setPage(1);
              }}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch (_) {} }}
              className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
            />
          </div>

          {/* 2. To Date */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('CUSTOM');
                setPage(1);
              }}
              onClick={(e) => { try { e.currentTarget.showPicker(); } catch (_) {} }}
              className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
            />
          </div>

          {/* 3. Farm Select */}
          {firms.length > 1 && (
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                Farm Store
              </label>
              <select
                value={activeFarm}
                onChange={(e) => {
                  setActiveFarm(e.target.value);
                  setSelectedShed('ALL');
                  setPage(1);
                }}
                className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="">All Farms (Consolidated)</option>
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 4. Location / Shed Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              Shed / Location
            </label>
            <select
              value={selectedShed}
              onChange={(e) => {
                setSelectedShed(e.target.value);
                setPage(1);
              }}
              className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Sheds & Locations</option>
              {shedList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Live Search */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search medicine, batch, worker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
            />
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 3. MONTH-END TOTAL CONSUMPTION SUMMARY STRIP             */}
      {/* ======================================================== */}
      {unitSummary && unitSummary.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-3 shadow-2xs print:border print:border-slate-300 print:bg-white print:p-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-base print:hidden">📊</span>
              <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wide">
                Total Medicine Consumed in Period:
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {unitSummary.map((us) => (
                <span
                  key={us.unit}
                  className="px-2.5 py-0.5 rounded-lg bg-white border border-blue-200 text-blue-950 font-black text-xs shadow-2xs print:border-none print:p-0 print:mr-2"
                >
                  {us.total} <span className="font-semibold text-slate-600 text-[11px]">{us.unit}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. THE MAIN CONSUMPTION REGISTER TABLE (15 Rows Min)     */}
      {/* ======================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden print:border-none print:shadow-none">
        {/* Table Controls (Rows per page) */}
        <div className="px-3 py-2 bg-slate-50/90 border-b border-slate-200 flex justify-between items-center text-xs print:hidden">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span>Rows:</span>
            <select
              value={limit}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                setLimit(val);
                setPage(1);
              }}
              className="h-7 px-1.5 border border-slate-300 rounded bg-white text-xs font-semibold focus:outline-none"
            >
              <option value={15}>15 rows (Default)</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value="all">All (Print Whole Month)</option>
            </select>
          </div>

          <div className="text-slate-500 font-semibold text-[11px]">
            Page {page} of {totalPages}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-400">
            <span className="animate-spin inline-block mr-2">↻</span> Loading consumption records...
          </div>
        ) : error ? (
          <div className="p-6 text-center text-xs text-rose-600 font-semibold">
            ⚠️ {error}
          </div>
        ) : issues.length === 0 ? (
          <div className="p-8 text-center text-slate-400 space-y-1">
            <p className="text-xs font-bold text-slate-600">No medicine issues found for this period</p>
            <p className="text-[11px]">
              Change the date range or select another farm store above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs print:text-[10px]">
              <thead>
                <tr className="bg-slate-100/80 text-slate-700 uppercase tracking-wider text-[10px] font-extrabold border-b border-slate-200 print:bg-slate-200">
                  <th className="py-2.5 px-3 text-center w-10 border-r border-slate-200">#</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Date & Time</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Farm</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Medicine Name</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Batch No</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Location / Shed</th>
                  <th className="py-2.5 px-3 text-right border-r border-slate-200">Qty Consumed</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Issued By</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Received By</th>
                  <th className="py-2.5 px-3 print:table-cell">Remarks / Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {issues.map((iss, idx) => {
                  const sNo = idx + 1 + (page - 1) * (limit === 'all' ? issues.length : limit);
                  const dateObj = new Date(iss.createdAt);
                  const dateStr = dateObj.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  const timeStr = dateObj.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={iss._id}
                      className="hover:bg-blue-50/40 transition-colors odd:bg-white even:bg-slate-50/30 print:even:bg-transparent"
                    >
                      {/* 1. S.No */}
                      <td className="py-2 px-3 text-center font-mono font-bold text-slate-400 border-r border-slate-200">
                        {sNo}
                      </td>

                      {/* 2. Date & Time */}
                      <td className="py-2 px-3 whitespace-nowrap border-r border-slate-200">
                        <div className="font-bold text-slate-900">{dateStr}</div>
                        <div className="text-[10px] text-slate-400">{timeStr}</div>
                      </td>

                      {/* 3. Farm */}
                      <td className="py-2 px-3 font-semibold text-slate-700 whitespace-nowrap border-r border-slate-200">
                        {iss.farm?.name || 'Farm'}
                      </td>

                      {/* 4. Medicine Name */}
                      <td className="py-2 px-3 border-r border-slate-200">
                        <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                          <span>{iss.medicine?.name || 'Medicine'}</span>
                        </div>
                        {iss.medicine?.category && (
                          <span className="text-[9px] text-slate-400 uppercase font-bold">
                            {iss.medicine.category}
                          </span>
                        )}
                      </td>

                      {/* 5. Batch No */}
                      <td className="py-2 px-3 font-mono font-bold text-slate-600 whitespace-nowrap border-r border-slate-200">
                        #{iss.batchNumber}
                      </td>

                      {/* 6. Location / Shed */}
                      <td className="py-2 px-3 border-r border-slate-200 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded print:p-0 print:bg-transparent">
                          <span>🏠</span> {iss.shed || iss.destinationName || 'Shed'}
                        </span>
                      </td>

                      {/* 7. Quantity Consumed */}
                      <td className="py-2 px-3 text-right border-r border-slate-200 whitespace-nowrap">
                        <span className="font-black text-xs text-blue-700 print:text-black">
                          {iss.issuedQuantity}
                        </span>{' '}
                        <span className="text-[10px] font-bold text-slate-500">
                          {iss.unit}
                        </span>
                      </td>

                      {/* 8. Issued By */}
                      <td className="py-2 px-3 font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap">
                        {iss.issuedByName || iss.issuedBy?.name || 'Store'}
                      </td>

                      {/* 9. Received By (Worker) */}
                      <td className="py-2 px-3 font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                        {iss.issuedTo || 'Worker'}
                      </td>

                      {/* 10. Remarks */}
                      <td className="py-2 px-3 text-[11px] text-slate-500 max-w-xs truncate">
                        {iss.remarks || iss.purpose || 'Treatment'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ======================================================== */}
        {/* 5. PAGINATION BAR (Screen Only)                          */}
        {/* ======================================================== */}
        {issues.length > 0 && limit !== 'all' && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-semibold print:hidden">
            <span className="text-slate-500">
              Showing {issues.length > 0 ? (page - 1) * limit + 1 : 0} to{' '}
              {Math.min(page * limit, totalRecords)} of {totalRecords} entries
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 transition cursor-pointer"
              >
                ◀ Previous
              </button>

              <span className="px-2 text-slate-600 font-bold">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 transition cursor-pointer"
              >
                Next ▶
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 6. MONTH-END OFFICIAL VERIFICATION & SIGNATURES BLOCK   */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs mt-4 print:border-none print:shadow-none print:p-0 print:mt-6">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-100 pb-1">
          Month-End Verification & Audit Sign-Off
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
          {/* Sign 1: Storekeeper */}
          <div className="border-t border-dashed border-slate-300 pt-2">
            <div className="text-xs font-bold text-slate-800">Storekeeper / Issuer</div>
            <div className="text-[10px] text-slate-400">Stock physically deducted & entered</div>
            <div className="h-8 print:h-12"></div>
            <div className="text-[11px] text-slate-500 font-mono">Sign: _____________________</div>
          </div>

          {/* Sign 2: Farm Supervisor */}
          <div className="border-t border-dashed border-slate-300 pt-2">
            <div className="text-xs font-bold text-slate-800">Farm Supervisor / In-Charge</div>
            <div className="text-[10px] text-slate-400">Verified shed dose & bird flock counts</div>
            <div className="h-8 print:h-12"></div>
            <div className="text-[11px] text-slate-500 font-mono">Sign: _____________________</div>
          </div>

          {/* Sign 3: Owner / Sir */}
          <div className="border-t border-dashed border-slate-300 pt-2">
            <div className="text-xs font-bold text-slate-800">Owner / Sir Verification</div>
            <div className="text-[10px] text-slate-400">Monthly closing stock audited & approved</div>
            <div className="h-8 print:h-12"></div>
            <div className="text-[11px] text-slate-500 font-mono">Sign: _____________________</div>
          </div>
        </div>
      </div>
    </div>
  );
}
