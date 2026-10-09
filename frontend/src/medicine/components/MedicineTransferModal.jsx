import React, { useState, useEffect, useMemo } from 'react';
import { createMedicineTransfer, fetchAvailableStockForTransfer } from '../api/transferApi.js';

export default function MedicineTransferModal({
  isOpen,
  onClose,
  firms = [],
  currentFarmId = '',
  onSuccess,
}) {
  const [fromFarm, setFromFarm] = useState(currentFarmId || (firms[0]?._id || ''));
  const [toFarm, setToFarm] = useState('');

  // Live stock fetched from backend for fromFarm
  const [farmBatches, setFarmBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Medicine & Multi-Batch selection state
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [batchAllocations, setBatchAllocations] = useState({});
  const [personName, setPersonName] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Keep fromFarm updated when currentFarmId or firms change
  useEffect(() => {
    if (currentFarmId) {
      setFromFarm(currentFarmId);
    } else if (firms.length > 0 && !fromFarm) {
      setFromFarm(firms[0]._id);
    }
  }, [currentFarmId, firms]);

  // Set default toFarm to first alternative farm
  useEffect(() => {
    if (fromFarm && firms.length > 1) {
      const other = firms.find((f) => f._id !== fromFarm);
      if (other && (!toFarm || toFarm === fromFarm)) {
        setToFarm(other._id);
      }
    }
  }, [fromFarm, firms, toFarm]);

  // Load live stock batches whenever fromFarm changes or modal opens
  useEffect(() => {
    if (!isOpen || !fromFarm) return;

    let isMounted = true;
    async function loadStock() {
      setLoadingBatches(true);
      setFetchError('');
      try {
        const res = await fetchAvailableStockForTransfer(fromFarm);
        if (isMounted) {
          setFarmBatches(res.batches || []);
        }
      } catch (err) {
        if (isMounted) {
          setFetchError(err.message || 'Failed to load stock for selected farm.');
          setFarmBatches([]);
        }
      } finally {
        if (isMounted) setLoadingBatches(false);
      }
    }

    loadStock();
    // Reset selection when fromFarm changes
    setSelectedMedicineId('');
    setBatchAllocations({});

    return () => {
      isMounted = false;
    };
  }, [isOpen, fromFarm]);

  // Group fetched batches by Medicine
  const availableMedicines = useMemo(() => {
    const map = new Map();
    farmBatches.forEach((b) => {
      const med = b.medicine;
      if (!med || !med._id) return;
      const medId = med._id.toString();

      if (!map.has(medId)) {
        map.set(medId, {
          _id: medId,
          name: med.name,
          aliasName: med.aliasName,
          unit: med.unit || b.unit,
          category: med.category,
          totalAvailable: 0,
          batches: [],
        });
      }

      const item = map.get(medId);
      item.totalAvailable += Number(b.quantityAvailable || 0);
      item.batches.push(b);
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [farmBatches]);

  // Active medicine object
  const selectedMedicine = useMemo(() => {
    return availableMedicines.find((m) => m._id === selectedMedicineId);
  }, [availableMedicines, selectedMedicineId]);

  // Batches for the currently selected medicine
  const medicineBatches = useMemo(() => {
    if (!selectedMedicine) return [];
    return selectedMedicine.batches.sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));
  }, [selectedMedicine]);

  // Batches that have a quantity entered > 0
  const activeSelectedBatches = useMemo(() => {
    return medicineBatches.filter((b) => Number(batchAllocations[b._id]) > 0);
  }, [medicineBatches, batchAllocations]);

  // Total quantity selected across all batches
  const totalTransferQty = useMemo(() => {
    return activeSelectedBatches.reduce(
      (sum, b) => sum + Number(batchAllocations[b._id] || 0),
      0
    );
  }, [activeSelectedBatches, batchAllocations]);

  // Are all batches currently filled at max available?
  const isAllSelected = useMemo(() => {
    if (medicineBatches.length === 0) return false;
    return medicineBatches.every(
      (b) => Number(batchAllocations[b._id]) === Number(b.quantityAvailable)
    );
  }, [medicineBatches, batchAllocations]);

  // Auto-fill all batches or clear all
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setBatchAllocations({});
    } else {
      const next = {};
      medicineBatches.forEach((b) => {
        next[b._id] = String(b.quantityAvailable);
      });
      setBatchAllocations(next);
    }
  };

  // Toggle single batch checkbox
  const handleToggleBatch = (batch) => {
    setBatchAllocations((prev) => {
      const current = Number(prev[batch._id] || 0);
      if (current > 0) {
        const next = { ...prev };
        delete next[batch._id];
        return next;
      } else {
        return {
          ...prev,
          [batch._id]: String(batch.quantityAvailable),
        };
      }
    });
  };

  // Change quantity for a specific batch
  const handleBatchQtyChange = (batchId, value, maxVal) => {
    const num = Number(value);
    const validVal = isNaN(num) || num < 0 ? '' : num > maxVal ? String(maxVal) : value;
    setBatchAllocations((prev) => ({
      ...prev,
      [batchId]: validVal,
    }));
  };

  // Switch sender farm
  const handleFromFarmChange = (newFrom) => {
    setFromFarm(newFrom);
    if (toFarm === newFrom) {
      const other = firms.find((f) => f._id !== newFrom);
      setToFarm(other ? other._id : '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!fromFarm || !toFarm) {
      setError('Please select both source and destination farms.');
      return;
    }
    if (fromFarm === toFarm) {
      setError('Source and destination farms cannot be identical.');
      return;
    }
    if (!selectedMedicineId) {
      setError('Please select a medicine.');
      return;
    }

    const items = medicineBatches
      .filter((b) => Number(batchAllocations[b._id]) > 0)
      .map((b) => ({
        sourceBatchId: b._id,
        quantity: Number(batchAllocations[b._id]),
      }));

    if (items.length === 0) {
      setError('Please enter transfer quantity for at least one batch.');
      return;
    }

    // Check individual batch limits
    for (const item of items) {
      const b = medicineBatches.find((mb) => mb._id === item.sourceBatchId);
      if (b && item.quantity > b.quantityAvailable) {
        setError(
          `Batch #${b.batchNumber} exceeds available stock (${b.quantityAvailable} ${b.unit}).`
        );
        return;
      }
    }

    setLoading(true);
    try {
      await createMedicineTransfer({
        fromFarm,
        toFarm,
        items,
        sourceBatchId: items[0]?.sourceBatchId,
        quantity: items[0]?.quantity,
        transportDetails: {
          personName: personName.trim(),
        },
      });

      // Reset form
      setBatchAllocations({});
      setSelectedMedicineId('');
      setPersonName('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to initiate stock transfer.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const senderFirmName = firms.find((f) => f._id === fromFarm)?.name || 'Sender Farm';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      {/* Width reduced by 20% (from max-w-lg to max-w-[410px]) */}
      <div className="bg-white rounded-2xl w-full max-w-[410px] max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-3.5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔄</span>
            <div>
              <h2 className="text-xs font-black tracking-tight">Inter-Firm Stock Transfer</h2>
              <p className="text-[9px] text-blue-100 font-medium">Send medicine with receiver acceptance & hold</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg text-sm font-bold leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-3 overflow-y-auto space-y-2.5 flex-1 text-xs">
          {error && (
            <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 animate-shake">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {fetchError && (
            <div className="p-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px] font-medium flex items-center gap-1.5">
              <span>⚠️</span>
              <span>{fetchError}</span>
            </div>
          )}

          {/* Farm Direction Grid */}
          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200/80">
            {/* From Farm */}
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">
                From (Sender)
              </label>
              <select
                value={fromFarm}
                onChange={(e) => handleFromFarmChange(e.target.value)}
                className="w-full h-7 px-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    🏢 {f.name}
                  </option>
                ))}
              </select>
            </div>

            {/* To Farm */}
            <div>
              <label className="block text-[9px] font-black uppercase text-slate-500 mb-0.5">
                To (Receiver)
              </label>
              <select
                value={toFarm}
                onChange={(e) => setToFarm(e.target.value)}
                className="w-full h-7 px-1.5 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">-- Destination --</option>
                {firms
                  .filter((f) => f._id !== fromFarm)
                  .map((f) => (
                    <option key={f._id} value={f._id}>
                      🏢 {f.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Loading status for batches */}
          {loadingBatches && (
            <div className="p-2.5 bg-blue-50/70 border border-blue-200 text-blue-800 rounded-lg text-[11px] flex items-center justify-center gap-2">
              <span className="animate-spin text-xs">⏳</span>
              <span>Loading medicines for {senderFirmName}...</span>
            </div>
          )}

          {/* Upper Medicine Selection (Only Medicine Name) */}
          {!loadingBatches && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-black uppercase text-slate-700">
                  Select Medicine
                </label>
                {selectedMedicine && (
                  <span className="text-[10px] font-black px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Stock: {selectedMedicine.totalAvailable} {selectedMedicine.unit}
                  </span>
                )}
              </div>

              {availableMedicines.length === 0 ? (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200 text-amber-800 rounded-lg text-[11px]">
                  ℹ No medicines with stock in <strong>{senderFirmName}</strong>.
                </div>
              ) : (
                <select
                  value={selectedMedicineId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedMedicineId(nextId);
                    setBatchAllocations({});
                  }}
                  className="w-full h-8 px-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">-- Choose Medicine --</option>
                  {availableMedicines.map((m) => (
                    <option key={m._id} value={m._id}>
                      💊 {m.name} {m.aliasName ? `(${m.aliasName})` : ''} — Avail: {m.totalAvailable} {m.unit}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Batches Particulars Table (All Batches Selection) */}
          {selectedMedicineId && medicineBatches.length > 0 && (
            <div className="space-y-1 pt-1 animate-in fade-in duration-100">
              <div className="flex items-center justify-between text-[9px] font-black uppercase text-slate-600 px-0.5">
                <span>Available Batches ({medicineBatches.length})</span>
                <button
                  type="button"
                  onClick={handleToggleSelectAll}
                  className="text-blue-600 font-bold hover:underline cursor-pointer lowercase"
                >
                  {isAllSelected ? '✕ clear all' : '✓ select all batches'}
                </button>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
                {/* Table Header with Select All Checkbox */}
                <div className="grid grid-cols-12 text-[9px] font-black uppercase text-slate-500 bg-slate-100/90 px-2 py-1 border-b border-slate-200 items-center">
                  <div className="col-span-4 text-left flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      className="accent-blue-600 w-3 h-3 cursor-pointer rounded shrink-0"
                      title="Select all batches"
                    />
                    <span>BATCH</span>
                  </div>
                  <div className="col-span-3 text-center">EXPIRY</div>
                  <div className="col-span-2 text-center">AVAIL</div>
                  <div className="col-span-3 text-right">TRANSFER</div>
                </div>

                {/* Table Rows */}
                <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                  {medicineBatches.map((b) => {
                    const allocVal = batchAllocations[b._id] ?? '';
                    const isSelected = Number(allocVal) > 0;

                    return (
                      <div
                        key={b._id}
                        className={`grid grid-cols-12 items-center px-2 py-1.5 text-xs transition ${
                          isSelected
                            ? 'bg-blue-50/90 border-l-2 border-blue-600'
                            : 'hover:bg-slate-50/80'
                        }`}
                      >
                        {/* Batch No with Checkbox */}
                        <div className="col-span-4 flex items-center gap-1.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleBatch(b)}
                            className="accent-blue-600 w-3 h-3 cursor-pointer rounded shrink-0"
                            title={`Select/Deselect batch #${b.batchNumber}`}
                          />
                          <span
                            className="font-mono font-bold text-slate-900 text-[11px] truncate cursor-pointer"
                            title={b.batchNumber}
                            onClick={() => handleToggleBatch(b)}
                          >
                            #{b.batchNumber}
                          </span>
                        </div>

                        {/* Expiry Date */}
                        <div className="col-span-3 text-center text-[10px] text-slate-600 font-medium">
                          {b.expiryDate}
                        </div>

                        {/* Available Qty */}
                        <div className="col-span-2 text-center font-bold text-slate-800 text-[11px]">
                          {b.quantityAvailable}
                        </div>

                        {/* Transfer Qty Input with Quick Max */}
                        <div className="col-span-3 flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0.01"
                            max={b.quantityAvailable}
                            step="any"
                            value={allocVal}
                            onChange={(e) => handleBatchQtyChange(b._id, e.target.value, b.quantityAvailable)}
                            placeholder="Qty"
                            className={`w-14 h-7 px-1 text-center font-bold text-xs border rounded bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none no-spinner [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              Number(allocVal) > 0
                                ? 'border-blue-500 bg-blue-50 text-blue-900 ring-1 ring-blue-300'
                                : 'border-slate-300'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleBatchQtyChange(b._id, String(b.quantityAvailable), b.quantityAvailable)}
                            className="text-[9px] text-blue-600 font-bold hover:underline cursor-pointer"
                            title={`Fill max available (${b.quantityAvailable})`}
                          >
                            Max
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total Summary Footer */}
                {totalTransferQty > 0 && (
                  <div className="bg-slate-50 px-2 py-1.5 border-t border-slate-200 flex justify-between items-center text-[11px]">
                    <span className="font-semibold text-slate-600">
                      Selected: <strong>{activeSelectedBatches.length}</strong> batch(es)
                    </span>
                    <span className="font-bold text-blue-700">
                      Total: <span className="text-xs font-black">{totalTransferQty}</span> {selectedMedicine?.unit}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Carried By Person (Optional) */}
          <div>
            <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
              Carried By / Person (Optional)
            </label>
            <input
              type="text"
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder="e.g. Ramesh (Driver / Staff)"
              className="w-full h-7 px-2 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Hold Notice */}
          <div className="bg-amber-50/70 border border-amber-200/80 p-2 rounded-lg text-[9px] text-amber-900 leading-tight flex items-start gap-1.5">
            <span className="text-xs">🔒</span>
            <span>
              <strong>Hold Protection:</strong> Selected stock stays on hold at {senderFirmName} until receiver accepts.
            </span>
          </div>

          {/* Footer buttons */}
          <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || totalTransferQty <= 0}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>
                    Send Transfer {totalTransferQty > 0 ? `(${totalTransferQty} ${selectedMedicine?.unit || ''})` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
