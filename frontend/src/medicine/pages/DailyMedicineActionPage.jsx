import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { fetchMedicines } from '../api/medicineApi.js';
import { fetchSuppliers } from '../api/supplierApi.js';
import {
  postFastInward,
  postFastOutward,
  fetchTodayActivity,
  fetchMedicineLocations,
  createMedicineLocation,
  removeMedicineLocation,
} from '../api/dailyActionApi.js';
import { fetchDashboardStats } from '../api/reportApi.js';
import MedicineBarcodeScannerModal from '../components/MedicineBarcodeScannerModal.jsx';


export default function DailyMedicineActionPage({
  hideHeader = false,
  selectedFarm = '',
  firms = [],
  onActivityUpdated,
}) {
  const { user } = useAuth();
  const canManageLocations = ['admin', 'developer'].includes(user?.role);
  const [locations, setLocations] = useState([]);
  const [locationError, setLocationError] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);
  const [removingLocation, setRemovingLocation] = useState('');

  const handleRemoveLocation = async (name) => {
    if (removingLocation) return;
    setRemovingLocation(name);
    try {
      await removeMedicineLocation(name);
      setLocations((current) => current.filter((location) => location !== name));
      setOutwardShed((current) => current === name ? '' : current);
      setLocationError('');
    } catch (error) {
      setLocationError(error.message || 'Failed to remove location.');
    } finally {
      setRemovingLocation('');
    }
  };

  const loadLocations = async () => {
    try {
      const result = await fetchMedicineLocations();
      setLocations(result.locations || []);
      setLocationError('');
    } catch (error) {
      setLocationError('Could not load locations. Use Other to enter a location.');
    }
  };

  useEffect(() => { loadLocations(); }, []);

  const handleAddLocation = async () => {
    if (!newLocation.trim() || addingLocation) return;
    setAddingLocation(true);
    try {
      const result = await createMedicineLocation(newLocation);
      setLocations((current) => [...new Set([...current, result.location])]);
      setOutwardShed(result.location);
      setNewLocation('');
      setLocationError('');
    } catch (error) {
      setLocationError(error.message || 'Failed to add location.');
    } finally {
      setAddingLocation(false);
    }
  };
  // Master data
  const [medicines, setMedicines] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [stockMap, setStockMap] = useState(null);
  const [availableBatches, setAvailableBatches] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', message: '' });

  // Modal States
  const [isInwardModalOpen, setIsInwardModalOpen] = useState(false);
  const [isOutwardModalOpen, setIsOutwardModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Inward Form State
  const [inwardMedicineId, setInwardMedicineId] = useState('');
  const [inwardMedicineName, setInwardMedicineName] = useState('');
  const [inwardCategory, setInwardCategory] = useState('');
  const [inwardUnit, setInwardUnit] = useState('');
  const categories = [...new Set(['Feed Medicine', 'Vaccine', 'General', 'Antibiotics', 'Vitamins & Minerals', ...medicines.map((m) => m.category).filter(Boolean)])];
  const units = [...new Set(['Bottle', 'Litre (L)', 'Millilitre (ml)', 'Kilogram (Kg)', 'Gram (g)', 'Vial', 'Packet', 'Tablet', ...medicines.map((m) => m.unit).filter(Boolean)])];
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);
  const [inwardBatchNo, setInwardBatchNo] = useState('');
  const [inwardExpiry, setInwardExpiry] = useState('');
  const [inwardQty, setInwardQty] = useState('');
  const [inwardSupplierId, setInwardSupplierId] = useState('');
  const [inwardNotes, setInwardNotes] = useState('');
  const [inwardReceiver, setInwardReceiver] = useState('');

  // Outward Form State
  const [outwardMedicineId, setOutwardMedicineId] = useState('');
  const [outwardMedicineName, setOutwardMedicineName] = useState('');
  const [isOutwardMedDropdownOpen, setIsOutwardMedDropdownOpen] = useState(false);
  const [outwardShed, setOutwardShed] = useState('');
  const [customShed, setCustomShed] = useState('');
  const [outwardQty, setOutwardQty] = useState('');
  const [outwardReceiver, setOutwardReceiver] = useState('');

  // Load all required data
  const loadData = async () => {
    try {
      setLoading(true);
      setStockMap(null);

      const [medRes, supRes, feedRes, statsRes] = await Promise.all([
        fetchMedicines({ status: 'active' }),
        fetchSuppliers().catch(() => ({ suppliers: [] })),
        fetchTodayActivity().catch(() => ({ events: [] })),
        fetchDashboardStats({ farm: selectedFarm }).catch(() => null),
      ]);

      const medList = medRes.medicines || [];
      setMedicines(medList);
      setSuppliers((supRes.suppliers || []).filter((s) => !/apex/i.test(s.name)));
      setTodayEvents(feedRes.events || []);

      if (statsRes?.expiryRadar) {
        const radar = statsRes.expiryRadar;
        const allBatches = [
          ...(radar.expired || []),
          ...(radar.critical30 || []),
          ...(radar.caution60 || []),
          ...(radar.safe || []),
        ];
        setAvailableBatches(allBatches);

        const sMap = {};
        for (const b of allBatches) {
          if (b.canIssue && b.medicineId) {
            sMap[b.medicineId] = (sMap[b.medicineId] || 0) + (b.quantityAvailable || 0);
          }
        }
        setStockMap(sMap);
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
  const issuableMedicines = medicines.filter((medicine) => (stockMap?.[medicine._id] || 0) > 0);

  // Determine the oldest active batch for the selected medicine (FEFO pick target)
  const oldestBatchForOutward = useMemo(() => {
    if (!outwardMedicineId || !availableBatches.length) return null;
    const candidates = availableBatches
      .filter((b) => b.medicineId === outwardMedicineId && b.canIssue && (b.quantityAvailable || 0) > 0)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    return candidates[0] || null;
  }, [outwardMedicineId, availableBatches]);

  // Compute suppliers authorized for the selected inward medicine
  // (e.g. if 3 assigned -> show 3, if 1 -> show 1; fallback to all clean if none assigned)
  const medSuppliers = useMemo(() => {
    const cleanSuppliers = suppliers.filter((s) => !/apex/i.test(s.name));
    if (!selectedInwardMed?.suppliers || selectedInwardMed.suppliers.length === 0) {
      return cleanSuppliers;
    }
    const medSupIds = selectedInwardMed.suppliers.map((s) => (s._id || s).toString());
    const filtered = cleanSuppliers.filter((s) => medSupIds.includes(s._id.toString()));
    return filtered.length > 0 ? filtered : cleanSuppliers;
  }, [selectedInwardMed, suppliers]);

  // Clear inwardSupplierId if it is not among the authorized suppliers for this medicine
  useEffect(() => {
    if (inwardSupplierId) {
      const isValid = medSuppliers.some((s) => s._id.toString() === inwardSupplierId.toString());
      if (!isValid) {
        setInwardSupplierId('');
      }
    }
  }, [inwardMedicineId, medSuppliers, inwardSupplierId]);

  // Handlers: Scanner Detection
  const handleScannerDetected = ({ batchNumber, expiryDate, medicineName }) => {
    if (batchNumber) setInwardBatchNo(batchNumber);
    if (expiryDate) setInwardExpiry(expiryDate);

    // If OCR or QR detected medicine name, try matching with existing medicines or keep as typed
    if (medicineName) {
      setInwardMedicineName(medicineName);
      if (medicines.length > 0) {
        const cleanName = medicineName.toLowerCase().trim();
        const matched = medicines.find(
          (m) =>
            m.name.toLowerCase().includes(cleanName) ||
            cleanName.includes(m.name.toLowerCase()) ||
            (m.aliasName && m.aliasName.toLowerCase().includes(cleanName))
        );
        if (matched) {
          setInwardMedicineId(matched._id);
          setInwardMedicineName(matched.name);
        } else {
          setInwardMedicineId('');
        }
      }
    }

    setFeedback({
      type: 'success',
      message: `Scanned: Batch ${batchNumber || ''} ${expiryDate ? `(Exp: ${expiryDate})` : ''} ${medicineName ? `| Med: ${medicineName}` : ''}`,
    });
    setTimeout(() => setFeedback({ type: '', message: '' }), 4000);
  };

  const handleOpenInwardModal = () => {
    setInwardMedicineName('');
    setInwardMedicineId('');
    setInwardBatchNo('');
    setInwardExpiry('');
    setInwardQty('');
    setInwardNotes('');
    setInwardCategory('');
    setInwardUnit('');
    setInwardSupplierId('');
    setIsMedDropdownOpen(false);
    setInwardReceiver(user?.name || user?.username || '');
    setIsInwardModalOpen(true);
  };

  const handleOpenOutwardModal = () => {
    setOutwardMedicineId('');
    setOutwardMedicineName('');
    setIsOutwardMedDropdownOpen(false);
    setOutwardQty('');
    setOutwardReceiver(user?.name || user?.username || '');
    setOutwardShed(locations[0] || 'Shed 1');
    setCustomShed('');
    setIsOutwardModalOpen(true);
    loadLocations();
    loadData();
  };

  // Submit: Stock In (Medicine Arrived)
  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    const trimmedMedName = inwardMedicineName.trim();
    if (!inwardReceiver.trim()) {
      alert('Please enter the receiver name');
      return;
    }
    if (!inwardMedicineId && !trimmedMedName) {
      alert('Please enter or select a medicine name');
      return;
    }
    if (!inwardBatchNo.trim()) {
      alert('Please enter or scan a batch number');
      return;
    }
    if (!inwardExpiry || inwardExpiry <= new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
      alert('Expiry date must be after today. Select tomorrow or a later date.');
      return;
    }
    if (!inwardQty || Number(inwardQty) <= 0) {
      alert('Please enter a valid quantity');
      return;
    }

    try {
      setSubmitting(true);
      const res = await postFastInward({
        medicineId: inwardMedicineId || null,
        newMedicineName: !inwardMedicineId ? trimmedMedName : undefined,
        newMedicineCategory: !inwardMedicineId ? inwardCategory : undefined,
        newMedicineUnit: !inwardMedicineId ? inwardUnit : undefined,
        batchNumber: inwardBatchNo.trim().toUpperCase(),
        expiryDate: inwardExpiry,
        quantity: Number(inwardQty),
        supplierId: inwardSupplierId || null,
        farmId: selectedFarm || null,
        notes: inwardNotes,
        receiverName: inwardReceiver.trim(),
      });

      setFeedback({ type: 'success', message: res.message || 'Stock added successfully!' });
      setIsInwardModalOpen(false);
      setIsMedDropdownOpen(false);
      // Reset inward inputs completely
      setInwardMedicineName('');
      setInwardMedicineId('');
      setInwardBatchNo('');
      setInwardExpiry('');
      setInwardQty('');
      setInwardNotes('');
      setInwardCategory('');
      setInwardUnit('');
      setInwardSupplierId('');
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
    const finalShed = outwardShed === '' ? customShed.trim() : outwardShed;
    if (!outwardReceiver.trim()) {
      alert('Please enter the name of the person collecting the medicine');
      return;
    }
    if (!outwardMedicineId) {
      alert('Please select a medicine');
      return;
    }
    if (!finalShed) {
      alert('Please select or specify a location');
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
        issuedTo: outwardReceiver.trim(),
      });

      const deductionsInfo = (res.data?.deductions || []).map((d) => `Batch ${d.batchNumber} (${d.deducted} ${selectedOutwardMed?.unit || ''})`).join(', ');
      const successMsg = deductionsInfo
        ? `Issued to ${finalShed}! 👉 Pick physical batch: ${deductionsInfo}`
        : res.message || 'Medicine issued to birds!';

      setFeedback({ type: 'success', message: successMsg });
      setIsOutwardModalOpen(false);
      setIsOutwardMedDropdownOpen(false);
      setOutwardMedicineId('');
      setOutwardMedicineName('');
      setOutwardQty('');
      setOutwardReceiver('');
      // Reload feed
      loadData();
      if (onActivityUpdated) onActivityUpdated();
      setTimeout(() => setFeedback({ type: '', message: '' }), 5000);
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
          onClick={handleOpenInwardModal}
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
          onClick={handleOpenOutwardModal}
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
                            <span className="text-slate-500 font-medium truncate">{ev.type === 'OUT' ? 'Issued by' : 'By'} {ev.operator}</span>
                          </>
                        )}
                      </div>
                      {ev.receiver && (
                        <div className="text-[11px] text-slate-600 mt-0.5 break-words">Received by: <strong>{ev.receiver}</strong></div>
                      )}
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
        <div
          /*
           * [MERN Concept: Event Bubbling & Outside Click Modal Dismiss]
           * Clicking anywhere outside the form closes this modal.
           */
          onClick={() => {
            setIsInwardModalOpen(false);
            setIsMedDropdownOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto cursor-pointer"
        >
          <div
            /*
             * [MERN Concept: Event Propagation (e.stopPropagation())]
             * Prevents clicks within the form from closing the modal.
             */
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-100 cursor-default"
          >
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
                onClick={() => {
                  setIsInwardModalOpen(false);
                  setIsMedDropdownOpen(false);
                }}
                className="text-white/80 hover:text-white text-xl font-bold leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Inward Form */}
            <form onSubmit={handleInwardSubmit} className="p-4 space-y-3">
              {/* Medicine Name: Type to search or type new medicine name */}
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Medicine Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="Search medicine or type new name..."
                    value={inwardMedicineName}
                    onFocus={() => setIsMedDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setInwardMedicineName(val);
                      setIsMedDropdownOpen(true);
                      const matched = medicines.find(
                        (m) => m.name.toLowerCase().trim() === val.toLowerCase().trim()
                      );
                      setInwardMedicineId(matched ? matched._id : '');
                    }}
                    className="w-full h-9 pl-8 pr-8 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <span className="absolute left-2.5 text-slate-400 text-xs pointer-events-none">
                    🔍
                  </span>
                  {inwardMedicineName && (
                    <button
                      type="button"
                      onClick={() => {
                        setInwardMedicineName('');
                        setInwardMedicineId('');
                        setIsMedDropdownOpen(true);
                      }}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
                      title="Clear text"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Pop-down Dropdown Menu */}
                {isMedDropdownOpen && (
                  <div
                    className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Option 1: If typed name is new (not in medicines list), show + Add New Medicine */}
                    {inwardMedicineName.trim() &&
                      !medicines.some(
                        (m) =>
                          m.name.toLowerCase().trim() ===
                          inwardMedicineName.toLowerCase().trim()
                      ) && (
                        <div
                          onClick={() => {
                            setInwardMedicineId(''); // Will normally save as new medicine on submit
                            setIsMedDropdownOpen(false);
                          }}
                          className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 flex items-center justify-between cursor-pointer font-bold text-xs transition"
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span>➕</span> Add "{inwardMedicineName.trim()}" as new medicine
                          </span>
                          <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold shrink-0">
                            New
                          </span>
                        </div>
                      )}

                    {/* Option 2: Filtered existing medicines list */}
                    {(() => {
                      const q = inwardMedicineName.trim().toLowerCase();
                      const filtered = q
                        ? medicines.filter(
                            (m) =>
                              m.name.toLowerCase().includes(q) ||
                              (m.aliasName && m.aliasName.toLowerCase().includes(q)) ||
                              (m.category && m.category.toLowerCase().includes(q))
                          )
                        : medicines;

                      if (filtered.length === 0 && !inwardMedicineName.trim()) {
                        return (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No medicines available
                          </div>
                        );
                      }

                      return filtered.map((m) => {
                        const isSelected = m._id === inwardMedicineId;
                        return (
                          <div
                            key={m._id}
                            onClick={() => {
                              setInwardMedicineId(m._id);
                              setInwardMedicineName(m.name);
                              setIsMedDropdownOpen(false);
                            }}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition text-xs ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-900 font-bold'
                                : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="flex flex-col truncate pr-2">
                              <span className="font-bold truncate">{m.name}</span>
                              <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <span className="bg-slate-100 px-1 rounded">{m.category}</span>
                                <span>•</span>
                                <span>Unit: {m.unit}</span>
                              </span>
                            </div>
                            {isSelected && (
                              <span className="text-emerald-600 font-bold">✓</span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>

              {/* Barcode Scanner Button */}
              {!inwardMedicineId && inwardMedicineName.trim() && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="inward-category" className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Category <span className="text-rose-500">*</span></label>
                    <select id="inward-category" required value={inwardCategory} onChange={(e) => setInwardCategory(e.target.value)} className="w-full h-9 px-2 border border-slate-300 rounded-lg text-xs bg-white">
                      <option value="">Select category...</option>
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inward-unit" className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Unit <span className="text-rose-500">*</span></label>
                    <select id="inward-unit" required value={inwardUnit} onChange={(e) => setInwardUnit(e.target.value)} className="w-full h-9 px-2 border border-slate-300 rounded-lg text-xs bg-white">
                      <option value="">Select unit...</option>
                      {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                </div>
              )}

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
                    min={(() => {
                      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                      return new Date(new Date(`${today}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
                    })()}
                    onChange={(e) => setInwardExpiry(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quantity Received */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Quantity Received ({selectedInwardMed?.unit || inwardUnit || 'Units'}){' '}
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
              <div>
                <label htmlFor="inward-receiver" className="block text-[10px] font-bold text-slate-700 uppercase mb-1">Receiver Name <span className="text-rose-500">*</span></label>
                <input id="inward-receiver" type="text" required maxLength={120} value={inwardReceiver}
                  onChange={(e) => setInwardReceiver(e.target.value)} placeholder="Name of the person receiving medicine"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
              </div>


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
                    {medSuppliers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>


              {/* Submit / Cancel Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsInwardModalOpen(false);
                    setIsMedDropdownOpen(false);
                  }}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow transition cursor-pointer"
                >
                  {submitting ? 'Saving...' : '💾 Save'}
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
        <div
          onClick={() => {
            setIsOutwardModalOpen(false);
            setIsOutwardMedDropdownOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-100 cursor-default"
          >
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
                onClick={() => {
                  setIsOutwardModalOpen(false);
                  setIsOutwardMedDropdownOpen(false);
                }}
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
                  Which Location? <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {locations.map((shed) => {
                    const isSelected = outwardShed === shed;
                    return (
                      <div key={shed} className="inline-flex items-center gap-0.5">
                      <button
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
                      {canManageLocations && (
                        <button
                          type="button"
                          aria-label={`Remove location ${shed}`}
                          title={`Remove ${shed}`}
                          disabled={Boolean(removingLocation) || addingLocation}
                          onClick={() => handleRemoveLocation(shed)}
                          className="px-1.5 py-1.5 rounded-lg text-sm font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {removingLocation === shed ? '...' : '×'}
                        </button>
                      )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setOutwardShed('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      outwardShed === ''
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Other...
                  </button>
                </div>

                {outwardShed === '' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter Shed or Location name..."
                    aria-label="Custom location name"
                    maxLength={120}
                    value={customShed}
                    onChange={(e) => setCustomShed(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs mt-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                )}
                {locationError && <p role="alert" className="text-xs text-rose-600 mt-2">{locationError}</p>}
                {canManageLocations && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      aria-label="New saved location"
                      placeholder="Add a saved location"
                      maxLength={120}
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLocation(); } }}
                      className="min-w-0 flex-1 h-8 px-2.5 border border-slate-300 rounded-lg text-xs"
                    />
                    <button type="button" onClick={handleAddLocation} disabled={addingLocation || Boolean(removingLocation) || !newLocation.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 disabled:opacity-50">
                      {addingLocation ? 'Adding...' : '+ Add location'}
                    </button>
                  </div>
                )}
              </div>

              {/* Medicine Select with Autocomplete Search & Pop-down */}
              <div className="relative">
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Which Medicine? <span className="text-rose-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="Search in-stock medicine to issue..."
                    value={outwardMedicineName}
                    onFocus={() => setIsOutwardMedDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOutwardMedicineName(val);
                      setIsOutwardMedDropdownOpen(true);
                      const matched = issuableMedicines.find(
                        (m) => m.name.toLowerCase().trim() === val.toLowerCase().trim()
                      );
                      setOutwardMedicineId(matched ? matched._id : '');
                    }}
                    className="w-full h-9 pl-8 pr-8 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="absolute left-2.5 text-slate-400 text-xs pointer-events-none">
                    🔍
                  </span>
                  {outwardMedicineName && (
                    <button
                      type="button"
                      onClick={() => {
                        setOutwardMedicineName('');
                        setOutwardMedicineId('');
                        setIsOutwardMedDropdownOpen(true);
                      }}
                      className="absolute right-2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1 cursor-pointer"
                      title="Clear text"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Pop-down Dropdown Menu */}
                {isOutwardMedDropdownOpen && (
                  <div
                    className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const q = outwardMedicineName.trim().toLowerCase();
                      const filtered = q
                        ? issuableMedicines.filter(
                            (m) =>
                              m.name.toLowerCase().includes(q) ||
                              (m.aliasName && m.aliasName.toLowerCase().includes(q)) ||
                              (m.category && m.category.toLowerCase().includes(q))
                          )
                        : issuableMedicines;

                      if (issuableMedicines.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No medicines with available stock found.
                          </div>
                        );
                      }

                      if (filtered.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-slate-400">
                            No in-stock medicine matching "{outwardMedicineName.trim()}"
                          </div>
                        );
                      }

                      return filtered.map((m) => {
                        const isSelected = m._id === outwardMedicineId;
                        const stockQty = stockMap?.[m._id] || 0;
                        return (
                          <div
                            key={m._id}
                            onClick={() => {
                              setOutwardMedicineId(m._id);
                              setOutwardMedicineName(m.name);
                              setIsOutwardMedDropdownOpen(false);
                            }}
                            className={`p-2.5 flex items-center justify-between cursor-pointer transition text-xs ${
                              isSelected
                                ? 'bg-blue-50 text-blue-900 font-bold'
                                : 'hover:bg-slate-50 text-slate-800'
                            }`}
                          >
                            <div className="flex flex-col truncate pr-2">
                              <span className="font-bold truncate">{m.name}</span>
                              <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                {m.category && (
                                  <>
                                    <span className="bg-slate-100 px-1 rounded">{m.category}</span>
                                    <span>•</span>
                                  </>
                                )}
                                <span>Unit: {m.unit}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Stock: {stockQty} {m.unit}
                              </span>
                              {isSelected && (
                                <span className="text-blue-600 font-bold">✓</span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* Live Available Stock Badge with Low Stock Alert */}
                {outwardMedicineId && (() => {
                  const availableStock = stockMap === null ? null : (stockMap[outwardMedicineId] || 0);
                  const threshold = selectedOutwardMed?.reorderLevel || selectedOutwardMed?.minimumStock || 0;
                  const isLow = threshold > 0 && availableStock !== null && availableStock <= threshold;
                  return (
                    <div className={`mt-1.5 flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${
                      isLow ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <span className={`font-medium flex items-center gap-1 ${isLow ? 'text-rose-800' : 'text-slate-500'}`}>
                        {isLow && <span>⚠️</span>}
                        Available to Issue:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isLow && (
                          <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-300">
                            Low Stock (&lt; {threshold})
                          </span>
                        )}
                        <span className={`font-black ${isLow ? 'text-rose-700' : availableStock !== null && availableStock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {availableStock !== null ? `${availableStock} ${selectedOutwardMed?.unit || 'Units'}` : loading ? 'Checking stock...' : 'Stock unavailable - refresh'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Real-world Worker Guidance: Physical Batch to Pick from Shelf */}
                {outwardMedicineId && oldestBatchForOutward && (
                  <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-lg text-xs flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base">🏷️</span>
                      <div className="min-w-0">
                        <span className="text-[9px] uppercase font-bold text-amber-900 block leading-tight">
                          Physical Batch to Pick from Cupboard:
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-black text-amber-950 text-xs bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                            {oldestBatchForOutward.batchNumber}
                          </span>
                          <span className="text-[10px] text-amber-800 font-semibold truncate">
                            Expires: {oldestBatchForOutward.expiryDate} ({oldestBatchForOutward.daysLeft}d left)
                          </span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                      {oldestBatchForOutward.quantityAvailable} {selectedOutwardMed?.unit} in batch
                    </span>
                  </div>
                )}
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
                  placeholder={outwardMedicineId ? 'e.g. 2' : 'Select medicine first'}
                  disabled={!outwardMedicineId}
                  max={stockMap?.[outwardMedicineId] || 0}
                  value={outwardQty}
                  onChange={(e) => setOutwardQty(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  💡 System will automatically deduct from the earliest expiring batch (FEFO).
                </p>
              </div>

              {/* Person collecting the medicine */}
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 uppercase mb-1">
                  Receiver Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  aria-label="Receiver name"
                  placeholder="Name of the person collecting medicine"
                  value={outwardReceiver}
                  onChange={(e) => setOutwardReceiver(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {/* Submit / Cancel Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsOutwardModalOpen(false);
                    setIsOutwardMedDropdownOpen(false);
                  }}
                  className="px-3.5 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || loading || !stockMap?.[outwardMedicineId]}
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
