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
    if (selectedFarm) {
      setFarm(selectedFarm);
    } else if (firms && firms.length > 0 && !farm) {
      setFarm(firms[0]._id);
    }
  }, [selectedFarm, firms]);

  // Load stock register data
  const loadRegister = async () => {
    try {
      setLoading(true);
      setError('');
      setSaveSuccessMsg('');
      const res = await fetchStockRegister({ farm, date });
      if (res && res.success) {
        setData(res);
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
    const rawList = data.items || [];
    const list = rawList.filter((it) => {
      const closing = Number(it.closing?.total) || 0;
      const opening = Number(it.opening?.total) || 0;
      const received = Number(it.received?.total) || 0;
      const issued = Number(it.issued?.total) || 0;
      const hasPhysical = physicalCounts[it._id] !== undefined && physicalCounts[it._id] !== '';
      return closing > 0 || opening > 0 || received > 0 || issued > 0 || hasPhysical;
    });
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      (it) =>
        (it.name && it.name.toLowerCase().includes(q)) ||
        (it.code && it.code.toLowerCase().includes(q)) ||
        (it.aliasName && it.aliasName.toLowerCase().includes(q)) ||
        (it.packagingType && it.packagingType.toLowerCase().includes(q))
    );
  }, [data.items, search, physicalCounts]);


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
        setSaveSuccessMsg(`✓ Saved audit for ${date}`);
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

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
      { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
      { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } },
      { s: { r: 0, c: 4 }, e: { r: 0, c: 6 } },
      { s: { r: 0, c: 7 }, e: { r: 0, c: 9 } },
      { s: { r: 0, c: 10 }, e: { r: 1, c: 10 } },
      { s: { r: 0, c: 11 }, e: { r: 0, c: 12 } },
      { s: { r: 0, c: 13 }, e: { r: 0, c: 15 } },
      { s: { r: 0, c: 16 }, e: { r: 0, c: 17 } },
    ];

    ws['!cols'] = [
      { wch: 22 },
      { wch: 10 },
      { wch: 9 },
      { wch: 8 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 11 },
      { wch: 12 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 11 },
      { wch: 11 },
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
    <div className="space-y-2.5">
      {/* Clean Compact Top Filter & Toolbar (Mobile Optimized Layout) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-2.5 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-2 text-xs">
        {/* Left Section (On Desktop: Date + Search | On Mobile: Row 1 = Date & Save Audit, Row 3 = Search) */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          {/* Row 1 on Mobile: Date (50%) + Save Audit (50%) */}
          <div className="grid grid-cols-2 gap-1.5 w-full sm:w-auto sm:flex sm:items-center">
            {/* Date Picker with Quick Nav */}
            <div className="flex items-center justify-between gap-0.5 bg-slate-50 border border-slate-200 rounded-lg p-1 h-9 sm:h-auto sm:py-0.5">
              <button
                type="button"
                onClick={() => shiftDate(-1)}
                className="px-1.5 py-1 sm:py-0.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 rounded transition cursor-pointer"
                title="Previous Day"
              >
                ◀
              </button>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full sm:w-auto text-[11px] sm:text-xs font-semibold px-0.5 bg-transparent text-slate-700 focus:outline-none cursor-pointer text-center"
              />
              <button
                type="button"
                onClick={() => shiftDate(1)}
                className="px-1.5 py-1 sm:py-0.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 rounded transition cursor-pointer"
                title="Next Day"
              >
                ▶
              </button>
              {/* Today Button: Desktop only */}
              <button
                type="button"
                onClick={() => setDate(new Date().toISOString().slice(0, 10))}
                className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-white border border-slate-200/80 text-emerald-700 hover:bg-emerald-50 rounded shadow-2xs transition cursor-pointer ml-1"
              >
                Today
              </button>
            </div>

            {/* Save Audit on Mobile: Half-width directly after Date */}
            <button
              type="button"
              onClick={handleSaveAudit}
              disabled={savingAudit}
              className="sm:hidden w-full h-9 inline-flex items-center justify-center gap-1 px-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-50"
              title="Save physical stock counts to database"
            >
              <span>💾</span> {savingAudit ? 'Saving...' : 'Save Audit'}
            </button>
          </div>

          {/* Row 2 on Mobile: CSV (50%) + PDF (50%) */}
          <div className="grid grid-cols-2 gap-1.5 w-full sm:hidden">
            <button
              type="button"
              onClick={handleExportExcel}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 px-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
              title="Download CSV / Excel Register"
            >
              <span>📊</span>
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="w-full h-9 inline-flex items-center justify-center gap-1.5 px-2.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
              title="Download PDF"
            >
              <span>📄</span>
              <span>PDF</span>
            </button>
          </div>

          {/* Row 3 on Mobile (In place of Save Audit): Full-Width Search Bar */}
          <div className="relative w-full sm:w-auto sm:min-w-[190px]">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs">
              🔍
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine..."
              className="w-full h-9 sm:h-auto text-xs pl-7 pr-2.5 py-1.5 sm:py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Right Action Buttons (Desktop only: Export Excel, Export PDF, Save Audit) */}
        <div className="hidden sm:flex sm:items-center gap-1.5">
          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            title="Download Excel Register"
          >
            <span>📊</span>
            <span>Export Excel</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center justify-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-300 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
            title="Download PDF"
          >
            <span>📄</span>
            <span>Export PDF</span>
          </button>
          <button
            type="button"
            onClick={handleSaveAudit}
            disabled={savingAudit}
            className="inline-flex items-center justify-center gap-1 px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer disabled:opacity-50"
            title="Save physical stock counts to database"
          >
            <span>💾</span> {savingAudit ? 'Saving...' : 'Save Audit'}
          </button>
        </div>
      </div>

      {/* Alert Banners */}
      {saveSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center justify-between">
          <span>{saveSuccessMsg}</span>
          <span className="text-[10px] text-emerald-600 uppercase font-bold">Status: Saved</span>
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-3 py-1.5 rounded-lg">
          ⚠️ {error}
        </div>
      )}

      {/* Main Stock Register Table (Clean, Compact & High Density) */}
      <div
        ref={printRef}
        className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden print:border-none print:shadow-none"
      >
        {/* Slim Header Info Strip */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <span>📑</span> Stock Register: <span className="font-mono text-emerald-700">{date}</span>
            </span>
            {data.auditStatus === 'SUBMITTED' && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                Audited
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
            <span>
              Total Meds: <strong className="text-slate-800">{filteredItems.length}</strong>
            </span>
          </div>
        </div>


        {/* Dense Table Layout with 2-Way (Horizontal & Vertical) Scrolling and Sticky Header */}
        <div className="overflow-x-auto overflow-y-auto max-h-[600px] sm:max-h-[620px] scrollbar-thin touch-pan-x touch-pan-y relative border-b border-slate-200">
          <table className="w-full text-left text-xs border-separate border-spacing-0 min-w-[450px] sm:min-w-[1100px]">
            <thead className="sticky top-0 z-20 shadow-xs">
              {/* Row 1: Group Headers matching client sheet */}
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider font-extrabold text-center select-none shadow-2xs">
                {/* Medicine Info */}
                <th colSpan="2" className="py-1.5 px-2 bg-slate-100 text-slate-700 border-r border-slate-200 text-left sm:hidden">
                  Medicine Info
                </th>
                <th colSpan="4" className="hidden sm:table-cell py-1.5 px-2 bg-slate-100 text-slate-700 border-r border-slate-200 text-left">
                  Medicine Info
                </th>

                {/* Opening */}
                <th colSpan="1" className="py-1.5 px-2 bg-blue-100 text-blue-800 border-r border-slate-200 sm:hidden">
                  Opening
                </th>
                <th colSpan="3" className="hidden sm:table-cell py-1.5 px-2 bg-blue-100 text-blue-800 border-r border-slate-200">
                  Opening
                </th>

                {/* Received */}
                <th colSpan="1" className="py-1.5 px-2 bg-emerald-100 text-emerald-800 border-r border-slate-200 sm:hidden">
                  Received
                </th>
                <th colSpan="3" className="hidden sm:table-cell py-1.5 px-2 bg-emerald-100 text-emerald-800 border-r border-slate-200">
                  Received
                </th>

                {/* Sub Total (Desktop only) */}
                <th colSpan="1" className="hidden sm:table-cell py-1.5 px-2 bg-indigo-100 text-indigo-800 border-r border-slate-200">
                  Sub Total
                </th>

                {/* Issued */}
                <th colSpan="1" className="py-1.5 px-2 bg-amber-100 text-amber-800 border-r border-slate-200 sm:hidden">
                  Issued
                </th>
                <th colSpan="2" className="hidden sm:table-cell py-1.5 px-2 bg-amber-100 text-amber-800 border-r border-slate-200">
                  Issued
                </th>

                {/* Closing / Balance */}
                <th colSpan="1" className="py-1.5 px-2 bg-teal-100 text-teal-800 border-r border-slate-200 sm:hidden">
                  Closing
                </th>
                <th colSpan="3" className="hidden sm:table-cell py-1.5 px-2 bg-teal-100 text-teal-800 border-r border-slate-200">
                  Balance
                </th>

                {/* Physical Audit */}
                <th colSpan="1" className="py-1.5 px-2 bg-purple-100 text-purple-900 sm:hidden">
                  Physical
                </th>
                <th colSpan="2" className="hidden sm:table-cell py-1.5 px-2 bg-purple-100 text-purple-900">
                  Physical Audit ⭐
                </th>
              </tr>

              {/* Row 2: Sub-column headers */}
              <tr className="border-b border-slate-200 text-[10px] font-bold text-slate-600 bg-slate-50 text-center whitespace-nowrap shadow-xs">
                {/* Medicine Info */}
                <th className="sticky left-0 z-30 py-1.5 px-2 text-left border-r border-slate-200 min-w-[125px] sm:min-w-[150px] bg-slate-50 shadow-[1px_0_0_0_#e2e8f0]">Name of Medicine</th>
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px]">Packing</th>
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[60px]">Pack Size</th>
                <th className="py-1.5 px-1.5 border-r border-slate-200 min-w-[45px] sm:min-w-[50px]">Unit</th>

                {/* Opening */}
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] bg-blue-50/50">No of Packs</th>
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] bg-blue-50/50">Loose Qty</th>
                <th className="py-1.5 px-1.5 border-r border-slate-200 min-w-[58px] sm:min-w-[70px] bg-blue-100 font-black text-blue-900">
                  <span className="sm:hidden">Opening</span>
                  <span className="hidden sm:inline">Opg Qty</span>
                </th>

                {/* Received */}
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] bg-emerald-50/50">No of Packs</th>
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] bg-emerald-50/50">Loose Qty</th>
                <th className="py-1.5 px-1.5 border-r border-slate-200 min-w-[58px] sm:min-w-[70px] bg-emerald-100 font-black text-emerald-900">
                  <span className="sm:hidden">Received</span>
                  <span className="hidden sm:inline">Recd Qty</span>
                </th>

                {/* Sub Total (Desktop only) */}
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[75px] bg-indigo-100 font-black text-indigo-900">
                  Total Qty
                </th>

                {/* Issued */}
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[90px] bg-amber-50/50">Shed No</th>
                <th className="py-1.5 px-1.5 border-r border-slate-200 min-w-[50px] sm:min-w-[70px] bg-amber-100 font-black text-amber-900">
                  <span className="sm:hidden">Issued</span>
                  <span className="hidden sm:inline">Qty</span>
                </th>

                {/* Balance / Closing */}
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] bg-teal-50/50">No of Packs</th>
                <th className="hidden sm:table-cell py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] bg-teal-50/50">Loose Qty</th>
                <th className="py-1.5 px-1.5 border-r border-slate-200 min-w-[58px] sm:min-w-[70px] bg-teal-100 font-black text-teal-900">
                  <span className="sm:hidden">Closing</span>
                  <span className="hidden sm:inline">Clg Qty</span>
                </th>

                {/* Physical Audit */}
                <th className="py-1.5 px-1.5 border-r border-slate-200 min-w-[65px] sm:min-w-[80px] bg-purple-50 font-black text-purple-900">
                  Physical
                </th>
                <th className="hidden sm:table-cell py-1.5 px-2 min-w-[90px] bg-purple-50 font-black text-purple-900">
                  Difference
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="18" className="py-8 text-center text-slate-400">
                    <span className="inline-block animate-spin mr-1">⏳</span> Loading stock register data...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="18" className="py-8 text-center text-slate-400">
                    No medicine records found.
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
                      className={`hover:bg-slate-50/80 transition text-center text-[11px] ${
                        idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                      }`}
                    >
                      {/* Name of Medicine (Sticky on Left for Horizontal Scrolling) */}
                      <td className={`sticky left-0 z-10 py-1.5 px-2 text-left border-r border-slate-200 font-bold text-slate-800 shadow-[1px_0_0_0_#e2e8f0] ${idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}`}>
                        <div className="flex flex-col leading-tight">
                          <span>{it.name}</span>
                          {it.code && <span className="text-[9px] text-slate-400 font-normal">{it.code}</span>}
                        </div>
                      </td>

                      {/* Packing */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-600">
                        <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] font-semibold text-slate-700">
                          {it.packagingType || 'Bottle'}
                        </span>
                      </td>

                      {/* Pack Size */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-600 font-medium font-mono">
                        {it.packSize || 1}
                      </td>

                      {/* Unit */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-600 font-medium">
                        {formatUnit(it.unit) || '-'}
                      </td>

                      {/* Opening */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-700 bg-blue-50/20 font-mono">
                        {it.opening?.packs ?? 0}
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-700 bg-blue-50/20 font-mono">
                        {it.opening?.loose ?? 0}
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 font-bold text-blue-900 bg-blue-50/40 font-mono">
                        {it.opening?.total ?? 0}
                      </td>

                      {/* Received */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-700 bg-emerald-50/20 font-mono">
                        {it.received?.packs ?? 0}
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-700 bg-emerald-50/20 font-mono">
                        {it.received?.loose ?? 0}
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 font-bold text-emerald-900 bg-emerald-50/40 font-mono">
                        {it.received?.total ?? 0}
                      </td>

                      {/* Sub Total */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 font-extrabold text-indigo-900 bg-indigo-50/40 font-mono">
                        {it.subTotal?.total ?? 0}
                      </td>

                      {/* Issued */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-600 bg-amber-50/20 text-[10px]">
                        <span className="truncate max-w-[100px] inline-block font-medium" title={it.issued?.shedNo}>
                          {it.issued?.shedNo || '-'}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 font-bold text-amber-900 bg-amber-50/40 font-mono">
                        {it.issued?.total ?? 0}
                      </td>

                      {/* Balance */}
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-700 bg-teal-50/20 font-mono">
                        {it.closing?.packs ?? 0}
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 text-slate-700 bg-teal-50/20 font-mono">
                        {it.closing?.loose ?? 0}
                      </td>
                      <td className="py-1.5 px-1.5 border-r border-slate-100 font-extrabold text-teal-900 bg-teal-50/40 font-mono">
                        {it.closing?.total ?? 0}
                      </td>

                      {/* Physical Audit (Input) */}
                      <td className="py-1 px-1.5 border-r border-slate-100 bg-purple-50/30">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={physicalVal !== undefined ? physicalVal : ''}
                          onChange={(e) => handlePhysicalChange(it._id, e.target.value)}
                          placeholder={String(it.closing?.total ?? 0)}
                          className="w-16 h-6 text-center font-bold text-purple-900 px-1 py-0.5 bg-white border border-purple-200 rounded shadow-2xs focus:outline-none focus:ring-1 focus:ring-purple-400 font-mono text-xs"
                        />
                      </td>

                      {/* Difference */}
                      <td className="py-1 px-1.5 bg-purple-50/30 font-mono text-xs">
                        {diff === null ? (
                          <span className="text-slate-400">-</span>
                        ) : Math.abs(diff) < 0.001 ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            ✓ Exact
                          </span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                            ⚠️ {diff}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                            ⚠️ +{diff}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>


      </div>
    </div>
  );
}
