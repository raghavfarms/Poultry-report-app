import { useState, useEffect, useMemo, useRef } from 'react';
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
  onOpenConsumptionRegister,
}) {
  const { user } = useAuth();
  const canManageLocations = ['admin', 'developer'].includes(user?.role);
  const canAddMedicine = ['admin', 'developer'].includes(user?.role);
  // Location State
  const [locations, setLocations] = useState([]);
  const [locationError, setLocationError] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);
  const [removingLocation, setRemovingLocation] = useState('');

  // Master Data State
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
  const [isMedDropdownOpen, setIsMedDropdownOpen] = useState(false);
  const [inwardBatchNo, setInwardBatchNo] = useState('');
  const [inwardExpiry, setInwardExpiry] = useState('');
  const inwardExpiryRef = useRef(null);
  const [inwardQty, setInwardQty] = useState('');
  const [inwardSupplierId, setInwardSupplierId] = useState('');
  const safeFirms = Array.isArray(firms) ? firms : [];
  const [inwardNotes, setInwardNotes] = useState('');
  const [inwardReceiver, setInwardReceiver] = useState('');
  const [inwardFarmId, setInwardFarmId] = useState(selectedFarm || (safeFirms[0]?._id || ''));

  // Outward Form State
  const [outwardMedicineId, setOutwardMedicineId] = useState('');
  const [outwardMedicineName, setOutwardMedicineName] = useState('');
  const [isOutwardMedDropdownOpen, setIsOutwardMedDropdownOpen] = useState(false);
  const [outwardShed, setOutwardShed] = useState('');
  const [customShed, setCustomShed] = useState('');
  const [outwardQty, setOutwardQty] = useState('');
  const [batchAllocations, setBatchAllocations] = useState({});
  const [outwardIssuer, setOutwardIssuer] = useState(user?.name || user?.username || '');
  const [outwardReceiver, setOutwardReceiver] = useState('');
  const [outwardFarmId, setOutwardFarmId] = useState(selectedFarm || (safeFirms[0]?._id || ''));
  const [showAddLocationInput, setShowAddLocationInput] = useState(false);

  const categories = [...new Set(['Feed Medicine', 'Vaccine', 'General', 'Antibiotics', 'Vitamins & Minerals', ...medicines.map((m) => m.category).filter(Boolean)])];
  const units = [...new Set(['Bottle', 'Litre (L)', 'Millilitre (ml)', 'Kilogram (Kg)', 'Gram (g)', 'Vial', 'Packet', 'Tablet', ...medicines.map((m) => m.unit).filter(Boolean)])];

  const effectiveFarm = selectedFarm || (safeFirms.length === 1 ? safeFirms[0]?._id : '');
  const activeFarmName = safeFirms.find((f) => f._id === (selectedFarm || effectiveFarm))?.name || '';

  useEffect(() => {
    setInwardFarmId(selectedFarm || (safeFirms[0]?._id || ''));
    setOutwardFarmId(selectedFarm || (safeFirms[0]?._id || ''));
  }, [selectedFarm, firms]);

  const handleRemoveLocation = async (name) => {
    if (removingLocation) return;
    setRemovingLocation(name);
    const farmToUse = selectedFarm || outwardFarmId || (firms.length === 1 ? firms[0]._id : '');
    try {
      await removeMedicineLocation(name, farmToUse);
      setLocations((current) => current.filter((location) => location !== name));
      setOutwardShed((current) => (current === name ? '' : current));
      setLocationError('');
    } catch (error) {
      setLocationError(error.message || 'Failed to remove location.');
    } finally {
      setRemovingLocation('');
    }
  };

  const loadLocations = async (farmOverride) => {
    const farmToFetch = farmOverride !== undefined ? farmOverride : (selectedFarm || outwardFarmId || (firms.length === 1 ? firms[0]._id : ''));
    try {
      const result = await fetchMedicineLocations(farmToFetch);
      const locList = result.locations || [];
      setLocations(locList);
      setOutwardShed((curr) => {
        if (curr && (locList.includes(curr) || curr === 'Other...')) return curr;
        return locList[0] || '';
      });
      setLocationError('');
    } catch (error) {
      setLocationError('Could not load locations. Use Other to enter a location.');
    }
  };

  useEffect(() => {
    const farmToFetch = selectedFarm || outwardFarmId || (firms.length === 1 ? firms[0]._id : '');
    loadLocations(farmToFetch);
  }, [selectedFarm, outwardFarmId]);

  const handleAddLocation = async () => {
    if (!newLocation.trim() || addingLocation) return;
    setAddingLocation(true);
    const farmToUse = selectedFarm || outwardFarmId || (firms.length === 1 ? firms[0]._id : '');
    try {
      const result = await createMedicineLocation(newLocation, farmToUse);
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

  // Load all required data
  const loadData = async () => {
    try {
      setLoading(true);
      setStockMap(null);

      const targetFarm = selectedFarm || (firms.length === 1 ? firms[0]._id : '');

      const [medRes, supRes, feedRes, statsRes] = await Promise.all([
        fetchMedicines({ status: 'active' }),
        fetchSuppliers().catch(() => ({ suppliers: [] })),
        fetchTodayActivity({ farm: targetFarm }).catch(() => ({ events: [] })),
        fetchDashboardStats({ farm: targetFarm }).catch(() => null),
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
        ].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
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
  }, [selectedFarm, firms]);

  const selectedInwardMed = medicines.find((m) => m._id === inwardMedicineId);
  const selectedOutwardMed = medicines.find((m) => m._id === outwardMedicineId);

  const effectiveOutwardFarm = selectedFarm || outwardFarmId || (firms.length === 1 ? firms[0]._id : '');
  const currentFarmIssuableBatches = useMemo(() => {
    if (!effectiveOutwardFarm) return availableBatches;
    return availableBatches.filter((b) => {
      const fId = b.farm?._id || b.farm;
      return String(fId) === String(effectiveOutwardFarm);
    });
  }, [effectiveOutwardFarm, availableBatches]);

  const currentFarmStockMap = useMemo(() => {
    const map = {};
    for (const b of currentFarmIssuableBatches) {
      if (b.canIssue && b.medicineId) {
        map[b.medicineId] = (map[b.medicineId] || 0) + (b.quantityAvailable || 0);
      }
    }
    return map;
  }, [currentFarmIssuableBatches]);

  const issuableMedicines = useMemo(() => {
    return medicines.filter((medicine) => (currentFarmStockMap[medicine._id] || 0) > 0);
  }, [medicines, currentFarmStockMap]);

  // Determine all active batches for the selected medicine sorted by earliest expiry date first (FEFO)
  const activeBatchesForOutward = useMemo(() => {
    if (!outwardMedicineId || !currentFarmIssuableBatches.length) return [];
    return currentFarmIssuableBatches
      .filter((b) => b.medicineId === outwardMedicineId && b.canIssue && (b.quantityAvailable || 0) > 0)
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }, [outwardMedicineId, currentFarmIssuableBatches]);

  const oldestBatchForOutward = activeBatchesForOutward[0] || null;

  // Batch-wise allocation and automatic total calculation
  const handleBatchQtyChange = (batchId, rawVal, maxAvailable) => {
    let val = rawVal;
    if (val !== '') {
      const num = Number(val);
      if (num > maxAvailable) val = String(maxAvailable);
      else if (num < 0) val = '0';
    }
    const next = { ...batchAllocations, [batchId]: val };
    setBatchAllocations(next);

    // Sum all non-empty batch quantities to automatically compute total!
    let sum = 0;
    let hasAny = false;
    for (const b of activeBatchesForOutward) {
      const q = Number(next[b._id]);
      if (next[b._id] !== '' && !isNaN(q) && q > 0) {
        sum += q;
        hasAny = true;
      }
    }
    setOutwardQty(hasAny ? String(Number(sum.toFixed(3))) : '');
  };

  const handleSetBatchMax = (batchId, maxAvailable) => {
    handleBatchQtyChange(batchId, String(maxAvailable), maxAvailable);
  };

  const handleTotalQtyChange = (rawTotal) => {
    setOutwardQty(rawTotal);
    const totalNum = Number(rawTotal);
    if (!rawTotal || isNaN(totalNum) || totalNum <= 0) {
      setBatchAllocations({});
      return;
    }

    // Auto-distribute across batches in FEFO order
    let remaining = totalNum;
    const next = {};
    for (const b of activeBatchesForOutward) {
      if (remaining <= 0) {
        next[b._id] = '';
        continue;
      }
      const take = Math.min(b.quantityAvailable || 0, remaining);
      next[b._id] = take > 0 ? String(Number(take.toFixed(3))) : '';
      remaining -= take;
    }
    setBatchAllocations(next);
  };

  // Show all registered suppliers in system for stock-in (not restricted to a specific medicine)
  const medSuppliers = useMemo(() => {
    return suppliers.filter((s) => !/apex/i.test(s.name) && s.active !== false);
  }, [suppliers]);

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
    setInwardFarmId(selectedFarm || (firms[0]?._id || ''));
    setIsInwardModalOpen(true);
  };

  const handleOpenOutwardModal = () => {
    setOutwardMedicineId('');
    setOutwardMedicineName('');
    setIsOutwardMedDropdownOpen(false);
    setOutwardQty('');
    setBatchAllocations({});
    setOutwardIssuer(user?.name || user?.username || '');
    setOutwardReceiver('');
    const farmToUse = selectedFarm || (firms[0]?._id || '');
    setOutwardFarmId(farmToUse);
    setIsOutwardModalOpen(true);
    loadLocations(farmToUse);
    loadData();
  };

  // Submit: Stock In (Medicine Arrived)
  const handleInwardSubmit = async (e) => {
    e.preventDefault();
    const effectiveFarm = selectedFarm || inwardFarmId || null;
    if (!effectiveFarm && firms.length > 0) {
      alert('Please select a farm store');
      return;
    }
    const trimmedMedName = inwardMedicineName.trim();
    const finalInwardReceiver = inwardReceiver.trim() || (user?.name || user?.username || 'Storekeeper');
    if (!inwardMedicineId) {
      if (!canAddMedicine) {
        alert('Please select an existing medicine from the dropdown list. Only Admin and Developer accounts can add new medicines.');
        return;
      }
      if (!trimmedMedName) {
        alert('Please enter or select a medicine name');
        return;
      }
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
        farmId: effectiveFarm,
        notes: inwardNotes,
        receiverName: finalInwardReceiver,
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
    const effectiveFarm = selectedFarm || outwardFarmId || null;
    if (!effectiveFarm && firms.length > 0) {
      alert('Please select a farm store');
      return;
    }
    const finalShed = outwardShed === '' ? customShed.trim() : outwardShed;
    if (!outwardMedicineId) {
      alert('Please select a medicine');
      return;
    }
    if (!finalShed) {
      alert('Please select or specify a location');
      return;
    }
    if (!outwardQty || Number(outwardQty) <= 0) {
      alert('Please enter a quantity to issue in at least one batch');
      return;
    }

    const allocationsToSend = Object.entries(batchAllocations)
      .filter(([_, q]) => Number(q) > 0)
      .map(([bId, q]) => ({ batchId: bId, quantity: Number(q) }));

    if (allocationsToSend.length === 0) {
      alert('Please enter a quantity to issue in at least one batch');
      return;
    }

    // Safety guard: ensure no batch exceeds available stock
    for (const alloc of allocationsToSend) {
      const bObj = activeBatchesForOutward.find((b) => String(b._id) === String(alloc.batchId));
      if (bObj && alloc.quantity > (bObj.quantityAvailable || 0)) {
        alert(`Cannot issue medicine: Quantity for Batch ${bObj.batchNumber} (${alloc.quantity}) exceeds available stock (${bObj.quantityAvailable}).`);
        return;
      }
    }

    try {
      setSubmitting(true);
      const res = await postFastOutward({
        medicineId: outwardMedicineId,
        shedName: finalShed,
        quantity: Number(outwardQty),
        batchAllocations: allocationsToSend,
        farmId: effectiveFarm,
        issuedByName: outwardIssuer.trim(),
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
      setBatchAllocations({});
      setOutwardReceiver('');
      setOutwardIssuer(user?.name || user?.username || '');
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
            <div className="text-[11px] sm:text-xs font-bold truncate flex items-center gap-1.5">
              <span>+ Medicine In</span>
              {activeFarmName && (
                <span className="bg-emerald-900/50 text-emerald-100 text-[9px] px-1.5 py-0.2 rounded font-extrabold truncate">
                  {activeFarmName}
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] text-emerald-100 truncate">
              {activeFarmName ? `Add to ${activeFarmName}` : 'Arrived & Scan'}
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
            <div className="text-[11px] sm:text-xs font-bold truncate flex items-center gap-1.5">
              <span>- Give to Birds</span>
              {activeFarmName && (
                <span className="bg-blue-900/50 text-blue-100 text-[9px] px-1.5 py-0.2 rounded font-extrabold truncate">
                  {activeFarmName}
                </span>
              )}
            </div>
            <p className="text-[9px] sm:text-[10px] text-blue-100 truncate">
              {activeFarmName ? `Issue from ${activeFarmName}` : 'Shed Out (FEFO)'}
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
        <div className="px-3 py-2 bg-slate-50/80 border-b border-slate-200 flex justify-between items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">📜</span>
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Today's Movement Log
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 bg-slate-200/60 px-2 py-0.5 rounded-full">
              {todayEvents.length} transactions
            </span>
            {onOpenConsumptionRegister && (
              <button
                type="button"
                onClick={onOpenConsumptionRegister}
                className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg border border-blue-200 flex items-center gap-1 transition cursor-pointer"
                title="View full monthly consumption"
              >
                <span>📋</span> Consume ➔
              </button>
            )}
          </div>
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
                        {ev.farmName && (
                          <span className="bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-semibold text-[9px] shrink-0">
                            🏢 {ev.farmName}
                          </span>
                        )}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-[95%] sm:w-full max-w-md sm:max-w-[444px] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[96vh] sm:max-h-[94vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-100 cursor-default"
          >
            {/* Modal Header */}
            <div className="px-3.5 py-2.5 bg-emerald-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base">📥</span>
                <div>
                  <h3 className="text-xs font-bold leading-tight">Medicine Arrived (Stock In)</h3>
                  <p className="text-[9px] text-emerald-100">Instantly active in available stock</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsInwardModalOpen(false);
                  setIsMedDropdownOpen(false);
                }}
                className="text-white/80 hover:text-white text-base font-bold leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Inward Form */}
            <form onSubmit={handleInwardSubmit} className="w-full overflow-y-auto p-3 sm:p-3.5 space-y-2">
              {/* Farm Location Selector / Indicator */}
              {(selectedFarm || firms.length === 1) ? (
                <div className="flex items-center justify-between px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-bold text-emerald-900">
                  <div className="flex items-center gap-1">
                    <span>🏢</span>
                    <span className="text-[11px]">Farm Store:</span>
                  </div>
                  <span className="bg-emerald-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black">
                    {firms.find((f) => f._id === (selectedFarm || firms[0]?._id))?.name || 'Farm'}
                  </span>
                </div>
              ) : firms.length > 1 ? (
                <div>
                  <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                    Select Farm Store <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={inwardFarmId}
                    onChange={(e) => setInwardFarmId(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-bold text-slate-800 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Farm (Raghav / Sanjana)...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Medicine Name with integrated Camera Scanner Button */}
              <div className="relative">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">
                    Medicine Name <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-1.5 py-0.2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-[9px] font-bold rounded flex items-center gap-1 transition cursor-pointer"
                    title="Scan printed box / bottle label with camera"
                  >
                    <span>📷</span> Scan Label
                  </button>
                </div>
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
                    className="w-full h-8 pl-7 pr-14 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                  <span className="absolute left-2 text-slate-400 text-xs pointer-events-none">
                    🔍
                  </span>
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {inwardMedicineName && (
                      <button
                        type="button"
                        onClick={() => {
                          setInwardMedicineName('');
                          setInwardMedicineId('');
                          setIsMedDropdownOpen(true);
                        }}
                        className="text-slate-400 hover:text-slate-600 text-xs font-bold p-0.5 cursor-pointer"
                        title="Clear text"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMedDropdownOpen((prev) => !prev);
                      }}
                      className="text-slate-400 hover:text-slate-600 text-[10px] font-bold p-1 rounded hover:bg-slate-100 cursor-pointer"
                      title={isMedDropdownOpen ? 'Collapse list' : 'Expand list'}
                    >
                      {isMedDropdownOpen ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* Pop-down Dropdown Menu (Normal Flow Dynamic Shift) */}
                {isMedDropdownOpen && (
                  <div
                    className="w-full mt-1.5 bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden max-h-[235px] overflow-y-auto divide-y divide-slate-100 transition-all duration-200 animate-in fade-in"
                    onClick={(e) => e.stopPropagation()}
                  >
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

                      return (
                        <>
                          <div className="flex items-center justify-between px-3 py-1 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 font-semibold sticky top-0 z-10">
                            <span>Select Medicine ({filtered.length})</span>
                            <button
                              type="button"
                              onClick={() => setIsMedDropdownOpen(false)}
                              className="text-slate-500 hover:text-slate-800 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 cursor-pointer"
                            >
                              Close ✕
                            </button>
                          </div>

                          {/* Option 1: If typed name is new, show + Add New Medicine */}
                          {canAddMedicine &&
                            inwardMedicineName.trim() &&
                            !medicines.some(
                              (m) =>
                                m.name.toLowerCase().trim() ===
                                inwardMedicineName.toLowerCase().trim()
                            ) && (
                              <div
                                onClick={() => {
                                  setInwardMedicineId('');
                                  setIsMedDropdownOpen(false);
                                }}
                                className="px-3 py-2 min-h-[44px] bg-emerald-50 hover:bg-emerald-100 text-emerald-900 flex items-center justify-between cursor-pointer font-bold text-xs transition"
                              >
                                <span className="flex items-center gap-1.5 truncate">
                                  <span>➕</span> Add "{inwardMedicineName.trim()}" as new medicine
                                </span>
                                <span className="text-[10px] bg-emerald-200 text-emerald-800 px-1.5 py-0.5 rounded font-bold shrink-0">
                                  New
                                </span>
                              </div>
                            )}

                          {filtered.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-500">
                              {q ? (
                                <div>
                                  <span>No medicines matching "{inwardMedicineName.trim()}"</span>
                                  {!canAddMedicine && (
                                    <div className="mt-1 text-[11px] text-amber-700 font-semibold">
                                      Please search from existing medicines or contact an Admin.
                                    </div>
                                  )}
                                </div>
                              ) : (
                                'No medicines available'
                              )}
                            </div>
                          ) : (
                            filtered.map((m) => {
                              const isSelected = m._id === inwardMedicineId;
                              return (
                                <div
                                  key={m._id}
                                  onClick={() => {
                                    setInwardMedicineId(m._id);
                                    setInwardMedicineName(m.name);
                                    setIsMedDropdownOpen(false);
                                  }}
                                  className={`px-3 py-1.5 min-h-[46px] max-h-[46px] flex items-center justify-between cursor-pointer transition text-xs ${
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
                            })
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Category and Unit selectors: ADMIN & DEVELOPER ONLY */}
              {canAddMedicine && !inwardMedicineId && inwardMedicineName.trim() && (
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label htmlFor="inward-category" className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">Category <span className="text-rose-500">*</span></label>
                    <select id="inward-category" required value={inwardCategory} onChange={(e) => setInwardCategory(e.target.value)} className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs bg-white">
                      <option value="">Select category...</option>
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="inward-unit" className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">Unit <span className="text-rose-500">*</span></label>
                    <select id="inward-unit" required value={inwardUnit} onChange={(e) => setInwardUnit(e.target.value)} className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs bg-white">
                      <option value="">Select unit...</option>
                      {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Batch Number & Expiry Grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                    Batch Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BATCH-01"
                    value={inwardBatchNo}
                    onChange={(e) => setInwardBatchNo(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                    Expiry Date <span className="text-rose-500">*</span>
                  </label>
                  <div
                    className="relative w-full cursor-pointer"
                    onClick={() => {
                      try {
                        inwardExpiryRef.current?.showPicker();
                      } catch (err) {}
                    }}
                  >
                    <input
                      ref={inwardExpiryRef}
                      type="date"
                      required
                      value={inwardExpiry}
                      min={(() => {
                        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
                        return new Date(new Date(`${today}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
                      })()}
                      onClick={(e) => {
                        try {
                          e.currentTarget.showPicker();
                        } catch (err) {}
                      }}
                      onChange={(e) => setInwardExpiry(e.target.value)}
                      className="w-full h-8 pl-2 pr-7 border border-slate-300 rounded-md text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer bg-white relative [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none select-none">
                      📅
                    </span>
                  </div>
                </div>
              </div>

              {/* Quantity Received & Receiver Name Grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                    Qty Received ({selectedInwardMed?.unit || inwardUnit || 'Units'}){' '}
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
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-bold text-slate-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none no-spinner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>

                <div>
                  <label htmlFor="inward-receiver" className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                    Receiver <span className="text-slate-400 font-normal lowercase">(opt)</span>
                  </label>
                  <input
                    id="inward-receiver"
                    type="text"
                    maxLength={120}
                    value={inwardReceiver}
                    onChange={(e) => setInwardReceiver(e.target.value)}
                    placeholder="Received by"
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-900 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Supplier Selector */}
              <div>
                <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                  Supplier <span className="text-slate-400 font-normal lowercase">(optional)</span>
                </label>
                <select
                  value={inwardSupplierId}
                  onChange={(e) => setInwardSupplierId(e.target.value)}
                  className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
              <div className="pt-2 flex items-center justify-end gap-1.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsInwardModalOpen(false);
                    setIsMedDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-md transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-md shadow-sm transition cursor-pointer"
                >
                  {submitting ? 'Saving...' : '💾 Stock In'}
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
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-[95%] sm:w-full max-w-md sm:max-w-[444px] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[96vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-100 cursor-default"
          >
            {/* Modal Header */}
            <div className="px-3.5 py-2.5 bg-blue-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base">💉</span>
                <div>
                  <h3 className="text-xs font-bold leading-tight">- Give to Birds (Stock Out)</h3>
                  <p className="text-[9px] text-blue-100">Automatic FEFO deduction</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsOutwardModalOpen(false);
                  setIsOutwardMedDropdownOpen(false);
                }}
                className="text-white/80 hover:text-white text-base font-bold leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Outward Form */}
            <form onSubmit={handleOutwardSubmit} className="w-full overflow-y-auto p-3 sm:p-3.5 space-y-2">
              {/* Farm Location Selector / Indicator */}
              {(selectedFarm || firms.length === 1) ? (
                <div className="flex items-center justify-between px-2 py-0.5 bg-blue-50 border border-blue-200 rounded-md text-xs font-bold text-blue-900">
                  <div className="flex items-center gap-1">
                    <span>🏢</span>
                    <span className="text-[11px]">Farm Store:</span>
                  </div>
                  <span className="bg-blue-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black">
                    {firms.find((f) => f._id === (selectedFarm || firms[0]?._id))?.name || 'Farm'}
                  </span>
                </div>
              ) : firms.length > 1 ? (
                <div>
                  <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                    Select Farm Store <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={outwardFarmId}
                    onChange={(e) => {
                      const nextFarm = e.target.value;
                      setOutwardFarmId(nextFarm);
                      setOutwardMedicineId('');
                      setOutwardMedicineName('');
                      loadLocations(nextFarm);
                    }}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-bold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Select Farm (Raghav / Sanjana)...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* 1-Tap Shed Selector */}
              <div>
                <label className="block text-[9px] font-bold text-slate-700 uppercase mb-0.5">
                  Which Location? <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-wrap items-center gap-1">
                  {locations.map((shed) => {
                    const isSelected = outwardShed === shed;
                    return (
                      <div
                        key={shed}
                        className={`inline-flex items-center rounded-md border text-[11px] font-bold transition shadow-2xs ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOutwardShed(shed)}
                          className="px-2.5 py-1 cursor-pointer text-[11px]"
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
                            className={`px-1 py-1 border-l text-[9px] font-bold transition cursor-pointer ${
                              isSelected
                                ? 'border-blue-500 text-blue-200 hover:text-white hover:bg-blue-700'
                                : 'border-slate-300 text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                            }`}
                          >
                            {removingLocation === shed ? '...' : '✕'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setOutwardShed('')}
                    className={`px-2.5 py-1 rounded-md border text-[11px] font-bold transition cursor-pointer ${
                      outwardShed === ''
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                    }`}
                  >
                    Other...
                  </button>
                  {canManageLocations && !showAddLocationInput && (
                    <button
                      type="button"
                      onClick={() => setShowAddLocationInput(true)}
                      className="px-2 py-1 rounded-md border border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition cursor-pointer"
                    >
                      + Add
                    </button>
                  )}
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
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs mt-1 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                )}
                {locationError && <p role="alert" className="text-xs text-rose-600 mt-0.5">{locationError}</p>}
                {canManageLocations && showAddLocationInput && (
                  <div className="flex gap-1 mt-1">
                    <input
                      type="text"
                      aria-label="New saved location"
                      placeholder="New location / shed..."
                      maxLength={120}
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLocation(); } }}
                      className="min-w-0 flex-1 h-8 px-2 border border-slate-300 rounded-md text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleAddLocation}
                      disabled={addingLocation || Boolean(removingLocation) || !newLocation.trim()}
                      className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                    >
                      {addingLocation ? '...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowAddLocationInput(false); setNewLocation(''); }}
                      className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Medicine Select with Autocomplete Search & Integrated Stock Badge */}
              <div className="relative">
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-[9px] font-bold text-slate-700 uppercase">
                    Which Medicine? <span className="text-rose-500">*</span>
                  </label>
                  {outwardMedicineId && (() => {
                    const availableStock = currentFarmStockMap?.[outwardMedicineId] || 0;
                    return (
                      <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <span>📦 Stock:</span>
                        <span>{availableStock} {selectedOutwardMed?.unit || 'Units'}</span>
                      </span>
                    );
                  })()}
                </div>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    required
                    placeholder="Search in-stock medicine to issue..."
                    value={outwardMedicineName}
                    onFocus={() => setIsOutwardMedDropdownOpen(true)}
                    onClick={() => setIsOutwardMedDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOutwardMedicineName(val);
                      setIsOutwardMedDropdownOpen(true);
                      const matched = issuableMedicines.find(
                        (m) => m.name.toLowerCase().trim() === val.toLowerCase().trim()
                      );
                      setOutwardMedicineId(matched ? matched._id : '');
                    }}
                    className="w-full h-8 pl-7 pr-14 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <span className="absolute left-2 text-slate-400 text-xs pointer-events-none">
                    🔍
                  </span>
                  <div className="absolute right-1.5 flex items-center gap-1">
                    {outwardMedicineName && (
                      <button
                        type="button"
                        onClick={() => {
                          setOutwardMedicineName('');
                          setOutwardMedicineId('');
                          setIsOutwardMedDropdownOpen(true);
                        }}
                        className="text-slate-400 hover:text-slate-600 text-xs font-bold p-0.5 cursor-pointer"
                        title="Clear text"
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOutwardMedDropdownOpen((prev) => !prev);
                      }}
                      className="text-slate-400 hover:text-slate-600 text-[10px] font-bold p-1 rounded hover:bg-slate-100 cursor-pointer"
                      title={isOutwardMedDropdownOpen ? 'Collapse list' : 'Expand list'}
                    >
                      {isOutwardMedDropdownOpen ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* Dynamic Shift Dropdown Menu (Normal Flow - Pushes content below when open, shifts back up when selected) */}
                {isOutwardMedDropdownOpen && (
                  <div
                    className="w-full mt-1.5 bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden max-h-[235px] overflow-y-auto divide-y divide-slate-100 transition-all duration-200 animate-in fade-in"
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

                      return (
                        <>
                          <div className="flex items-center justify-between px-3 py-1 bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 font-semibold sticky top-0 z-10">
                            <span>Available In-Stock Medicines ({filtered.length})</span>
                            <button
                              type="button"
                              onClick={() => setIsOutwardMedDropdownOpen(false)}
                              className="text-slate-500 hover:text-slate-800 font-bold px-1.5 py-0.5 rounded hover:bg-slate-200 cursor-pointer"
                            >
                              Close ✕
                            </button>
                          </div>

                          {issuableMedicines.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              No medicines with available stock found.
                            </div>
                          ) : filtered.length === 0 ? (
                            <div className="p-3 text-center text-xs text-slate-400">
                              No in-stock medicine matching "{outwardMedicineName.trim()}"
                            </div>
                          ) : (
                            filtered.map((m) => {
                              const isSelected = m._id === outwardMedicineId;
                              const stockQty = currentFarmStockMap?.[m._id] || 0;
                              return (
                                <div
                                  key={m._id}
                                  onClick={() => {
                                    setOutwardMedicineId(m._id);
                                    setOutwardMedicineName(m.name);
                                    setIsOutwardMedDropdownOpen(false);
                                  }}
                                  className={`px-3 py-1.5 min-h-[46px] max-h-[46px] flex items-center justify-between cursor-pointer transition text-xs ${
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
                            })
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Physical Batches Available to Pick (Compact Table Layout) */}
              {outwardMedicineId && activeBatchesForOutward.length > 0 && (
                <div>
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-700 px-0.5 mb-0.5">
                    <span>🏷️ Batches ({activeBatchesForOutward.length}):</span>
                    <span className="text-[9px] text-slate-400 font-normal">
                      FEFO Auto-ordered
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                    {/* Compact Table Header */}
                    <div className="grid grid-cols-12 text-[9px] font-black uppercase text-slate-500 bg-slate-100/90 px-2 py-0.5 border-b border-slate-200">
                      <div className="col-span-3 text-left">BATCH</div>
                      <div className="col-span-3 text-center">SHELF</div>
                      <div className="col-span-3 text-center">AVAILABLE</div>
                      <div className="col-span-3 text-right">TAKE ({selectedOutwardMed?.unit})</div>
                    </div>

                    {/* Compact Rows */}
                    <div className="max-h-32 overflow-y-auto divide-y divide-slate-100">
                      {activeBatchesForOutward.map((b) => {
                        const isExpired = b.daysLeft < 0;
                        const isCritical = b.daysLeft <= 30;
                        const allocVal = batchAllocations[b._id] ?? '';

                        return (
                          <div
                            key={b._id}
                            className={`grid grid-cols-12 items-center px-2 py-1 text-xs hover:bg-blue-50/40 ${
                              isExpired || isCritical ? 'bg-rose-50/30' : ''
                            }`}
                          >
                            {/* Col 1: Batch */}
                            <div className="col-span-3 flex items-center">
                              <span className="font-mono font-bold text-slate-900 text-[11px]">
                                #{b.batchNumber}
                              </span>
                            </div>

                            {/* Col 2: Shelf (Middle between Batch and Available) */}
                            <div className="col-span-3 flex justify-center">
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  isExpired || isCritical
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}
                              >
                                {isExpired ? 'Exp' : `${b.daysLeft}d`}
                              </span>
                            </div>

                            {/* Col 3: Available */}
                            <div className="col-span-3 text-center font-bold text-slate-800 text-xs">
                              {b.quantityAvailable}
                            </div>

                            {/* Col 4: Take input */}
                            <div className="col-span-3 flex justify-end">
                              <input
                                type="number"
                                min="0"
                                max={b.quantityAvailable}
                                step="any"
                                placeholder="0"
                                value={allocVal}
                                onChange={(e) => handleBatchQtyChange(b._id, e.target.value, b.quantityAvailable)}
                                className={`w-14 sm:w-16 h-7 px-1 text-center font-bold text-xs border rounded bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none no-spinner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                                  Number(allocVal) > 0
                                    ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-300'
                                    : 'border-slate-300'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Issuer (Issued By) & Receiver (Received By) - Side-by-Side */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="block text-[9px] font-bold text-slate-700 uppercase truncate">
                      Issuer <span className="text-slate-400 font-normal lowercase">(opt)</span>
                    </label>
                    {user && (user.name || user.username) && outwardIssuer !== (user.name || user.username) && (
                      <button
                        type="button"
                        onClick={() => setOutwardIssuer(user.name || user.username || '')}
                        className="text-[8px] text-blue-600 hover:text-blue-800 font-semibold underline cursor-pointer"
                        title="Reset to your login account"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={120}
                    aria-label="Issuer name"
                    placeholder="Issued by"
                    value={outwardIssuer}
                    onChange={(e) => setOutwardIssuer(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-900 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="block text-[9px] font-bold text-slate-700 uppercase truncate">
                      Receiver <span className="text-slate-400 font-normal lowercase">(opt)</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    maxLength={120}
                    aria-label="Receiver name"
                    placeholder="Received by"
                    value={outwardReceiver}
                    onChange={(e) => setOutwardReceiver(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-900 bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Submit / Cancel Buttons with Total Quantity Integrated */}
              <div className="pt-2 flex items-center justify-between gap-1.5 border-t border-slate-100 shrink-0">
                <div className="text-xs font-bold text-blue-900 whitespace-nowrap">
                  Total: <strong className="text-sm font-black text-blue-700">{outwardQty && Number(outwardQty) > 0 ? outwardQty : 0}</strong>{' '}
                  <span className="text-[10px] text-slate-500 font-medium">{selectedOutwardMed?.unit || ''}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOutwardModalOpen(false);
                      setIsOutwardMedDropdownOpen(false);
                    }}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-md transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !outwardQty || Number(outwardQty) <= 0}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-md shadow-xs transition cursor-pointer flex items-center gap-1"
                  >
                    <span>💾</span> {submitting ? 'Saving...' : 'Issue'}
                  </button>
                </div>
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
