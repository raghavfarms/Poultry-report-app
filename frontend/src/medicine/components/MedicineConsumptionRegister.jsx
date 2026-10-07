import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { fetchIssues } from '../api/issueApi.js';
import { fetchMedicineLocations } from '../api/dailyActionApi.js';
import { exportReportToPdf } from '../../utils/exportPdf.js';

export default function MedicineConsumptionRegister({
  selectedFarm = '',
  firms = [],
  onBackToDaily,
}) {
  const registerRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15); // Default 15 items per page as requested

  // Check if any non-default filter is currently active
  const hasActiveFilters = Boolean(
    datePreset === 'CUSTOM' ||
    (selectedShed && selectedShed !== 'ALL') ||
    search.trim()
  );

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

  // Load Sheds when farm changes (handles "All Farms" and specific farms)
  useEffect(() => {
    const loadSheds = async () => {
      try {
        const res = await fetchMedicineLocations(activeFarm);
        const locs = res.locations || [];
        // Deduplicate and natural sort so common locations never repeat
        const seen = new Set();
        const uniqueList = [];
        for (const loc of locs) {
          if (!loc || typeof loc !== 'string') continue;
          const clean = loc.trim();
          const key = clean.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            uniqueList.push(clean);
          }
        }
        uniqueList.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        setShedList(uniqueList);
      } catch (err) {
        setShedList([]);
      }
    };
    loadSheds();
  }, [activeFarm]);

  // Preset Handler (Only This Month and Last Month)
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

  // Export to PDF Handler using html2canvas-pro + jsPDF
  const handleExportPDF = async () => {
    if (!registerRef.current || exportingPdf) return;
    try {
      setExportingPdf(true);
      await exportReportToPdf(registerRef.current, {
        filename: `Medicine_Consumption_Register_${currentFarmName.replace(/\s+/g, '_')}_${startDate || 'start'}_to_${endDate || 'end'}.pdf`,
        orientation: 'landscape',
        format: 'a4',
        margin: 6,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try Print Register instead.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Export to Excel Handler using SheetJS (XLSX)
  const handleExportExcel = async () => {
    if (exportingExcel || issues.length === 0) return;
    try {
      setExportingExcel(true);

      let exportData = issues;
      if (totalRecords > issues.length && limit !== 'all') {
        const res = await fetchIssues({
          farm: activeFarm || undefined,
          shed: selectedShed !== 'ALL' ? selectedShed : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          search: search.trim() || undefined,
          limit: 'all',
        });
        if (res.success && res.issues?.length) {
          exportData = res.issues;
        }
      }

      const excelRows = exportData.map((iss, idx) => {
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

        return {
          'S.No': idx + 1,
          'Medicine Name': iss.medicine?.name || 'Medicine',
          'Category': iss.medicine?.category || '—',
          'Date': dateStr,
          'Time': timeStr,
          'Farm': iss.farm?.name || 'Farm',
          'Location / Shed': iss.shed || iss.destinationName || 'Shed',
          'Qty Consumed': Number(iss.issuedQuantity) || 0,
          'Unit': iss.unit || '',
          'Batch No': iss.batchNumber ? `#${iss.batchNumber}` : '—',
          'Issued By': iss.issuedByName || iss.issuedBy?.name || 'Store',
          'Received By': iss.issuedTo || 'Worker',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);

      worksheet['!cols'] = [
        { wch: 6 },
        { wch: 22 },
        { wch: 14 },
        { wch: 14 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 14 },
        { wch: 10 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Consumption');

      const safeFarmName = currentFarmName.replace(/\s+/g, '_');
      const filename = `Medicine_Consumption_Register_${safeFarmName}_${startDate || 'start'}_to_${endDate || 'end'}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('Failed to generate Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  return (
    <div
      ref={registerRef}
      className="report-export-content space-y-2.5 sm:space-y-3.5 w-full max-w-6xl mx-auto pb-12 px-1 sm:px-0 print:p-0 print:m-0 print:max-w-none"
    >
      {/* ======================================================== */}
      {/* 1. TOP HEADER & AUDIT SUMMARY BAR (Screen & Print)      */}
      {/* ======================================================== */}
      <div className="bg-white p-2 sm:p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-row justify-between items-center gap-2 print:border-none print:shadow-none print:p-0 print:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <span className="text-sm sm:text-lg print:hidden">📋</span>
          <h1 className="text-xs sm:text-base font-extrabold text-slate-800 tracking-tight truncate">
            Consumption
          </h1>
          <span className="bg-blue-100 text-blue-800 text-[9px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 rounded-md truncate max-w-[110px] sm:max-w-none">
            🏢 {currentFarmName}
          </span>
          <p className="hidden lg:block text-[11px] text-slate-500 ml-2">
            Monthly verification register
          </p>
        </div>

        {/* Action Buttons: Print, PDF, Excel, Refresh */}
        <div data-html2canvas-ignore="true" className="flex items-center gap-1 sm:gap-2 shrink-0 print:hidden">
          {onBackToDaily && (
            <button
              type="button"
              onClick={onBackToDaily}
              className="hidden md:flex px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold items-center gap-1 cursor-pointer transition shrink-0"
            >
              <span>⚡</span> In / Out
            </button>
          )}

          <button
            type="button"
            onClick={loadRegister}
            disabled={loading}
            className="p-1 sm:p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold cursor-pointer transition shrink-0"
            title="Refresh records"
          >
            <span>↻</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            disabled={loading || issues.length === 0 || exportingPdf}
            className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[10px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs transition disabled:opacity-50 whitespace-nowrap"
            title="Download PDF Document"
          >
            <span>📄</span> <span>{exportingPdf ? '...' : 'PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || issues.length === 0 || exportingExcel}
            className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[10px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs transition disabled:opacity-50 whitespace-nowrap"
            title="Download Excel Sheet (.xlsx)"
          >
            <span>📊</span> <span>{exportingExcel ? '...' : 'Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || issues.length === 0}
            className="px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs transition disabled:opacity-50 whitespace-nowrap"
            title="Print A4 Register for verification"
          >
            <span>🖨️</span> <span>Print</span>
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. FILTER STRIP (Presets, Dates, Farm, Shed, Search)     */}
      {/* ======================================================== */}
      <div data-html2canvas-ignore="true" className="bg-white p-2 sm:p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2 print:hidden">
        {/* Row A: Quick Presets + Filter Toggle on Mobile */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 sm:gap-1.5">
            <span className="hidden sm:inline text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-0.5 sm:mr-1">
              Period:
            </span>
            {[
              { id: 'THIS_MONTH', label: '📅 This Month' },
              { id: 'LAST_MONTH', label: 'Last Month' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePresetChange(p.id)}
                className={`px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-bold transition cursor-pointer ${
                  datePreset === p.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mobile Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              className={`sm:hidden px-2 py-0.5 rounded-md text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                showMobileFilters || hasActiveFilters
                  ? 'bg-blue-50 border-blue-300 text-blue-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <span>🔍 Filters</span>
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              )}
              <span className="text-[9px]">{showMobileFilters ? '▲' : '▼'}</span>
            </button>

            {/* Records Count Badge */}
            <div className="text-[10px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap">
              Found: <strong className="text-slate-800">{totalRecords}</strong>
            </div>
          </div>
        </div>

        {/* Row B: Filter Inputs (Collapsed by default on mobile, always visible on desktop) */}
        <div className={`${showMobileFilters ? 'grid' : 'hidden'} sm:grid grid-cols-2 lg:grid-cols-5 gap-2 items-end pt-1 sm:pt-0 border-t border-slate-100 sm:border-0`}>
          {/* 1. From Date */}
          <div>
            <label className="block text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase mb-0.5 sm:mb-1">
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
              className="w-full h-7 sm:h-8 px-2 border border-slate-300 rounded-lg text-[10px] sm:text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
            />
          </div>

          {/* 2. To Date */}
          <div>
            <label className="block text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase mb-0.5 sm:mb-1">
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
              className="w-full h-7 sm:h-8 px-2 border border-slate-300 rounded-lg text-[10px] sm:text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
            />
          </div>

          {/* 3. Farm Select */}
          {firms.length > 1 && (
            <div>
              <label className="block text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase mb-0.5 sm:mb-1">
                Farm Store
              </label>
              <select
                value={activeFarm}
                onChange={(e) => {
                  setActiveFarm(e.target.value);
                  setSelectedShed('ALL');
                  setPage(1);
                }}
                className="w-full h-7 sm:h-8 px-2 border border-slate-300 rounded-lg text-[10px] sm:text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
              >
                <option value="">All Farms</option>
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* 4. Location / Shed Filter */}
          <div className={firms.length > 1 ? '' : 'col-span-2 sm:col-span-1'}>
            <label className="block text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase mb-0.5 sm:mb-1">
              Shed / Location
            </label>
            <select
              value={selectedShed}
              onChange={(e) => {
                setSelectedShed(e.target.value);
                setPage(1);
              }}
              className="w-full h-7 sm:h-8 px-2 border border-slate-300 rounded-lg text-[10px] sm:text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
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
          <div className="col-span-2 lg:col-span-1">
            <label className="block text-[9px] sm:text-[10px] font-bold text-slate-600 uppercase mb-0.5 sm:mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search medicine, batch, worker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-7 sm:h-8 px-2.5 border border-slate-300 rounded-lg text-[11px] sm:text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none bg-slate-50/50"
            />
          </div>
        </div>
      </div>


      {/* ======================================================== */}
      {/* 4. THE MAIN CONSUMPTION REGISTER TABLE (15 Rows Min)     */}
      {/* ======================================================== */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden print:border-none print:shadow-none">
        {/* Table Controls (Rows per page) */}
        <div data-html2canvas-ignore="true" className="px-2.5 py-1 sm:py-2 bg-slate-50/90 border-b border-slate-200 flex justify-between items-center text-[10px] sm:text-xs print:hidden">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <span>Rows:</span>
            <select
              value={limit}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                setLimit(val);
                setPage(1);
              }}
              className="h-6 sm:h-7 px-1 sm:px-1.5 border border-slate-300 rounded bg-white text-[10px] sm:text-xs font-semibold focus:outline-none"
            >
              <option value={15}>15 rows (Default)</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value="all">All (Print Whole Month)</option>
            </select>
          </div>

          <div className="text-slate-500 font-semibold text-[10px] sm:text-[11px]">
            Page {page} of {totalPages}
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">
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
                <tr className="bg-slate-100/90 text-slate-700 uppercase tracking-wider text-[9px] sm:text-[10px] font-extrabold border-b border-slate-200 print:bg-slate-200">
                  {/* Steady Column 1: S.No */}
                  <th className="py-1.5 px-1.5 sm:py-2.5 sm:px-2 text-center w-8 sm:w-9 min-w-[32px] sm:min-w-[36px] max-w-[36px] sticky left-0 z-20 bg-slate-100 border-r border-slate-200 print:static">
                    #
                  </th>

                  {/* Steady Column 2: Medicine Name (Frozen / Steady on Horizontal Scroll) */}
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-2.5 w-28 sm:w-32 min-w-[95px] max-w-[125px] sticky left-[32px] sm:left-[36px] z-20 bg-slate-100 border-r-2 border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] print:static print:shadow-none whitespace-nowrap">
                    Medicine Name
                  </th>

                  {/* Scrolling Columns */}
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap border-r border-slate-200">Date & Time</th>
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap border-r border-slate-200">Farm</th>
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap border-r border-slate-200">Location / Shed</th>
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 text-right whitespace-nowrap border-r border-slate-200">Qty Consumed</th>
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap border-r border-slate-200">Batch No</th>
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap border-r border-slate-200">Issued By</th>
                  <th className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap">Received By</th>
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
                      className="group hover:bg-blue-50/40 transition-colors bg-white"
                    >
                      {/* Steady Column 1: S.No */}
                      <td className="py-1.5 px-1.5 sm:py-2.5 sm:px-2 text-center font-mono font-bold text-slate-400 w-8 sm:w-9 min-w-[32px] sm:min-w-[36px] max-w-[36px] sticky left-0 z-10 bg-white group-hover:bg-blue-50/60 border-r border-slate-200 print:static text-[10px] sm:text-xs">
                        {sNo}
                      </td>

                      {/* Steady Column 2: Medicine Name (Stays in place when scrolling left-right) */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-2.5 w-28 sm:w-32 min-w-[95px] max-w-[125px] sticky left-[32px] sm:left-[36px] z-10 bg-white group-hover:bg-blue-50/60 border-r-2 border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.15)] print:static print:shadow-none">
                        <div className="font-extrabold text-[11px] sm:text-xs text-slate-900 leading-tight break-words">
                          {iss.medicine?.name || 'Medicine'}
                        </div>
                        {iss.medicine?.category && (
                          <span className="text-[8px] sm:text-[9px] text-slate-400 uppercase font-bold tracking-wider block">
                            {iss.medicine.category}
                          </span>
                        )}
                      </td>

                      {/* Scrolling Column: Date & Time */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 whitespace-nowrap border-r border-slate-200">
                        <div className="font-bold text-[10px] sm:text-xs text-slate-900">{dateStr}</div>
                        <div className="text-[9px] sm:text-[10px] text-slate-400">{timeStr}</div>
                      </td>

                      {/* Scrolling Column: Farm */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 font-semibold text-slate-700 whitespace-nowrap border-r border-slate-200 text-[10px] sm:text-xs">
                        {iss.farm?.name ? (
                          <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 text-[9px] sm:text-[11px] font-bold">
                            🏢 {iss.farm.name}
                          </span>
                        ) : (
                          'Farm'
                        )}
                      </td>

                      {/* Scrolling Column: Location / Shed */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 border-r border-slate-200 whitespace-nowrap text-[10px] sm:text-xs">
                        <span className="inline-flex items-center gap-1 font-bold text-blue-900 bg-blue-50 px-1.5 sm:px-2 py-0.5 rounded print:p-0 print:bg-transparent text-[9px] sm:text-xs">
                          <span>🏠</span> {iss.shed || iss.destinationName || 'Shed'}
                        </span>
                      </td>

                      {/* Scrolling Column: Quantity Consumed */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 text-right border-r border-slate-200 whitespace-nowrap">
                        <span className="font-black text-[11px] sm:text-xs text-blue-700 print:text-black">
                          {iss.issuedQuantity}
                        </span>{' '}
                        <span className="text-[9px] sm:text-[10px] font-bold text-slate-500">
                          {iss.unit}
                        </span>
                      </td>

                      {/* Scrolling Column: Batch No */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 font-mono font-bold text-slate-600 whitespace-nowrap border-r border-slate-200 text-[10px] sm:text-xs">
                        #{iss.batchNumber}
                      </td>

                      {/* Scrolling Column: Issued By */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 font-medium text-slate-700 border-r border-slate-200 whitespace-nowrap text-[10px] sm:text-xs">
                        {iss.issuedByName || iss.issuedBy?.name || 'Store'}
                      </td>

                      {/* Scrolling Column: Received By */}
                      <td className="py-1.5 px-2 sm:py-2.5 sm:px-3 font-bold text-slate-900 whitespace-nowrap text-[10px] sm:text-xs">
                        {iss.issuedTo || 'Worker'}
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
          <div data-html2canvas-ignore="true" className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-semibold print:hidden">
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

    </div>
  );
}
