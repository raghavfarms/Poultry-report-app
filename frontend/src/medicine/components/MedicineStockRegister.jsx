import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { exportReportToPdf } from '../../utils/exportPdf.js';
import { fetchStockRegister, saveStockAuditApi } from '../api/reportApi.js';
function formatUnit(unit = '') {
  if (!unit) return '';
  const trimmed = String(unit).trim();
  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'millilitre' || lower === 'milliliter' || lower === 'ml') return 'ml';
  if (lower === 'litre' || lower === 'liter' || lower === 'l') return 'L';
  if (lower === 'kilogram' || lower === 'kg') return 'Kg';
  if (lower === 'gram' || lower === 'gm' || lower === 'g') return 'g';
  if (lower === 'milligram' || lower === 'mg') return 'mg';
  return trimmed;
}

export default function MedicineStockRegister({ selectedFarm, firms = [] }) {
  const [farm, setFarm] = useState(selectedFarm || '');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ items: [], auditStatus: 'NOT_AUDITED' });
  const [physicalCounts, setPhysicalCounts] = useState({});
  const [savingAudit, setSavingAudit] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const printRef = useRef(null);

  // Sync selectedFarm prop if changed from parent
  useEffect(() => {
    if (selectedFarm !== undefined) {
      setFarm(selectedFarm || '');
    }
  }, [selectedFarm]);

  // Load stock register data
  const loadRegister = async () => {
    try {
      setLoading(true);
      setError('');
      setSaveSuccessMsg('');
      const res = await fetchStockRegister({ farm, date });
      if (res && res.success) {
        setData(res);
        // Initialize physical counts from saved audit items
        const initialCounts = {};
        for (const item of res.items || []) {
          if (item.physical !== null && item.physical !== undefined) {
            initialCounts[item._id] = item.physical;
          }
        }
        setPhysicalCounts(initialCounts);
      } else {
        setError(res?.message || 'Failed to fetch stock register');
      }
    } catch (err) {
      setError(err?.message || 'Error loading stock register');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRegister();
  }, [farm, date]);

  // Handle physical count change
  const handlePhysicalChange = (medicineId, val) => {
    setPhysicalCounts((prev) => ({
      ...prev,
      [medicineId]: val === '' ? '' : Number(val),
    }));
  };

  // Filter items by search
  const filteredItems = useMemo(() => {
    const list = data.items || [];
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (it) =>
        (it.name && it.name.toLowerCase().includes(q)) ||
        (it.code && it.code.toLowerCase().includes(q)) ||
        (it.aliasName && it.aliasName.toLowerCase().includes(q)) ||
        (it.packagingType && it.packagingType.toLowerCase().includes(q))
    );
  }, [data.items, search]);

  // Calculate summary metrics
  const summary = useMemo(() => {
    let totalOpening = 0;
    let totalReceived = 0;
    let totalIssued = 0;
    let totalClosing = 0;
    let varianceCount = 0;

    for (const it of filteredItems) {
      totalOpening += it.opening?.total || 0;
      totalReceived += it.received?.total || 0;
      totalIssued += it.issued?.total || 0;
      totalClosing += it.closing?.total || 0;

      const physicalVal = physicalCounts[it._id];
      if (physicalVal !== undefined && physicalVal !== '') {
        const diff = Number(physicalVal) - (it.closing?.total || 0);
        if (Math.abs(diff) > 0.001) {
          varianceCount += 1;
        }
      }
    }

    return {
      totalMedicines: filteredItems.length,
      totalOpening: Number(totalOpening.toFixed(2)),
      totalReceived: Number(totalReceived.toFixed(2)),
      totalIssued: Number(totalIssued.toFixed(2)),
      totalClosing: Number(totalClosing.toFixed(2)),
      varianceCount,
    };
  }, [filteredItems, physicalCounts]);

  // Save audit counts to backend
  const handleSaveAudit = async () => {
    try {
      setSavingAudit(true);
      setError('');
      setSaveSuccessMsg('');

      const auditItems = (data.items || []).map((it) => {
        const pVal = physicalCounts[it._id];
        const hasPhys = pVal !== undefined && pVal !== '';
        const physical = hasPhys ? Number(pVal) : null;
        const diff = hasPhys ? Number((physical - (it.closing?.total || 0)).toFixed(3)) : 0;
        return {
          medicine: it._id,
          name: it.name,
          packSize: it.packSize,
          unit: it.unit,
          openingQuantity: it.opening?.total || 0,
          receivedQuantity: it.received?.total || 0,
          issuedQuantity: it.issued?.total || 0,
          closingQuantity: it.closing?.total || 0,
          physicalQuantity: physical !== null ? physical : it.closing?.total || 0,
          difference: diff,
        };
      });

      const res = await saveStockAuditApi({
        farm,
        date,
        items: auditItems,
      });

      if (res && res.success) {
        setSaveSuccessMsg(`✓ Stock audit saved for ${date} successfully!`);
        setData((prev) => ({ ...prev, auditStatus: 'SUBMITTED' }));
        setTimeout(() => setSaveSuccessMsg(''), 4000);
      } else {
        setError(res?.message || 'Failed to save stock audit');
      }
    } catch (err) {
      setError(err?.message || 'Error saving stock audit');
    } finally {
      setSavingAudit(false);
    }
  };

  // Quick date jump
  const shiftDate = (deltaDays) => {
    const current = new Date(date);
    current.setDate(current.getDate() + deltaDays);
    setDate(current.toISOString().slice(0, 10));
  };

  // Export to Excel mirroring client's sheet layout
  const handleExportExcel = () => {
    const headerRow1 = [
      'Name of Medicine',
      'Packing',
      'Pack Size',
      'Unit',
      'Opening',
      '',
      '',
      'Received',
      '',
      '',
      'Sub Total',
      'Issued',
      '',
      'Balance',
      '',
      '',
      'Physical Audit',
      '',
    ];

    const headerRow2 = [
      '',
      '',
      '',
      '',
      'No of Packs',
      'Loose Qty',
      'Opg Qty',
      'No of Packs',
      'Loose Qty',
      'Recd Qty',
      'Total Qty',
      'Shed No',
      'Qty',
      'No of Packs',
      'Loose Qty',
      'Clg Qty',
      'Physical',
      'Difference',
    ];

    const dataRows = filteredItems.map((it) => {
      const pVal = physicalCounts[it._id];
      const hasPhys = pVal !== undefined && pVal !== '';
      const diff = hasPhys ? Number((Number(pVal) - (it.closing?.total || 0)).toFixed(3)) : '';

      return [
        it.name || '',
        it.packagingType || 'Bottle',
        it.packSize || 1,
        formatUnit(it.unit) || '',
        it.opening?.packs ?? 0,
        it.opening?.loose ?? 0,
        it.opening?.total ?? 0,
        it.received?.packs ?? 0,
        it.received?.loose ?? 0,
        it.received?.total ?? 0,
        it.subTotal?.total ?? 0,
        it.issued?.shedNo || '-',
        it.issued?.total ?? 0,
        it.closing?.packs ?? 0,
        it.closing?.loose ?? 0,
        it.closing?.total ?? 0,
        hasPhys ? Number(pVal) : '',
        diff,
      ];
    });

    // Summary Totals Row
    const totalsRow = [
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      summary.totalOpening,
      '',
      '',
      summary.totalReceived,
      summary.totalOpening + summary.totalReceived,
      '',
      summary.totalIssued,
      '',
      '',
      summary.totalClosing,
      '',
      '',
    ];

    const wsData = [headerRow1, headerRow2, ...dataRows, totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Merge group header cells:
    // Opening: col 4 to 6 (E to G)
    // Received: col 7 to 9 (H to J)
    // Issued: col 11 to 12 (L to M)
    // Balance: col 13 to 15 (N to P)
    // Physical Audit: col 16 to 17 (Q to R)
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, // Name
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, // Packing
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } }, // Pack Size
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, // Unit
      { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } }, // Opening
      { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } }, // Received
      { s: { r: 0, c: 10 }, e: { r: 1, c: 10 } }, // Sub Total
      { s: { r: 0, c: 11 }, e: { r: 0, c: 12 } }, // Issued
      { s: { r: 0, c: 13 }, e: { r: 0, c: 15 } }, // Balance
      { s: { r: 0, c: 16 }, e: { r: 0, c: 17 } }, // Physical Audit
    ];

    // Auto-fit column widths
    ws['!cols'] = [
      { wch: 24 }, // Name
      { wch: 10 }, // Packing
      { wch: 10 }, // Pack Size
      { wch: 8 },  // Unit
      { wch: 11 }, // Opg Packs
      { wch: 11 }, // Opg Loose
      { wch: 11 }, // Opg Qty
      { wch: 11 }, // Recd Packs
      { wch: 11 }, // Recd Loose
      { wch: 11 }, // Recd Qty
      { wch: 12 }, // Total Qty
      { wch: 14 }, // Shed No
      { wch: 10 }, // Issued Qty
      { wch: 11 }, // Clg Packs
      { wch: 11 }, // Clg Loose
      { wch: 11 }, // Clg Qty
      { wch: 12 }, // Physical
      { wch: 12 }, // Difference
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stock Register');
    XLSX.writeFile(wb, `Medicine_Stock_Register_${date}.xlsx`);
  };

  // Export to PDF
  const handleExportPdf = async () => {
    if (!printRef.current) return;
    try {
      await exportReportToPdf(printRef.current, {
        filename: `Medicine_Stock_Register_${date}.pdf`,
        orientation: 'landscape',
      });
    } catch (err) {
      console.error('PDF export failed:', err);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter & Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Farm selector */}
          {firms && firms.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Farm:</label>
              <select
                value={farm}
                onChange={(e) => setFarm(e.target.value)}
                className="text-xs font-semibold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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

          {/* Date Picker with Quick Nav */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => shiftDate(-1)}
              className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 rounded transition"
              title="Previous Day"
            >
              ◀
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs font-semibold px-2 py-1 bg-transparent text-slate-700 focus:outline-none cursor-pointer"
            />
            <button
              type="button"
              onClick={() => shiftDate(1)}
              className="px-2 py-1 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 rounded transition"
              title="Next Day"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => setDate(new Date().toISOString().slice(0, 10))}
              className="px-2 py-1 text-2xs font-bold uppercase tracking-wider bg-white border border-slate-200/80 text-emerald-700 hover:bg-emerald-50 rounded shadow-2xs transition"
            >
              Today
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine, packing..."
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100/80 border border-emerald-200/80 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            title="Download formatted Excel Register"
          >
            <span>📊</span> Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100/80 border border-rose-200/80 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            title="Print or Download PDF"
          >
            <span>📄</span> Export PDF
          </button>
          <button
            type="button"
            onClick={handleSaveAudit}
            disabled={savingAudit}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Save physical stock counts to database"
          >
            <span>💾</span> {savingAudit ? 'Saving...' : 'Save Audit'}
          </button>
        </div>
      </div>

      {/* Alert / Notification banners */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>{saveSuccessMsg}</span>
          <span className="text-2xs text-emerald-600 uppercase font-bold tracking-wider">Status: Saved</span>
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-4 py-2.5 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs">
          <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Medicines</p>
          <p className="text-lg font-black text-slate-800 mt-0.5">{summary.totalMedicines}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50/30 to-white shadow-2xs">
          <p className="text-2xs font-bold text-blue-600 uppercase tracking-wider">Total Opening</p>
          <p className="text-lg font-black text-blue-900 mt-0.5">{summary.totalOpening}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/30 to-white shadow-2xs">
          <p className="text-2xs font-bold text-emerald-600 uppercase tracking-wider">Total Received</p>
          <p className="text-lg font-black text-emerald-900 mt-0.5">+{summary.totalReceived}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-amber-200/70 bg-gradient-to-br from-amber-50/30 to-white shadow-2xs">
          <p className="text-2xs font-bold text-amber-600 uppercase tracking-wider">Total Issued</p>
          <p className="text-lg font-black text-amber-900 mt-0.5">-{summary.totalIssued}</p>
        </div>
        <div className="bg-white p-3 rounded-xl border border-teal-200/70 bg-gradient-to-br from-teal-50/30 to-white shadow-2xs">
          <p className="text-2xs font-bold text-teal-600 uppercase tracking-wider">Closing Balance</p>
          <p className="text-lg font-black text-teal-900 mt-0.5">{summary.totalClosing}</p>
        </div>
        <div
          className={`p-3 rounded-xl border shadow-2xs ${
            summary.varianceCount > 0
              ? 'bg-rose-50/60 border-rose-200 text-rose-900'
              : 'bg-emerald-50/40 border-emerald-200 text-emerald-900'
          }`}
        >
          <p className="text-2xs font-bold uppercase tracking-wider opacity-80">Physical Variance</p>
          <p className="text-lg font-black mt-0.5">
            {summary.varianceCount > 0 ? `⚠️ ${summary.varianceCount} items` : '✓ 0 (All Exact)'}
          </p>
        </div>
      </div>

      {/* Main Stock Register Table (Print/Export Container) */}
      <div
        ref={printRef}
        className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none"
      >
        {/* Printable Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <span>📑</span> Medicine Stock Register
              {data.auditStatus === 'SUBMITTED' && (
                <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Audited
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Date: <span className="font-semibold text-slate-700">{date}</span>
              {data.auditedByName && (
                <>
                  {' '}
                  • Last audited by: <span className="font-semibold text-slate-700">{data.auditedByName}</span>
                </>
              )}
            </p>
          </div>
          <span className="text-xs text-slate-400">
            Showing {filteredItems.length} of {data.items?.length || 0} active medicines
          </span>
        </div>

        {/* Scrollable Table Area */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              {/* Row 1: Group Headers matching client sheet */}
              <tr className="border-b border-slate-200 text-2xs uppercase tracking-wider font-extrabold text-center select-none">
                <th colSpan="4" className="py-2.5 px-3 bg-slate-100/90 text-slate-700 border-r border-slate-200 text-left">
                  Medicine Info
                </th>
                <th colSpan="3" className="py-2.5 px-3 bg-blue-100/70 text-blue-800 border-r border-slate-200">
                  Opening
                </th>
                <th colSpan="3" className="py-2.5 px-3 bg-emerald-100/70 text-emerald-800 border-r border-slate-200">
                  Received
                </th>
                <th colSpan="1" className="py-2.5 px-3 bg-indigo-100/70 text-indigo-800 border-r border-slate-200">
                  Sub Total
                </th>
                <th colSpan="2" className="py-2.5 px-3 bg-amber-100/70 text-amber-800 border-r border-slate-200">
                  Issued
                </th>
                <th colSpan="3" className="py-2.5 px-3 bg-teal-100/70 text-teal-800 border-r border-slate-200">
                  Balance
                </th>
                <th colSpan="2" className="py-2.5 px-3 bg-purple-100/70 text-purple-900">
                  Physical Audit ⭐
                </th>
              </tr>

              {/* Row 2: Sub-column headers */}
              <tr className="border-b border-slate-200 text-2xs font-bold text-slate-600 bg-slate-50 text-center whitespace-nowrap">
                {/* Medicine Info */}
                <th className="py-2 px-3 text-left border-r border-slate-200 min-w-[170px]">Name of Medicine</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[70px]">Packing</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[70px]">Pack Size</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[60px]">Unit</th>

                {/* Opening */}
                <th className="py-2 px-2 border-r border-slate-200 min-w-[75px] bg-blue-50/50">No of Packs</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[75px] bg-blue-50/50">Loose Qty</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[80px] bg-blue-100/40 font-black text-blue-900">
                  Opg Qty
                </th>

                {/* Received */}
                <th className="py-2 px-2 border-r border-slate-200 min-w-[75px] bg-emerald-50/50">No of Packs</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[75px] bg-emerald-50/50">Loose Qty</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[80px] bg-emerald-100/40 font-black text-emerald-900">
                  Recd Qty
                </th>

                {/* Sub Total */}
                <th className="py-2 px-2 border-r border-slate-200 min-w-[85px] bg-indigo-100/50 font-black text-indigo-900">
                  Total Qty
                </th>

                {/* Issued */}
                <th className="py-2 px-2 border-r border-slate-200 min-w-[100px] bg-amber-50/50">Shed No</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[80px] bg-amber-100/40 font-black text-amber-900">
                  Qty
                </th>

                {/* Balance */}
                <th className="py-2 px-2 border-r border-slate-200 min-w-[75px] bg-teal-50/50">No of Packs</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[75px] bg-teal-50/50">Loose Qty</th>
                <th className="py-2 px-2 border-r border-slate-200 min-w-[80px] bg-teal-100/50 font-black text-teal-900">
                  Clg Qty
                </th>

                {/* Physical Audit */}
                <th className="py-2 px-3 border-r border-slate-200 min-w-[95px] bg-purple-50 font-black text-purple-900">
                  Physical
                </th>
                <th className="py-2 px-3 min-w-[100px] bg-purple-50 font-black text-purple-900">
                  Difference
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="18" className="py-12 text-center text-slate-400">
                    <span className="inline-block animate-spin mr-2">⏳</span> Loading stock register data...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="18" className="py-12 text-center text-slate-400">
                    No medicine records found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredItems.map((it, idx) => {
                  const physicalVal = physicalCounts[it._id];
                  const hasPhysical = physicalVal !== undefined && physicalVal !== '';
                  const diff = hasPhysical ? Number((Number(physicalVal) - (it.closing?.total || 0)).toFixed(3)) : null;

                  return (
                    <tr
                      key={it._id}
                      className={`hover:bg-slate-50/80 transition text-center ${
                        idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                      }`}
                    >
                      {/* Name of Medicine */}
                      <td className="py-2.5 px-3 text-left border-r border-slate-100 font-bold text-slate-800">
                        <div className="flex flex-col">
                          <span>{it.name}</span>
                          {it.code && <span className="text-3xs text-slate-400 font-normal">{it.code}</span>}
                        </div>
                      </td>

                      {/* Packing */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-600">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-2xs font-semibold text-slate-700">
                          {it.packagingType || 'Bottle'}
                        </span>
                      </td>

                      {/* Pack Size */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-600 font-medium">
                        {it.packSize || 1}
                      </td>

                      {/* Unit */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-600 font-medium">
                        {formatUnit(it.unit) || '-'}
                      </td>

                      {/* Opening */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-700 bg-blue-50/20 font-mono">
                        {it.opening?.packs ?? 0}
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-700 bg-blue-50/20 font-mono">
                        {it.opening?.loose ?? 0}
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 font-bold text-blue-900 bg-blue-50/40 font-mono">
                        {it.opening?.total ?? 0}
                      </td>

                      {/* Received */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-700 bg-emerald-50/20 font-mono">
                        {it.received?.packs ?? 0}
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-700 bg-emerald-50/20 font-mono">
                        {it.received?.loose ?? 0}
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 font-bold text-emerald-900 bg-emerald-50/40 font-mono">
                        {it.received?.total ?? 0}
                      </td>

                      {/* Sub Total */}
                      <td className="py-2.5 px-2 border-r border-slate-100 font-extrabold text-indigo-900 bg-indigo-50/40 font-mono">
                        {it.subTotal?.total ?? 0}
                      </td>

                      {/* Issued */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-600 bg-amber-50/20 text-xs">
                        <span className="truncate max-w-[120px] inline-block font-medium" title={it.issued?.shedNo}>
                          {it.issued?.shedNo || '-'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 font-bold text-amber-900 bg-amber-50/40 font-mono">
                        {it.issued?.total ?? 0}
                      </td>

                      {/* Balance */}
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-700 bg-teal-50/20 font-mono">
                        {it.closing?.packs ?? 0}
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 text-slate-700 bg-teal-50/20 font-mono">
                        {it.closing?.loose ?? 0}
                      </td>
                      <td className="py-2.5 px-2 border-r border-slate-100 font-extrabold text-teal-900 bg-teal-50/40 font-mono">
                        {it.closing?.total ?? 0}
                      </td>

                      {/* Physical Audit (Column 1: User Count Input) */}
                      <td className="py-2 px-2 border-r border-slate-100 bg-purple-50/30">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={physicalVal !== undefined ? physicalVal : ''}
                          onChange={(e) => handlePhysicalChange(it._id, e.target.value)}
                          placeholder={String(it.closing?.total ?? 0)}
                          className="w-20 text-center font-bold text-purple-900 px-2 py-1 bg-white border border-purple-200 rounded-lg shadow-2xs focus:outline-none focus:ring-2 focus:ring-purple-400 font-mono text-xs"
                        />
                      </td>

                      {/* Difference (Column 2: Auto-calculated difference badge) */}
                      <td className="py-2 px-2 bg-purple-50/30 font-mono text-xs">
                        {diff === null ? (
                          <span className="text-slate-400">-</span>
                        ) : Math.abs(diff) < 0.001 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Exact
                          </span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                            ⚠️ {diff} (Short)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                            ⚠️ +{diff} (Excess)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Totals Footer Row */}
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100 text-slate-800 font-extrabold text-center text-xs">
                  <td colSpan="4" className="py-2.5 px-3 text-left border-r border-slate-200 uppercase tracking-wider">
                    Total
                  </td>
                  <td colSpan="2" className="py-2.5 px-2 border-r border-slate-200 bg-blue-50/50"></td>
                  <td className="py-2.5 px-2 border-r border-slate-200 font-black text-blue-900 bg-blue-100/60 font-mono">
                    {summary.totalOpening}
                  </td>
                  <td colSpan="2" className="py-2.5 px-2 border-r border-slate-200 bg-emerald-50/50"></td>
                  <td className="py-2.5 px-2 border-r border-slate-200 font-black text-emerald-900 bg-emerald-100/60 font-mono">
                    {summary.totalReceived}
                  </td>
                  <td className="py-2.5 px-2 border-r border-slate-200 font-black text-indigo-900 bg-indigo-100/60 font-mono">
                    {summary.totalOpening + summary.totalReceived}
                  </td>
                  <td className="py-2.5 px-2 border-r border-slate-200 bg-amber-50/50"></td>
                  <td className="py-2.5 px-2 border-r border-slate-200 font-black text-amber-900 bg-amber-100/60 font-mono">
                    {summary.totalIssued}
                  </td>
                  <td colSpan="2" className="py-2.5 px-2 border-r border-slate-200 bg-teal-50/50"></td>
                  <td className="py-2.5 px-2 border-r border-slate-200 font-black text-teal-900 bg-teal-100/60 font-mono">
                    {summary.totalClosing}
                  </td>
                  <td colSpan="2" className="py-2.5 px-2 bg-purple-100/60 text-purple-900 text-2xs font-bold">
                    {summary.varianceCount > 0 ? `${summary.varianceCount} items diff` : 'All Matched'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
