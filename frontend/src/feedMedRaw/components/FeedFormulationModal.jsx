import { useState, useEffect, useMemo } from 'react';
import { createFormulationApi, updateFormulationApi } from '../api/feedFormulationApi.js';

const FEED_TYPES = [
  'CHICKS',
  'GROWER',
  'DEVELOPER',
  'PRE-BREEDER',
  'PHASE-1',
  'PHASE-2',
  'PHASE-3',
  'OTHER',
];

const CONSUMED_BY_OPTIONS = ['ALL BIRDS', 'FEMALE', 'MALE'];

export default function FeedFormulationModal({
  isOpen,
  onClose,
  onSaved,
  editingFormulation = null,
  masterItems = [], // All Raw Materials and Feed Medicines from catalog
}) {
  const [feedName, setFeedName] = useState('');
  const [feedType, setFeedType] = useState('PHASE-2');
  const [consumedBy, setConsumedBy] = useState('ALL BIRDS');
  const [flockName, setFlockName] = useState('All Flocks');
  const [targetBatchSize, setTargetBatchSize] = useState(1000);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Group master items for quick selection
  const rawMaterials = useMemo(
    () => masterItems.filter((i) => i.itemType === 'Raw Material' && i.isActive !== false),
    [masterItems]
  );
  const feedMedicines = useMemo(
    () => masterItems.filter((i) => i.itemType === 'Feed Medicine' && i.isActive !== false),
    [masterItems]
  );

  // Initialize or reset form
  useEffect(() => {
    if (editingFormulation) {
      setFeedName(editingFormulation.feedName || '');
      setFeedType(editingFormulation.feedType || 'PHASE-2');
      setConsumedBy(editingFormulation.consumedBy || 'ALL BIRDS');
      setFlockName(editingFormulation.flockName || 'All Flocks');
      setTargetBatchSize(editingFormulation.targetBatchSize || 1000);
      setStartDate(editingFormulation.startDate ? editingFormulation.startDate.slice(0, 10) : '');
      setEndDate(editingFormulation.endDate ? editingFormulation.endDate.slice(0, 10) : '');
      setNotes(editingFormulation.notes || '');
      setItems(
        editingFormulation.items && editingFormulation.items.length > 0
          ? editingFormulation.items.map((it) => ({
              itemId: it.itemId?._id || it.itemId || '',
              itemType: it.itemType || 'Raw Material',
              itemName: it.itemName || '',
              quantity: it.quantity || '',
              percentage: it.percentage || 0,
              uom: it.uom || 'kg',
            }))
          : [
              { itemId: '', itemType: 'Raw Material', itemName: '', quantity: '', percentage: 0, uom: 'kg' },
              { itemId: '', itemType: 'Feed Medicine', itemName: '', quantity: '', percentage: 0, uom: 'kg' },
            ]
      );
    } else {
      setFeedName('');
      setFeedType('PHASE-2');
      setConsumedBy('ALL BIRDS');
      setFlockName('All Flocks');
      setTargetBatchSize(1000);
      setStartDate('');
      setEndDate('');
      setNotes('');
      // Default with 2 empty rows ready for input
      setItems([
        { itemId: '', itemType: 'Raw Material', itemName: '', quantity: '', percentage: 0, uom: 'kg' },
        { itemId: '', itemType: 'Feed Medicine', itemName: '', quantity: '', percentage: 0, uom: 'kg' },
      ]);
    }
    setError('');
  }, [editingFormulation, isOpen]);

  // Calculate live total weight and remaining kg
  const totalWeight = useMemo(() => {
    const sum = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    return Number(sum.toFixed(3));
  }, [items]);

  const batchDiff = Number((targetBatchSize - totalWeight).toFixed(3));
  const isPerfectBatch = Math.abs(batchDiff) < 0.001;
  const isUnderweight = batchDiff > 0.001;
  const isOverweight = batchDiff < -0.001;

  // Add a new blank ingredient row
  const handleAddRow = (preferredType = 'Raw Material') => {
    setItems((prev) => [
      ...prev,
      {
        itemId: '',
        itemType: preferredType,
        itemName: '',
        quantity: '',
        percentage: 0,
        uom: 'kg',
      },
    ]);
  };

  // Remove an ingredient row
  const handleRemoveRow = (index) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Change row's item type (Raw Material vs Feed Medicine)
  const handleItemTypeChange = (index, newType) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        itemType: newType,
        itemId: '',
        itemName: '',
      };
      return copy;
    });
  };

  // Change selected item
  const handleItemSelect = (index, selectedId) => {
    const selected = masterItems.find((m) => m._id === selectedId);
    if (!selected) return;

    setItems((prev) => {
      const copy = [...prev];
      const qty = Number(copy[index].quantity) || 0;
      const pct = targetBatchSize > 0 ? Number(((qty / targetBatchSize) * 100).toFixed(2)) : 0;
      copy[index] = {
        ...copy[index],
        itemId: selected._id,
        itemType: selected.itemType,
        itemName: selected.name,
        percentage: pct,
        uom: 'kg',
      };
      return copy;
    });
  };

  // Change quantity of an ingredient
  const handleQuantityChange = (index, value) => {
    const qty = value === '' ? '' : Number(value);
    setItems((prev) => {
      const copy = [...prev];
      const numericQty = Number(qty) || 0;
      const pct = targetBatchSize > 0 ? Number(((numericQty / targetBatchSize) * 100).toFixed(2)) : 0;
      copy[index] = {
        ...copy[index],
        quantity: qty,
        percentage: pct,
      };
      return copy;
    });
  };

  // Submit Formulation
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      if (!feedName.trim()) {
        throw new Error('Please enter a Feed / Formulation Name.');
      }

      // Filter out empty rows
      const validItems = items.filter((it) => it.itemId && Number(it.quantity) > 0);
      if (validItems.length === 0) {
        throw new Error('Please select at least one ingredient with a quantity greater than 0 kg.');
      }

      const payload = {
        feedName: feedName.trim(),
        feedType,
        consumedBy,
        flockName: flockName.trim() || 'All Flocks',
        targetBatchSize: Number(targetBatchSize) || 1000,
        startDate: startDate || null,
        endDate: endDate || null,
        items: validItems,
        notes: notes.trim(),
      };

      if (editingFormulation) {
        await updateFormulationApi(editingFormulation._id, payload);
      } else {
        await createFormulationApi(payload);
      }

      onSaved?.();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save formulation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-150 my-auto cursor-default max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl">🥣</span>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                {editingFormulation
                  ? `Edit Formulation (${editingFormulation.bomNumber || 'BOM'})`
                  : 'Add New Feed Formulation (BOM)'}
              </h3>
              <p className="text-[11px] text-slate-500">
                1 Ton (1,000 kg) Standard Poultry Feed Recipe
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold text-xl leading-none p-1.5 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-3 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
              ⚠ {error}
            </div>
          )}

          {/* Section 1: Recipe Meta Information */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            {/* Feed Name */}
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Feed / Formulation Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                placeholder="e.g. SANJANA BP-10 / Layer Phase-2 High Yield"
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                className="w-full h-8 sm:h-9 px-3 border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
              />
            </div>

            {/* Feed Stage / Type */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Feed Stage / Type <span className="text-rose-500">*</span>
              </label>
              <select
                value={feedType}
                onChange={(e) => setFeedType(e.target.value)}
                className="w-full h-8 sm:h-9 px-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
              >
                {FEED_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Consumed By */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Consumed By
              </label>
              <select
                value={consumedBy}
                onChange={(e) => setConsumedBy(e.target.value)}
                className="w-full h-8 sm:h-9 px-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
              >
                {CONSUMED_BY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === 'FEMALE' ? 'FEMALE (मुर्गी)' : opt === 'MALE' ? 'MALE (मुर्गा)' : 'ALL BIRDS'}
                  </option>
                ))}
              </select>
            </div>

            {/* Flock Assigned */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Flock Assigned
              </label>
              <input
                type="text"
                placeholder="e.g. All Flocks / Flock A"
                value={flockName}
                onChange={(e) => setFlockName(e.target.value)}
                className="w-full h-8 sm:h-9 px-3 border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
              />
            </div>

            {/* Target Batch Size */}
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Standard Batch Size
              </label>
              <div className="flex items-center h-8 sm:h-9 px-3 border border-slate-200 rounded-lg bg-slate-100 text-xs font-mono font-bold text-slate-700 justify-between">
                <span>{targetBatchSize}</span>
                <span className="text-emerald-700 font-sans text-[11px]">kg (1 Ton)</span>
              </div>
            </div>
          </div>

          {/* Section 2: Dynamic Ingredients Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📋</span>
                  <span>Formula Ingredients (BOM)</span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    ({items.length} items)
                  </span>
                </h4>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddRow('Raw Material')}
                  className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <span>+</span> <span>🌾 Raw Material</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRow('Feed Medicine')}
                  className="px-2.5 py-1 bg-purple-50 text-purple-900 border border-purple-200 hover:bg-purple-100 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <span>+</span> <span>💊 Feed Medicine</span>
                </button>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="py-2 px-2.5 w-10 text-center">#</th>
                    <th className="py-2 px-2.5 w-28 sm:w-32">Type</th>
                    <th className="py-2 px-2.5">Ingredient Name (from Master)</th>
                    <th className="py-2 px-2.5 w-24 sm:w-28 text-right">Qty (kg)</th>
                    <th className="py-2 px-2.5 w-16 sm:w-20 text-center hidden sm:table-cell">% Ratio</th>
                    <th className="py-2 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                        No ingredients added yet. Click &quot;+ Raw Material&quot; or &quot;+ Feed Medicine&quot; above.
                      </td>
                    </tr>
                  ) : (
                    items.map((row, idx) => {
                      const availableList = row.itemType === 'Raw Material' ? rawMaterials : feedMedicines;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          {/* Row Number */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Item Type Switcher */}
                          <td className="py-2 px-2.5">
                            <select
                              value={row.itemType}
                              onChange={(e) => handleItemTypeChange(idx, e.target.value)}
                              className={`w-full h-7 px-1.5 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                                row.itemType === 'Raw Material'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-purple-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <option value="Raw Material">🌾 Raw Material</option>
                              <option value="Feed Medicine">💊 Feed Med</option>
                            </select>
                          </td>

                          {/* Ingredient Picker from Master */}
                          <td className="py-2 px-2.5">
                            <select
                              value={row.itemId}
                              onChange={(e) => handleItemSelect(idx, e.target.value)}
                              className="w-full h-7 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                            >
                              <option value="">-- Choose {row.itemType} --</option>
                              {availableList.map((m) => (
                                <option key={m._id} value={m._id}>
                                  {m.code ? `[${m.code}] ` : ''}{m.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Quantity (kg) */}
                          <td className="py-2 px-2.5 text-right">
                            <div className="relative inline-block w-full">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                required
                                placeholder="0.0"
                                value={row.quantity}
                                onChange={(e) => handleQuantityChange(idx, e.target.value)}
                                className="w-full h-7 px-2 pr-6 border border-slate-300 rounded-md text-xs font-mono font-bold text-right text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                              />
                              <span className="absolute right-2 top-1.5 text-[10px] text-slate-400 font-bold pointer-events-none">
                                kg
                              </span>
                            </div>
                          </td>

                          {/* Percentage % */}
                          <td className="py-2 px-2.5 text-center hidden sm:table-cell font-mono text-[11px] text-slate-600 font-semibold">
                            {row.percentage}%
                          </td>

                          {/* Delete Row */}
                          <td className="py-2 px-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveRow(idx)}
                              className="text-slate-300 hover:text-rose-600 p-1 rounded transition hover:bg-rose-50 cursor-pointer text-sm"
                              title="Remove item"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* LIVE BATCH VALIDATOR BANNER */}
            <div
              className={`p-3 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-semibold shadow-2xs transition-all ${
                isPerfectBatch
                  ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                  : isUnderweight
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-rose-50 text-rose-900 border-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg">
                  {isPerfectBatch ? '🟢' : isUnderweight ? '🟡' : '🔴'}
                </span>
                <div>
                  <div className="font-bold">
                    Total Formula Weight: <span className="font-mono">{totalWeight} kg</span> /{' '}
                    <span className="font-mono">{targetBatchSize} kg</span> ({((totalWeight / targetBatchSize) * 100).toFixed(1)}%)
                  </div>
                  <div className="text-[11px] font-medium opacity-90">
                    {isPerfectBatch && '✓ Exact 1 Ton (1,000 kg) batch size reached. Ready for production!'}
                    {isUnderweight && `Missing ${batchDiff} kg to reach exact 1,000 kg batch.`}
                    {isOverweight && `Batch exceeds 1,000 kg by ${Math.abs(batchDiff)} kg.`}
                  </div>
                </div>
              </div>

              <div className="shrink-0 font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-white/80 border border-current shadow-2xs">
                {isPerfectBatch ? '100.00% BALANCED' : `${((totalWeight / targetBatchSize) * 100).toFixed(2)}% TOTAL`}
              </div>
            </div>
          </div>

          {/* Section 3: Validity Dates & Formulation Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Start Date (Effective From)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                End Date (Valid Until)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                Nutritionist Notes (opt)
              </label>
              <input
                type="text"
                placeholder="e.g. Higher protein for winter"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
              />
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>{submitting ? 'Saving Recipe...' : editingFormulation ? 'Update Formulation' : 'Save Formulation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
