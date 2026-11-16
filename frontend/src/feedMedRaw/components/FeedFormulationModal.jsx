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

  // Bulk Multi-Select state
  const [bulkPickerType, setBulkPickerType] = useState(null); // 'Raw Material' | 'Feed Medicine' | null
  const [bulkSearch, setBulkSearch] = useState('');
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);

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
              quantity: it.quantity ?? '',
              percentage: it.percentage || 0,
              uom: it.uom || 'kg',
            }))
          : []
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
      setItems([]);
    }
    setError('');
    setBulkPickerType(null);
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

  // Clear all items
  const handleClearAll = () => {
    if (items.length > 0 && window.confirm('Are you sure you want to clear all ingredients?')) {
      setItems([]);
    }
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

  // ========================================================
  // BULK MULTI-SELECT HANDLERS
  // ========================================================
  const handleOpenBulkPicker = (type) => {
    setBulkPickerType(type);
    setBulkSearch('');
    // Pre-select items of this type that are already in the formula
    const alreadySelected = items
      .filter((it) => it.itemType === type && it.itemId)
      .map((it) => it.itemId.toString());
    setBulkSelectedIds(alreadySelected);
  };

  const handleToggleBulkItem = (id) => {
    setBulkSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllBulk = (candidateList) => {
    const candidateIds = candidateList.map((c) => c._id.toString());
    const allSelected = candidateIds.every((id) => bulkSelectedIds.includes(id));
    if (allSelected) {
      // Deselect these candidates
      setBulkSelectedIds((prev) => prev.filter((id) => !candidateIds.includes(id)));
    } else {
      // Add all candidateIds
      setBulkSelectedIds((prev) => Array.from(new Set([...prev, ...candidateIds])));
    }
  };

  const handleApplyBulkSelection = () => {
    // Preserve existing quantities that were already typed
    const existingQtyMap = new Map();
    items.forEach((it) => {
      if (it.itemId) {
        existingQtyMap.set(it.itemId.toString(), it.quantity);
      }
    });

    // Keep items of the other type
    const otherTypeItems = items.filter(
      (it) => it.itemType !== bulkPickerType && it.itemId
    );

    // Build the updated list for the chosen type
    const candidateMaster = bulkPickerType === 'Raw Material' ? rawMaterials : feedMedicines;
    const selectedMasterItems = bulkSelectedIds
      .map((id) => candidateMaster.find((m) => m._id.toString() === id))
      .filter(Boolean);

    const updatedCurrentItems = selectedMasterItems.map((m) => {
      const preservedQty = existingQtyMap.get(m._id.toString()) ?? '';
      const numQty = Number(preservedQty) || 0;
      const pct = targetBatchSize > 0 ? Number(((numQty / targetBatchSize) * 100).toFixed(2)) : 0;
      return {
        itemId: m._id,
        itemType: m.itemType,
        itemName: m.name,
        quantity: preservedQty,
        percentage: pct,
        uom: 'kg',
      };
    });

    // Combine: Raw Materials first, then Feed Medicines
    let combined;
    if (bulkPickerType === 'Raw Material') {
      combined = [...updatedCurrentItems, ...otherTypeItems];
    } else {
      combined = [...otherTypeItems, ...updatedCurrentItems];
    }

    setItems(combined);
    setBulkPickerType(null);
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

  // Items for bulk picker dialog
  const currentBulkCandidates = bulkPickerType === 'Raw Material' ? rawMaterials : feedMedicines;
  const filteredBulkCandidates = currentBulkCandidates.filter((c) => {
    if (!bulkSearch.trim()) return true;
    const q = bulkSearch.trim().toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q) ||
      c.aliasName?.toLowerCase().includes(q)
    );
  });
  const allFilteredSelected =
    filteredBulkCandidates.length > 0 &&
    filteredBulkCandidates.every((c) => bulkSelectedIds.includes(c._id.toString()));

  const rawMaterialsInFormulaCount = items.filter((i) => i.itemType === 'Raw Material' && i.itemId).length;
  const feedMedicinesInFormulaCount = items.filter((i) => i.itemType === 'Feed Medicine' && i.itemId).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-150 my-auto cursor-default max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
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

          {/* Section 2: Dynamic Ingredients Table with Multi-Select Pickers */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>📋</span>
                  <span>Formula Ingredients (BOM)</span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    ({items.length} items)
                  </span>
                </h4>
              </div>

              {/* Action Buttons: Multi-Select Pickers */}
              <div className="flex items-center flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenBulkPicker('Raw Material')}
                  className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Select multiple Raw Materials from catalog"
                >
                  <span>🌾</span>
                  <span>Select Raw Materials</span>
                  {rawMaterialsInFormulaCount > 0 && (
                    <span className="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                      {rawMaterialsInFormulaCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenBulkPicker('Feed Medicine')}
                  className="px-2.5 py-1 bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Select multiple Feed Medicines / Premixes from catalog"
                >
                  <span>💊</span>
                  <span>Select Feed Medicine</span>
                  {feedMedicinesInFormulaCount > 0 && (
                    <span className="bg-purple-200 text-purple-900 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                      {feedMedicinesInFormulaCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleAddRow('Raw Material')}
                  className="px-2 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                  title="Add single custom row"
                >
                  + 1 Row
                </button>

                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold px-1.5 py-1 hover:bg-rose-50 rounded transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Ingredients Table */}
            {items.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                <div className="text-3xl mb-2">🥣</div>
                <p className="text-xs font-bold text-slate-700">No ingredients in this formulation yet</p>
                <p className="text-[11px] text-slate-500 mt-1 mb-4">
                  Select multiple items at once from your catalog to instantly build your recipe:
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenBulkPicker('Raw Material')}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>🌾</span> <span>+ Select Raw Materials</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBulkPicker('Feed Medicine')}
                    className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <span>💊</span> <span>+ Select Feed Medicines</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="py-2 px-2.5 w-10 text-center">#</th>
                      <th className="py-2 px-2.5 w-28 sm:w-32">Type</th>
                      <th className="py-2 px-2.5 min-w-[200px]">Ingredient Name (from Master)</th>
                      <th className="py-2 px-2.5 w-28 sm:w-32 text-right">Qty (kg)</th>
                      <th className="py-2 px-2.5 w-20 text-center hidden sm:table-cell">% Ratio</th>
                      <th className="py-2 px-2 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((row, idx) => {
                      const availableList = row.itemType === 'Raw Material' ? rawMaterials : feedMedicines;
                      return (
                        <tr key={idx} className="hover:bg-slate-50/80 transition">
                          {/* Row Number */}
                          <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Item Type Badge / Switcher */}
                          <td className="py-2 px-2.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                row.itemType === 'Raw Material'
                                  ? 'bg-amber-50 text-amber-900 border-amber-200'
                                  : 'bg-purple-50 text-purple-900 border-purple-200'
                              }`}
                            >
                              <span>{row.itemType === 'Raw Material' ? '🌾' : '💊'}</span>
                              <span>{row.itemType === 'Raw Material' ? 'Raw Mat' : 'Feed Med'}</span>
                            </span>
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
                    })}
                  </tbody>
                </table>
              </div>
            )}

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

      {/* ======================================================== */}
      {/* BULK MULTI-SELECT PICKER MODAL (OVERLAY)                 */}
      {/* ======================================================== */}
      {bulkPickerType && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-2xs p-3 animate-in fade-in duration-100"
          onClick={() => setBulkPickerType(null)}
        >
          <div
            className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`px-4 py-3 border-b border-slate-200 flex items-center justify-between ${
                bulkPickerType === 'Raw Material'
                  ? 'bg-gradient-to-r from-amber-50 to-orange-50'
                  : 'bg-gradient-to-r from-purple-50 to-indigo-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">
                  {bulkPickerType === 'Raw Material' ? '🌾' : '💊'}
                </span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    Select {bulkPickerType === 'Raw Material' ? 'Raw Materials' : 'Feed Medicines'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Check any items to add them in bulk to your formulation.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkPickerType(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-lg p-1 rounded-lg hover:bg-white/80 transition cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Search & Quick Controls */}
            <div className="p-3 border-b border-slate-200 bg-slate-50 space-y-2">
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  autoFocus
                  placeholder={`Search ${bulkPickerType.toLowerCase()}s by name or code...`}
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                  className="w-full h-8 pl-8 pr-7 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {bulkSearch && (
                  <button
                    type="button"
                    onClick={() => setBulkSearch('')}
                    className="absolute right-2 top-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectAllBulk(filteredBulkCandidates)}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-900 transition cursor-pointer"
                >
                  {allFilteredSelected ? 'Deselect All' : `Select All (${filteredBulkCandidates.length})`}
                </button>
                <span className="text-[11px] font-semibold text-slate-500">
                  {bulkSelectedIds.length} item{bulkSelectedIds.length === 1 ? '' : 's'} selected
                </span>
              </div>
            </div>

            {/* Items Checklist List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 divide-y divide-slate-100">
              {filteredBulkCandidates.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs italic">
                  No {bulkPickerType.toLowerCase()}s match &quot;{bulkSearch}&quot;
                </div>
              ) : (
                filteredBulkCandidates.map((c) => {
                  const isChecked = bulkSelectedIds.includes(c._id.toString());
                  const alreadyInFormula = items.some(
                    (it) => it.itemId && it.itemId.toString() === c._id.toString()
                  );

                  return (
                    <label
                      key={c._id}
                      className={`flex items-center justify-between p-2 rounded-xl transition cursor-pointer border ${
                        isChecked
                          ? bulkPickerType === 'Raw Material'
                            ? 'bg-amber-50/80 border-amber-300'
                            : 'bg-purple-50/80 border-purple-300'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleBulkItem(c._id.toString())}
                          className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                              {c.code || '---'}
                            </span>
                            <span className="font-bold text-xs text-slate-800 truncate">
                              {c.name}
                            </span>
                          </div>
                          {c.aliasName && (
                            <p className="text-[10px] text-slate-400 truncate mt-0.5">
                              Alias: {c.aliasName}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1.5">
                        {alreadyInFormula && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            In Recipe
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {c.uom || 'kg'}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Bulk Picker Footer */}
            <div className="p-3 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                onClick={() => setBulkPickerType(null)}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold hover:bg-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulkSelection}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1"
              >
                <span>+</span>
                <span>
                  Add Selected ({bulkSelectedIds.length} {bulkPickerType === 'Raw Material' ? 'Raw Mat' : 'Medicine'})
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
