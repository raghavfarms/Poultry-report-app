import { useState, useEffect } from 'react';
import { fetchMedicines } from '../api/medicineApi.js';
import { fetchSuppliers } from '../api/supplierApi.js';
import {
  postFastInward,
  postFastOutward,
  fetchTodayActivity,
} from '../api/dailyActionApi.js';
import { fetchDashboardStats } from '../api/reportApi.js';
import MedicineBarcodeScannerModal from '../components/MedicineBarcodeScannerModal.jsx';

// Default Poultry Farm Sheds for 1-Tap Selection
const DEFAULT_SHEDS = ['Shed 1', 'Shed 2', 'Shed 3', 'Shed 4', 'Shed 5', 'Brooder', 'Layer House'];

export default function DailyMedicineActionPage({
  hideHeader = false,
  selectedFarm = '',
  firms = [],
  onActivityUpdated,
}) {
  // Master data
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Modal States
  const [isInwardModalOpen, setIsInwardModalOpen] = useState(false);
  const [isOutwardModalOpen, setIsOutwardModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Inward Form State
  const [inwardMedicineId, setInwardMedicineId] = useState('');
  const [inwardBatchNo, setInwardBatchNo] = useState('');
  const [inwardExpiry, setInwardExpiry] = useState('');
  const [inwardQty, setInwardQty] = useState('');
  const [inwardSupplierId, setInwardSupplierId] = useState('');
  const [inwardNotes, setInwardNotes] = useState('');

  // Outward Form State
  const [outwardMedicineId, setOutwardMedicineId] = useState('');
  const [outwardShed, setOutwardShed] = useState('Shed 1');
  const [customShed, setCustomShed] = useState('');
  const [outwardQty, setOutwardQty] = useState('');
  const [outwardNotes, setOutwardNotes] = useState('');

  // Load all required data
  const loadData = async () => {
    try {
      setLoading(true);
      const [medRes, supRes, feedRes, statsRes] = await Promise.all([
        fetchMedicines({ status: 'active' }),
        fetchSuppliers().catch(() => ({ suppliers: [] })),
        fetchTodayActivity().catch(() => ({ events: [] })),
        fetchDashboardStats({ farm: selectedFarm }).catch(() => null),
      ]);

      const medList = medRes.medicines || [];
      setMedicines(medList);
      setSuppliers(supRes.suppliers || []);
      setTodayEvents(feedRes.events || []);

      if (statsRes?.expiryRadar) {
        const radar = statsRes.expiryRadar;
        const allBatches = [
          ...(radar.expired || []),
          ...(radar.critical30 || []),
          ...(radar.caution60 || []),
          ...(radar.safe || []),
        ];
        const sMap = {};
        for (const b of allBatches) {
          const mName = b.medicineName;
          if (mName) {
            sMap[mName] = (sMap[mName] || 0) + (b.quantityAvailable || 0);
          }
          if (b.medicine?._id) {
            sMap[b.medicine._id] = (sMap[b.medicine._id] || 0) + (b.quantityAvailable || 0);
          }
        }
        setStockMap(sMap);
      }

      if (medList.length > 0 && !inwardMedicineId) {
        setInwardMedicineId(medList[0]._id);
        setOutwardMedicineId(medList[0]._id);
      }
    } catch (err) {
      console.error('Error loading daily action data:', err);
      setFeedback({ type: 'error', message: 'Failed to load initial farm data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedFarm]);

  const selectedInwardMed = medicines.find((m) => m._id === inwardMedicineId);
  const selectedOutwardMed = medicines.find((m) => m._id === outwardMedicineId);

  // Handlers: Scanner Detection
  const handleScannerDetected = ({ batchNumber, expiryDate, medicineName }) => {
    if (batchNumber) setInwardBatchNo(batchNumber);
    if (expiryDate) setInwardExpiry(expiryDate);

    // If OCR or QR detected medicine name, try matching with existing medicines
    if (medicineName && medicines.length > 0) {
      const cleanName = medicineName.toLowerCase().trim();
      const matched = medicines.find(
        (m) =>
          m.name.toLowerCase().includes(cleanName) ||
          cleanName.includes(m.name.toLowerCase()) ||
          (m.aliasName && m.aliasName.toLowerCase().includes(cleanName))
      );
      if (matched) {
        setInwardMedicineId(matched._id);
      }
    }

    setFeedback({
      type: 'success',
      message: `Scanned: Batch ${batchNumber || ''} ${expiryDate ? `(Exp: ${expiryDate})` : ''} ${medicineName ? `| Med: ${medicineName}` : ''}`,
    });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  // Submit: Stock In (Medicine Arrived)
  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    if (!inwardMedicineId) {
      alert('Please select a medicine');
      return;
    }
    if (!inwardBatchNo.trim()) {
      alert('Please enter or scan a batch number');
      return;
    }
    if (!inwardExpiry) {
      alert('Please select an expiry date');
      return;
    }
    if (!inwardQty || Number(inwardQty) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    try {
      setSubmitting(true);
      const res = await postFastInward({
        medicineId: inwardMedicineId,
        batchNumber: inwardBatchNo.trim().toUpperCase(),
        expiryDate: inwardExpiry,
        quantity: Number(inwardQty),
        supplierId: inwardSupplierId || null,
        farmId: selectedFarm || null,
        notes: inwardNotes,
      });

      setFeedback({ type: 'success', message: res.message || 'Stock added successfully!' });
      setIsInwardModalOpen(false);
      // Reset inward inputs
      setInwardBatchNo('');
      setInwardExpiry('');
      setInwardQty('');
      setInwardNotes('');
      // Reload feed
      loadData();
      if (onActivityUpdated) onActivityUpdated();
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    } catch (err) {
      alert(err.message || 'Failed to add stock');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit: Stock Out (Give to Birds)
  const handleOutwardSubmit = async (e) => {
    e.preventDefault();
    const finalShed = outwardShed === 'Custom' ? customShed.trim() : outwardShed;
    if (!outwardMedicineId) {
      alert('Please select a medicine');
      return;
    }
    if (!finalShed) {
      alert('Please select or specify a shed');
      return;
    }
    if (!outwardQty || Number(outwardQty) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    try {
      setSubmitting(true);
      const res = await postFastOutward({
        medicineId: outwardMedicineId,
        shedName: finalShed,
        quantity: Number(outwardQty),
        farmId: selectedFarm || null,
        notes: outwardNotes,
      });

      setFeedback({ type: 'success', message: res.message || 'Medicine issued to birds!' });
      setIsOutwardModalOpen(false);
      setOutwardQty('');
      setOutwardNotes('');
      // Reload feed
      loadData();
      if (onActivityUpdated) onActivityUpdated();
      setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
    } catch (err) {
      alert(err.message || 'Failed to issue medicine');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate today stats
  const todayInCount = todayEvents.filter((e) => e.type === 'IN').length;
  const todayOutCount = todayEvents.filter((e) => e.type === 'OUT').length;

  return (
    <div className="space-y-2.5 w-full max-w-5xl mx-auto">
      {/* 1. Header Banner (Only shown if opened as standalone page) */}
      {!hideHeader && (
        <div className="bg-white p-2.5 sm:p-3.5 rounded-xl border border-slate-200 shadow-2xs flex justify-between items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-base">⚡</span>
              <h1 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                Today's Farm Actions
              </h1>
            </div>
            <p className="text-[10px] text-slate-500">
              1-Click Stock Inward & Automatic FEFO Bird Treatment
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
          >
            <span>↻</span> Refresh
          </button>
        </div>
      )}

      {/* Notifications */}
      {feedback.message && (
        <div
          className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{feedback.type === 'success' ? '✓' : '⚠'}</span>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* 2. THE TWO ACTION BUTTONS (Sleek, Ergonomic & Responsive) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {/* Button A: Stock In */}
        <button
          type="button"
          onClick={() => setIsInwardModalOpen(true)}
          className="group p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] text-white shadow-2xs hover:shadow-xs transition flex items-center gap-2 cursor-pointer text-left"
        >
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm sm:text-base shrink-0">
            📥
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] sm:text-xs font-bold truncate">
              + Medicine In
            </div>
            <p className="text-[9px] sm:text-[10px] text-emerald-100 truncate">
              Arrived & Scan
            </p>
          </div>
          <span className="text-xs font-bold text-white/50 group-hover:translate-x-0.5 transition hidden sm:inline pr-1">
            ➔
          </span>
        </button>

        {/* Button B: Stock Out */}
        <button
          type="button"
          onClick={() => setIsOutwardModalOpen(true)}
          className="group p-2 sm:p-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] text-white shadow-2xs hover:shadow-xs transition flex items-center gap-2 cursor-pointer text-left"
        >
          <span className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-white/20 flex items-center justify-center text-sm sm:text-base shrink-0">
            💉
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] sm:text-xs font-bold truncate">
              - Give to Birds
            </div>
            <p className="text-[9px] sm:text-[10px] text-blue-100 truncate">
              Shed Out (FEFO)
            </p>
          </div>
          <span className="text-xs font-bold text-white/50 group-hover:translate-x-0.5 transition hidden sm:inline pr-1">
            ➔
          </span>
        </button>
      </div>

      {/* 3. Today's Quick Summary Bar */}
      <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs shadow-2xs">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Today:</span>
          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
            <span>📥</span> {todayInCount} In
          </span>
          <span className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
            <span>💉</span> {todayOutCount} Out
          </span>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
          title="Refresh today movements"
        >
          <span>↻</span> {loading ? '...' : 'Refresh'}
        </button>
      </div>

      {/* 4. TODAY'S LIVE ACTIVITY FEED */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">📜</span>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Today's Movement Log
            </h2>
          </div>
          <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.2 rounded-full">
            {todayEvents.length} transactions
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-slate-400">
            Loading today's activity...
          </div>
        ) : todayEvents.length === 0 ? (
          <div className="p-6 text-center text-slate-400 space-y-1">
            <p className="text-xs font-semibold text-slate-600">No movements recorded today</p>
            <p className="text-[11px]">
              Tap <strong className="text-emerald-700">+ Medicine In</strong> or{' '}
              <strong className="text-blue-700">- Give to Birds</strong> above.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayEvents.map((ev) => {
              const timeStr = new Date(ev.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={ev.id}
                  className="px-3 py-2 hover:bg-slate-50/60 transition flex items-center justify-between gap-2 text-xs"
                >
                  {/* Left: Badge & Medicine */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        ev.type === 'IN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {ev.type === 'IN' ? 'IN' : 'OUT'}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-slate-900 truncate">
                          {ev.medicineName}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          #{ev.batchNumber}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                        <span>{timeStr}</span>
                        <span>•</span>
                        <span>
                          {ev.type === 'IN' ? 'Store' : ev.target}
                        </span>
                        {ev.operator && (
                          <>
                            <span>•</span>
                            <span className="text-slate-500 font-medium truncate">By {ev.operator}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quantity */}
                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-black ${
                        ev.type === 'IN' ? 'text-emerald-700' : 'text-blue-700'
                      }`}
                    >
                      {ev.type === 'IN' ? '+' : '-'}
                      {ev.quantity} {ev.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL 1: STOCK IN (+ Medicine Arrived)                   */}
      {/* ======================================================== */}
      {isInwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-100">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">📥</span>
                <div>
                  <h3 className="text-sm font-bold">Medicine Arrived (Stock In)</h3>
                  <p className="text-[10px] text-emerald-100">Instantly active in cupboard</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsInwardModalOpen(false)}
                className="text-white/80 hover:text-white text-xl font-bold leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Inward Form */}
            <form onSubmit={handleInwardSubmit} className="p-4 space-y-3">
              {/* Medicine Select */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Medicine Name <span className="text-rose-500">*</span>
                </label>
                <select
                  value={inwardMedicineId}
                  onChange={(e) => setInwardMedicineId(e.target.value)}
                  required
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  {medicines.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.category}) — Unit: {m.unit}
                    </option>
                  ))}
                </select>
              </div>

              {/* Barcode Scanner Button */}
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Camera Scanner</span>
                  <span className="text-[10px] text-slate-500">Scan printed box / bottle label</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-2xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
                >
                  <span>📷</span> Scan Now
                </button>
              </div>

              {/* Batch Number & Expiry Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Batch Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-01"
                    value={inwardBatchNo}
                    onChange={(e) => setInwardBatchNo(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Expiry Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={inwardExpiry}
                    onChange={(e) => setInwardExpiry(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quantity Received */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Quantity Received ({selectedInwardMed?.unit || 'Units'}){' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  required
                  placeholder="e.g. 50"
                  value={inwardQty}
                  onChange={(e) => setInwardQty(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Optional Supplier */}
              {suppliers.length > 0 && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">
                    Supplier (Optional)
                  </label>
                  <select
                    value={inwardSupplierId}
                    onChange={(e) => setInwardSupplierId(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none"
                  >
                    <option value="">-- Direct Farm Purchase --</option>
                    {suppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Submit / Cancel Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsInwardModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer"
                >
                  {submitting ? 'Saving...' : '💾 Save to Cupboard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 2: STOCK OUT (- Give to Birds)                     */}
      {/* ======================================================== */}
      {isOutwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-100">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-blue-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">💉</span>
                <div>
                  <h3 className="text-sm font-bold">- Give to Birds (Stock Out)</h3>
                  <p className="text-[10px] text-blue-100">Automatic FEFO deduction</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOutwardModalOpen(false)}
                className="text-white/80 hover:text-white text-xl font-bold leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Outward Form */}
            <form onSubmit={handleOutwardSubmit} className="p-4 space-y-3">
              {/* 1-Tap Shed Selector */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Which Shed? <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DEFAULT_SHEDS.map((shed) => {
                    const isSelected = outwardShed === shed;
                    return (
                      <button
                        key={shed}
                        type="button"
                        onClick={() => setOutwardShed(shed)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {shed}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setOutwardShed('Custom')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      outwardShed === 'Custom'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Other...
                  </button>
                </div>

                {outwardShed === 'Custom' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter Shed or Location name..."
                    value={customShed}
                    onChange={(e) => setCustomShed(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs mt-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                )}
              </div>

              {/* Medicine Select */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Which Medicine? <span className="text-rose-500">*</span>
                </label>
                <select
                  value={outwardMedicineId}
                  onChange={(e) => setOutwardMedicineId(e.target.value)}
                  required
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {medicines.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </select>

                {/* Live Available Stock Badge with Low Stock Alert */}
                {(() => {
                  const availableStock = stockMap[selectedOutwardMed?._id] ?? stockMap[selectedOutwardMed?.name] ?? null;
                  const threshold = selectedOutwardMed?.reorderLevel || selectedOutwardMed?.minimumStock || 0;
                  const isLow = threshold > 0 && availableStock !== null && availableStock <= threshold;
                  return (
                    <div className={`mt-1.5 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${
                      isLow ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className={`font-medium flex items-center gap-1 ${isLow ? 'text-rose-800' : 'text-slate-500'}`}>
                        {isLow && <span>⚠️</span>}
                        Available in Cupboard:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isLow && (
                          <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            Low Stock (&lt; {threshold})
                          </span>
                        )}
                        <span className={`font-black ${isLow ? 'text-rose-700' : availableStock !== null && availableStock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {availableStock !== null ? `${availableStock} ${selectedOutwardMed?.unit || 'Units'}` : 'Checking stock...'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Quantity to Give */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Quantity Given ({selectedOutwardMed?.unit || 'Units'}){' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="any"
                  required
                  placeholder="e.g. 2"
                  value={outwardQty}
                  onChange={(e) => setOutwardQty(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 System will automatically deduct from the earliest expiring batch (FEFO).
                </p>
              </div>

              {/* Optional Reason / Notes */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">
                  Purpose / Symptoms (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Respiratory treatment, Day 14 vaccination"
                  value={outwardNotes}
                  onChange={(e) => setOutwardNotes(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOutwardModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer"
                >
                  {submitting ? 'Deducting...' : '💾 - Give to Birds'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* BARCODE / LABEL CAMERA SCANNER MODAL                     */}
      {/* ======================================================== */}
      <MedicineBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={handleScannerDetected}
        medicines={medicines}
      />
    </div>
  );
}
