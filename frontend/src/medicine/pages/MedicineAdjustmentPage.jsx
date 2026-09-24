import { useState, useEffect } from 'react';
import {
  fetchAdjustments,
  createReturnApi,
  createStockAdjustmentApi,
  createDisposalApi,
} from '../api/adjustmentApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import { fetchBatchStock } from '../api/receiptApi.js';
import { api } from '../../api/client.js';

const TYPE_BADGES = {
  RETURN_INWARD: {
    label: '↩️ Shed Return (+IN)',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    qtyColor: 'text-emerald-700 font-bold',
    sign: '+',
  },
  ADJUSTMENT_IN: {
    label: '⚖️ Audit Surplus (+IN)',
    className: 'bg-teal-50 text-teal-700 border-teal-200',
    qtyColor: 'text-teal-700 font-bold',
    sign: '+',
  },
  ADJUSTMENT_OUT: {
    label: '⚠️ Breakage/Shortage (-OUT)',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    qtyColor: 'text-amber-700 font-bold',
    sign: '-',
  },
  DISPOSAL_EXPIRED: {
    label: '🔥 Safe Disposal (-OUT)',
    className: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
    qtyColor: 'text-rose-700 font-bold',
    sign: '-',
  }, 
};

export default function MedicineAdjustmentPage() {
  // Data states
  const [adjustments, setAdjustments] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedFarm, setSelectedFarm] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState('');

  // Active Modal State: null | 'RETURN' | 'ADJUSTMENT' | 'DISPOSAL' | 'DETAILS'
  const [activeModal, setActiveModal] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Available batches for selected farm & medicine
  const [availableBatches, setAvailableBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Form States (Shared)
  const [formFarm, setFormFarm] = useState('');
  const [formMedicine, setFormMedicine] = useState('');
  const [formBatch, setFormBatch] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formRemarks, setFormRemarks] = useState('');

  // Form States (Specific)
  const [formShed, setFormShed] = useState('');
  const [formReturnedBy, setFormReturnedBy] = useState('');
  const [formDirection, setFormDirection] = useState('OUT');
  const [formWitness, setFormWitness] = useState('');
  const [formDisposalMethod, setFormDisposalMethod] = useState('INCINERATION');

  // 1. Load Dropdowns
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [medData, firmData] = await Promise.all([
          fetchMedicines({ includeInactive: false }),
          api('/firms'),
        ]);
        setMedicines(medData.medicines || []);
        setFirms(firmData.firms || []);
      } catch (err) {
        console.error('Failed to load dropdowns', err);
      }
    }
    loadDropdowns();
  }, []);

  // 2. Load Adjustments List
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchAdjustments({
        search,
        type: selectedType,
        farm: selectedFarm,
        medicine: selectedMedicine,
      });
      setAdjustments(data.adjustments || []);
    } catch (err) {
      setError(err.message || 'Failed to load stock adjustments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedType, selectedFarm, selectedMedicine]);

  // 3. Load Batches when Farm or Medicine changes in any modal
  useEffect(() => {
    if (!formFarm || !formMedicine) {
      setAvailableBatches([]);
      setFormBatch('');
      return;
    }

    async function loadBatches() {
      try {
        setLoadingBatches(true);
        const data = await fetchBatchStock({ farm: formFarm, medicine: formMedicine });
        const batchList = data.batches || [];
        setAvailableBatches(batchList);
        if (batchList.length > 0) {
          setFormBatch(batchList[0]._id);
          // If in disposal modal, pre-fill qty with current available stock
          if (activeModal === 'DISPOSAL') {
            setFormQty(batchList[0].quantityAvailable);
          }
        } else {
          setFormBatch('');
          setFormQty('');
        }
      } catch (err) {
        console.error('Failed to fetch batches', err);
        setAvailableBatches([]);
      } finally {
        setLoadingBatches(false);
      }
    }

    loadBatches();
  }, [formFarm, formMedicine, activeModal]);

  // Open modal helpers
  const handleOpenModal = (modalType) => {
    setActiveModal(modalType);
    setFormFarm(firms[0]?._id || '');
    setFormMedicine(medicines[0]?._id || '');
    setFormBatch('');
    setFormQty('');
    setFormReason('');
    setFormRemarks('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormShed('');
    setFormReturnedBy('');
    setFormDirection('OUT');
    setFormWitness('');
    setFormDisposalMethod('INCINERATION');
    setError('');
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      if (!formBatch) throw new Error('Please select a batch');

      if (activeModal === 'RETURN') {
        await createReturnApi({
          medicineId: formMedicine,
          batchId: formBatch,
          farmId: formFarm,
          shed: formShed,
          quantity: Number(formQty),
          reason: formReason,
          returnedBy: formReturnedBy,
          adjustmentDate: formDate,
          remarks: formRemarks,
        });
        setSuccessMsg('Shed return recorded and credited to batch stock!');
      } else if (activeModal === 'ADJUSTMENT') {
        await createStockAdjustmentApi({
          medicineId: formMedicine,
          batchId: formBatch,
          farmId: formFarm,
          direction: formDirection,
          quantity: Number(formQty),
          reason: formReason,
          witnessedBy: formWitness,
          adjustmentDate: formDate,
          remarks: formRemarks,
        });
        setSuccessMsg('Physical stock adjustment recorded successfully!');
      } else if (activeModal === 'DISPOSAL') {
        await createDisposalApi({
          medicineId: formMedicine,
          batchId: formBatch,
          farmId: formFarm,
          quantity: Number(formQty),
          disposalMethod: formDisposalMethod,
          reason: formReason,
          witnessedBy: formWitness,
          adjustmentDate: formDate,
          remarks: formRemarks,
        });
        setSuccessMsg('Safe disposal write-off recorded and deducted from stock!');
      }

      setTimeout(() => setSuccessMsg(''), 4500);
      setActiveModal(null);
      loadData();
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBatchObj = availableBatches.find((b) => b._id === formBatch);
  const selectedMed = medicines.find((m) => m._id === formMedicine);

  return (
    <div className="space-y-4">
      {/* 1. Header Card with Quick Action Buttons */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              Returns, Adjustments & Disposal
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-purple-100 text-purple-800 rounded-full border border-purple-200">
              ⚖️ Stock Audit
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Shed returns, physical count reconciliation, and biosecure safe disposal write-offs
          </p>
        </div>

        {/* 3 Action Buttons */}
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleOpenModal('RETURN')}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg text-xs shadow-xs transition flex items-center justify-center gap-1.5"
          >
            <span>↩️</span> Return from Shed
          </button>
          <button
            onClick={() => handleOpenModal('ADJUSTMENT')}
            className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-2 rounded-lg text-xs shadow-xs transition flex items-center justify-center gap-1.5"
          >
            <span>⚖️</span> Audit Adjustment
          </button>
          <button
            onClick={() => handleOpenModal('DISPOSAL')}
            className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-semibold px-3 py-2 rounded-lg text-xs shadow-xs transition flex items-center justify-center gap-1.5"
          >
            <span>🔥</span> Safe Disposal
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}
      {error && !activeModal && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
          ⚠ {error}
        </div>
      )}

      {/* 2. Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Search
          </label>
          <input
            type="text"
            placeholder="Adj #, Batch, Reason, Shed..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Movement Type Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Movement Type
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Movement Types</option>
            <option value="RETURN_INWARD">↩️ Shed Return (+IN)</option>
            <option value="ADJUSTMENT_IN">⚖️ Audit Surplus (+IN)</option>
            <option value="ADJUSTMENT_OUT">⚠️ Breakage / Shortage (-OUT)</option>
            <option value="DISPOSAL_EXPIRED">🔥 Safe Disposal (-OUT)</option>
          </select>
        </div>

        {/* Farm Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Farm
          </label>
          <select
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Farms</option>
            {firms.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name} ({f.code})
              </option>
            ))}
          </select>
        </div>

        {/* Medicine Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Medicine
          </label>
          <select
            value={selectedMedicine}
            onChange={(e) => setSelectedMedicine(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Medicines</option>
            {medicines.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Adjustments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Loading adjustments & audit trail...
          </div>
        ) : adjustments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No returns, adjustments, or disposals found matching criteria.
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-3">Adjustment # & Date</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Farm & Source/Shed</th>
                    <th className="py-2.5 px-3">Medicine & Batch</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3">Reason / Method</th>
                    <th className="py-2.5 px-3">Auditor / Witness</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {adjustments.map((adj) => {
                    const badgeInfo = TYPE_BADGES[adj.type] || TYPE_BADGES.ADJUSTMENT_IN;
                    return (
                      <tr key={adj._id} className="hover:bg-slate-50/70 transition">
                        {/* Adj # & Date */}
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-800">
                            {adj.adjustmentNumber}
                          </span>
                          <div className="text-[10px] text-slate-500">{adj.adjustmentDate}</div>
                        </td>

                        {/* Movement Type */}
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${badgeInfo.className}`}
                          >
                            {badgeInfo.label}
                          </span>
                        </td>

                        {/* Farm & Shed */}
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">
                            {adj.farm?.name}
                          </div>
                          {adj.shed && (
                            <div className="text-[11px] text-slate-600 font-medium">
                              📍 From {adj.shed}
                            </div>
                          )}
                        </td>

                        {/* Medicine & Batch */}
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">
                            {adj.medicine?.name}
                          </div>
                          <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-[10px] font-mono text-slate-600">
                            Batch: {adj.batchNumber}
                          </span>
                        </td>

                        {/* Quantity */}
                        <td className="py-2.5 px-3 text-right">
                          <span className={`font-mono text-sm ${badgeInfo.qtyColor}`}>
                            {badgeInfo.sign}{adj.quantity}
                          </span>{' '}
                          <span className="text-[10px] text-slate-500 font-medium">
                            {adj.unit}
                          </span>
                        </td>

                        {/* Reason & Method */}
                        <td className="py-2.5 px-3 max-w-[200px]">
                          <div className="font-medium text-slate-700 truncate" title={adj.reason}>
                            {adj.reason}
                          </div>
                          {adj.disposalMethod && (
                            <div className="text-[10px] text-rose-600 font-semibold">
                              Method: {adj.disposalMethod}
                            </div>
                          )}
                        </td>

                        {/* Auditor / Witness */}
                        <td className="py-2.5 px-3">
                          <div className="text-slate-700 font-medium">
                            {adj.adjustedBy?.name || adj.adjustedBy?.username}
                          </div>
                          {adj.witnessedBy && (
                            <div className="text-[10px] text-slate-500 truncate" title={adj.witnessedBy}>
                              👁️ {adj.witnessedBy}
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedDetail(adj)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="sm:hidden divide-y divide-slate-100">
              {adjustments.map((adj) => {
                const badgeInfo = TYPE_BADGES[adj.type] || TYPE_BADGES.ADJUSTMENT_IN;
                return (
                  <div key={adj._id} className="p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-mono font-bold text-slate-800">{adj.adjustmentNumber}</span>
                        <div className="text-[10px] text-slate-400">{adj.adjustmentDate}</div>
                      </div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] border ${badgeInfo.className}`}>
                        {badgeInfo.label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Medicine</span>
                        <span className="font-semibold text-slate-800">{adj.medicine?.name}</span>
                        <div className="text-[10px] text-slate-500 font-mono">Batch: {adj.batchNumber}</div>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Location</span>
                        <span className="font-semibold text-slate-800">{adj.farm?.name}</span>
                        {adj.shed && <div className="text-[10px] text-slate-500">📍 {adj.shed}</div>}
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Reason</span>
                        <span className="font-medium text-slate-700">{adj.reason}</span>
                        {adj.disposalMethod && (
                          <span className="text-[10px] text-rose-600 font-semibold ml-1">({adj.disposalMethod})</span>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-50">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Quantity</span>
                        <span className={`font-mono text-sm ${badgeInfo.qtyColor}`}>
                          {badgeInfo.sign}{adj.quantity} {adj.unit}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedDetail(adj)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 4. MODALS */}

      {/* MODAL 1: RETURN FROM SHED */}
      {activeModal === 'RETURN' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>↩️</span> Record Shed Return (Inward)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Return unused sealed medicine from a shed back to the central store
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3.5">
              {error && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs font-semibold">
                  ⚠ {error}
                </div>
              )}

              {/* Farm & Medicine */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Farm *</label>
                  <select
                    value={formFarm}
                    onChange={(e) => setFormFarm(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Farm...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Medicine *</label>
                  <select
                    value={formMedicine}
                    onChange={(e) => setFormMedicine(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Medicine...</option>
                    {medicines.map((m) => (
                      <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Batch Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Target Batch to Credit * {loadingBatches && '(Loading batches...)'}
                </label>
                <select
                  value={formBatch}
                  onChange={(e) => setFormBatch(e.target.value)}
                  required
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-mono"
                >
                  <option value="">Select Batch...</option>
                  {availableBatches.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.batchNumber} (Current on-shelf: {b.quantityAvailable}, Exp: {b.expiryDate})
                    </option>
                  ))}
                </select>
              </div>

              {/* Shed & Return Qty */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Source Shed *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shed 1, Shed 3"
                    value={formShed}
                    onChange={(e) => setFormShed(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Return Qty * ({selectedMed?.unit || 'Units'})
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="e.g. 4"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-mono font-bold text-emerald-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Return Reason */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Return Reason *</label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  required
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">Select Reason...</option>
                  <option value="Flock treatment completed early / mortality subsided">Flock treatment completed early</option>
                  <option value="Veterinarian changed medication / prescription">Vet changed prescription</option>
                  <option value="Excess drawn by shed supervisor">Excess drawn by supervisor</option>
                  <option value="Wrong item drawn by mistake">Wrong item drawn by mistake</option>
                  <option value="Flock culled or sold">Flock culled or sold</option>
                </select>
              </div>

              {/* Returned By & Date */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Returned By (Worker/Supervisor)</label>
                  <input
                    type="text"
                    placeholder="e.g. Supervisor Ramesh"
                    value={formReturnedBy}
                    onChange={(e) => setFormReturnedBy(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Return Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Bottles inspected, seals unbroken, returned to cabinet"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 h-8 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formBatch}
                  className="px-4 h-8 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Crediting Stock...' : '✓ Confirm Shed Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PHYSICAL STOCK AUDIT ADJUSTMENT */}
      {activeModal === 'ADJUSTMENT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>⚖️</span> Physical Stock Count Adjustment
                </h3>
                <p className="text-[11px] text-slate-500">
                  Reconcile physical store count discrepancies, breakages, or leakage
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3.5">
              {error && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs font-semibold">
                  ⚠ {error}
                </div>
              )}

              {/* Adjustment Direction Toggle */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1.5">
                  Adjustment Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormDirection('OUT')}
                    className={`p-2.5 rounded-lg border text-left text-xs font-bold transition flex items-center gap-2 ${
                      formDirection === 'OUT'
                        ? 'bg-amber-50 border-amber-500 text-amber-900 ring-1 ring-amber-400'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>⚠️</span>
                    <div>
                      <div>Shortage / Damage (-OUT)</div>
                      <div className="text-[10px] font-normal text-slate-500">Breakage, leakage, count shortage</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormDirection('IN')}
                    className={`p-2.5 rounded-lg border text-left text-xs font-bold transition flex items-center gap-2 ${
                      formDirection === 'IN'
                        ? 'bg-teal-50 border-teal-500 text-teal-900 ring-1 ring-teal-400'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>🟢</span>
                    <div>
                      <div>Audit Surplus (+IN)</div>
                      <div className="text-[10px] font-normal text-slate-500">Physical count exceeds system</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Farm & Medicine */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Farm *</label>
                  <select
                    value={formFarm}
                    onChange={(e) => setFormFarm(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">Select Farm...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Medicine *</label>
                  <select
                    value={formMedicine}
                    onChange={(e) => setFormMedicine(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">Select Medicine...</option>
                    {medicines.map((m) => (
                      <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Batch Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Target Batch *
                </label>
                <select
                  value={formBatch}
                  onChange={(e) => setFormBatch(e.target.value)}
                  required
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none font-mono"
                >
                  <option value="">Select Batch...</option>
                  {availableBatches.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.batchNumber} (Current on-shelf: {b.quantityAvailable}, Exp: {b.expiryDate})
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity & Reason */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Quantity to {formDirection === 'IN' ? 'Add' : 'Deduct'} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={formDirection === 'OUT' ? selectedBatchObj?.quantityAvailable || 999999 : 999999}
                    required
                    placeholder="e.g. 2"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-mono font-bold text-slate-800 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  />
                  {formDirection === 'OUT' && selectedBatchObj && (
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Max available: {selectedBatchObj.quantityAvailable}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Reason *</label>
                  <select
                    value={formReason}
                    onChange={(e) => setFormReason(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">Select Reason...</option>
                    {formDirection === 'OUT' ? (
                      <>
                        <option value="Accidental bottle breakage in storage cabinet">Bottle breakage in storage</option>
                        <option value="Seal leakage / defect during handling">Seal leakage during handling</option>
                        <option value="Physical audit count shortage">Physical audit count shortage</option>
                        <option value="Contaminated / unusable bottle">Contaminated bottle</option>
                      </>
                    ) : (
                      <>
                        <option value="Physical audit surplus / count recount">Physical audit surplus count</option>
                        <option value="Previously missed receipt entered">Previously missed receipt entered</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Witness & Date */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Auditor / Witness (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Manager Amit / Internal Auditor"
                    value={formWitness}
                    onChange={(e) => setFormWitness(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Audit Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Broken during shelf reorganization in cold room"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-teal-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 h-8 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formBatch}
                  className="px-4 h-8 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Applying Adjustment...' : '✓ Post Audit Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: BIOSECURE SAFE DISPOSAL WRITE-OFF */}
      {activeModal === 'DISPOSAL' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 py-3 bg-rose-50 border-b border-rose-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                  <span>🔥</span> Biosecure Safe Disposal (Write-Off)
                </h3>
                <p className="text-[11px] text-rose-700">
                  Permanently dispose of expired, spoiled, or contaminated medicines
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3.5">
              {error && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs font-semibold">
                  ⚠ {error}
                </div>
              )}

              {/* Farm & Medicine */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Farm *</label>
                  <select
                    value={formFarm}
                    onChange={(e) => setFormFarm(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  >
                    <option value="">Select Farm...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Medicine *</label>
                  <select
                    value={formMedicine}
                    onChange={(e) => setFormMedicine(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  >
                    <option value="">Select Medicine...</option>
                    {medicines.map((m) => (
                      <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Batch Selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Batch to Dispose *
                </label>
                <select
                  value={formBatch}
                  onChange={(e) => {
                    setFormBatch(e.target.value);
                    const b = availableBatches.find((item) => item._id === e.target.value);
                    if (b) setFormQty(b.quantityAvailable);
                  }}
                  required
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none font-mono"
                >
                  <option value="">Select Batch...</option>
                  {availableBatches.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.batchNumber} (Available: {b.quantityAvailable}, Expiry: {b.expiryDate})
                    </option>
                  ))}
                </select>
              </div>

              {/* Disposal Method & Quantity */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Disposal Method *
                  </label>
                  <select
                    value={formDisposalMethod}
                    onChange={(e) => setFormDisposalMethod(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  >
                    <option value="INCINERATION">Incineration (High Heat)</option>
                    <option value="DEEP_BURIAL">Deep Burial with Lime Pit</option>
                    <option value="RETURN_TO_SUPPLIER">Return to Vendor/Supplier</option>
                    <option value="BIO_HAZARD_DISPOSAL">Certified Biohazard Contractor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Quantity to Dispose *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedBatchObj?.quantityAvailable || 999999}
                    required
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-mono font-bold text-rose-800 focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                  {selectedBatchObj && (
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Max available: {selectedBatchObj.quantityAvailable} {selectedMed?.unit}
                    </span>
                  )}
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Disposal Reason *</label>
                <select
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  required
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                >
                  <option value="">Select Reason...</option>
                  <option value="Expired shelf life (Passed expiration date)">Expired shelf life</option>
                  <option value="Cold chain breakdown / Vaccine refrigerator temperature excursion">Cold chain failure (Spoiled vaccines)</option>
                  <option value="Contamination or precipitate formation">Visible contamination / precipitate</option>
                  <option value="Regulatory drug recall / Supplier advisory">Supplier drug recall</option>
                </select>
              </div>

              {/* Mandatory Witness & Date */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-rose-800 uppercase mb-1">
                    Mandatory Witness *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. Verma (Veterinarian)"
                    value={formWitness}
                    onChange={(e) => setFormWitness(e.target.value)}
                    className="w-full h-8 px-2 border border-rose-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-400 block mt-0.5">Biosecurity requires dual verification</span>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Disposal Date *</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Incinerated in farm pit following biosecurity protocol"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full h-8 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-rose-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="px-3 h-8 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formBatch}
                  className="px-4 h-8 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Writing Off...' : '🔥 Confirm Safe Disposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DETAILS VIEW */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800">
                Adjustment Record: {selectedDetail.adjustmentNumber}
              </h3>
              <button
                onClick={() => setSelectedDetail(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                ✕
                
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Type</span>
                  <span className="font-bold text-slate-800">
                    {TYPE_BADGES[selectedDetail.type]?.label || selectedDetail.type}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Date</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetail.adjustmentDate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Farm</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetail.farm?.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Origin Shed</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetail.shed || 'Central Store'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">M
                    edicine</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetail.medicine?.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Batch Number</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedDetail.batchNumber}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Adjusted Quantity</span>
                  <span className={`font-bold text-sm ${TYPE_BADGES[selectedDetail.type]?.qtyColor}`}>
                    {TYPE_BADGES[selectedDetail.type]?.sign}{selectedDetail.quantity} {selectedDetail.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Disposal Method</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetail.disposalMethod || 'N/A'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[10px]">Reason</span>
                <div className="p-2.5 bg-slate-100 rounded text-slate-800 font-medium">
                  {selectedDetail.reason}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-slate-400 text-[10px] block">Recorded By</span>
                  <strong>{selectedDetail.adjustedBy?.name || selectedDetail.adjustedBy?.username}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Auditor / Witness</span>
                  <strong>{selectedDetail.witnessedBy || 'None'}</strong>
                </div>
              </div>

              {selectedDetail.remarks && (
                <div className="pt-2 border-t border-slate-100 text-slate-500 italic">
                  Remarks: {selectedDetail.remarks}
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDetail(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
