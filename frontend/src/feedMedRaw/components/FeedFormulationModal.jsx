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

// Standard ingredients list from client formulation sheet in exact prescribed order
const DEFAULT_STANDARD_INGREDIENT_NAMES = [
  'Maize',
  'soya',
  'DORB',
  'Marble Powder',
  'Marble Chips',
  'Fish Oil',
  'DCP',
  'Phytase',
  'Salt',
  'Soda',
  'DL - Methionine (DLM)',
  'Lysine',
  'Choline Chloride',
  'Vit. Premix',
  'TM - Altech',
  'Toxisorb',
  'Biofix',
  'Amlycure',
  'Biortronic',
  'HYD',
  'Gallipro',
  'Nargomune',
  'Nausadar',
  'Nspzyme (Kenzyme)',
];

function buildDefaultIngredients(catalog) {
  if (!catalog || catalog.length === 0) return [];
  const matched = [];
  const usedIds = new Set();

  for (const name of DEFAULT_STANDARD_INGREDIENT_NAMES) {
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const item = catalog.find((m) => {
      if (usedIds.has(m._id.toString())) return false;
      const mClean = (m.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const aClean = (m.aliasName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        mClean === clean ||
        mClean.includes(clean) ||
        clean.includes(mClean) ||
        (aClean && (aClean === clean || aClean.includes(clean)))
      );
    });

    if (item) {
      usedIds.add(item._id.toString());
      matched.push({
        itemId: item._id,
        itemType: item.itemType || 'Raw Material',
        itemName: item.name,
        quantity: '',
        percentage: 0,
        uom: item.uom || 'kg',
      });
    }
  }

  return matched;
}

export default function FeedFormulationModal({
  isOpen,
  onClose,
  onSaved,
  editingFormulation = null,
  masterItems = [], // All Raw Materials and Feed Medicines from catalog
  defaultFarm = 'Raghav',
}) {
  const [feedName, setFeedName] = useState('');
  const [farm, setFarm] = useState(defaultFarm || 'Raghav');
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
      setFarm(editingFormulation.farm || defaultFarm || 'Raghav');
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
      setFarm(defaultFarm || 'Raghav');
      setFeedType('PHASE-2');
      setConsumedBy('ALL BIRDS');
      setFlockName('All Flocks');
      setTargetBatchSize(1000);
      setStartDate('');
      setEndDate('');
      setNotes('');
      setItems(buildDefaultIngredients(masterItems));
    }
    setError('');
    setBulkPickerType(null);
  }, [editingFormulation, isOpen, defaultFarm]);

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
        farm: farm || 'All Farms',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-3 overflow-y-auto cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-xl sm:max-w-[620px] rounded-xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto cursor-default max-h-[92vh] sm:max-h-[88vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-3.5 sm:px-4 py-2 sm:py-2.5 border-b border-slate-200 flex justify-between items-center bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg sm:text-xl">🥣</span>
            <div>
              <h3 className="font-bold text-slate-800 text-xs sm:text-sm leading-tight">
                {editingFormulation
                  ? `Edit Formulation (${editingFormulation.bomNumber || 'BOM'})`
                  : 'Add New Feed Formulation (BOM)'}
              </h3>
              <p className="text-[10px] text-slate-500 leading-tight">
                1 Ton (1,000 kg) Standard Poultry Feed Recipe
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 font-bold text-lg leading-none p-1 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
            title="Close"
          >
            &times;
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="p-2.5 sm:p-3.5 overflow-y-auto space-y-2.5 flex-1">
            {error && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
                ⚠ {error}
              </div>
            )}

            {/* Section 1: Recipe Meta Information (Compact 2-Row Grid) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80">
              {/* Feed Name */}
              <div className="sm:col-span-2 md:col-span-4">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Feed / Formulation Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. SANJANA BP-10 / Layer Phase-2 High Yield"
                  value={feedName}
                  onChange={(e) => setFeedName(e.target.value)}
                  className="w-full h-7.5 px-2.5 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                />
              </div>

              {/* Farm / Location */}
              <div className="sm:col-span-2 md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Farm <span className="text-rose-500">*</span>
                </label>
                <select
                  value={farm}
                  onChange={(e) => setFarm(e.target.value)}
                  className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                >
                  <option value="Raghav">Raghav Farm</option>
                  <option value="Sanjana">Sanjana Farm</option>
                </select>
              </div>

              {/* Feed Stage / Type */}
              <div className="sm:col-span-1 md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Feed Stage / Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={feedType}
                  onChange={(e) => setFeedType(e.target.value)}
                  className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                >
                  {FEED_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Consumed By */}
              <div className="sm:col-span-1 md:col-span-1">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Consumed By
                </label>
                <select
                  value={consumedBy}
                  onChange={(e) => setConsumedBy(e.target.value)}
                  className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                >
                  {CONSUMED_BY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Flock Assigned */}
              <div className="sm:col-span-1 md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Flock Assigned
                </label>
                <input
                  type="text"
                  placeholder="e.g. All Flocks / Flock A"
                  value={flockName}
                  onChange={(e) => setFlockName(e.target.value)}
                  className="w-full h-7.5 px-2.5 border border-slate-300 rounded-md text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                />
              </div>

              {/* Target Batch Size */}
              <div className="sm:col-span-1 md:col-span-1">
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Batch Size
                </label>
                <div className="flex items-center h-7.5 px-2 border border-slate-200 rounded-md bg-slate-100 text-xs font-mono font-bold text-slate-700 justify-between">
                  <span>{targetBatchSize}</span>
                  <span className="text-emerald-700 font-sans text-[10px]">kg</span>
                </div>
              </div>
            </div>

            {/* Section 2: Dynamic Ingredients Table with Multi-Select Pickers */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📋</span>
                  <h4 className="text-xs font-bold text-slate-800">
                    Formula Ingredients <span className="text-slate-500 font-normal">({items.length})</span>
                  </h4>
                </div>

                {/* Top Action Buttons (Multi-Select Pickers) */}
                <div className="flex items-center flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenBulkPicker('Raw Material')}
                    className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 rounded-md text-[11px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                    title="Select multiple Raw Materials"
                  >
                    <span>🌾</span>
                    <span>Select Raw Materials</span>
                    {rawMaterialsInFormulaCount > 0 && (
                      <span className="bg-amber-200 text-amber-900 text-[9px] px-1 rounded-full font-mono">
                        {rawMaterialsInFormulaCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenBulkPicker('Feed Medicine')}
                    className="px-2 py-0.5 bg-purple-50 text-purple-900 border border-purple-300 hover:bg-purple-100 rounded-md text-[11px] font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                    title="Select multiple Feed Medicines"
                  >
                    <span>💊</span>
                    <span>Select Feed Medicine</span>
                    {feedMedicinesInFormulaCount > 0 && (
                      <span className="bg-purple-200 text-purple-900 text-[9px] px-1 rounded-full font-mono">
                        {feedMedicinesInFormulaCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleAddRow('Raw Material')}
                    className="px-1.5 py-0.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md text-[11px] font-semibold transition cursor-pointer"
                    title="Add single row"
                  >
                    + 1 Row
                  </button>

                  <button
                    type="button"
                    onClick={() => setItems(buildDefaultIngredients(masterItems))}
                    className="px-1.5 py-0.5 bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-200 rounded-md text-[11px] font-semibold transition cursor-pointer"
                    title="Restore all 24 standard recipe ingredients"
                  >
                    Standard (24)
                  </button>

                  {items.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[10px] text-rose-600 hover:text-rose-800 font-semibold px-1 py-0.5 hover:bg-rose-50 rounded transition cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Ingredients Table or Compact Empty State */}
              {items.length === 0 ? (
                <div className="py-4 px-3 text-center bg-slate-50 border border-dashed border-slate-200 rounded-lg">
                  <span className="text-xl inline-block mb-1">🥣</span>
                  <p className="text-xs font-semibold text-slate-700">No ingredients in this formulation yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 mb-2.5">
                    Click below to load the 24 standard recipe ingredients or use the selectors above.
                  </p>
                  <button
                    type="button"
                    onClick={() => setItems(buildDefaultIngredients(masterItems))}
                    className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-bold transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>📋</span> <span>Load 24 Standard Ingredients</span>
                  </button>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs max-h-56 sm:max-h-64 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-1.5 px-2 w-8 text-center">#</th>
                        <th className="py-1.5 px-2 w-24">Type</th>
                        <th className="py-1.5 px-2 min-w-[160px]">Ingredient Name</th>
                        <th className="py-1.5 px-2 w-24 sm:w-28 text-right">Qty (kg)</th>
                        <th className="py-1.5 px-2 w-16 text-center hidden sm:table-cell">% Ratio</th>
                        <th className="py-1.5 px-1.5 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {items.map((row, idx) => {
                        const availableList = row.itemType === 'Raw Material' ? rawMaterials : feedMedicines;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition">
                            {/* Row Number */}
                            <td className="py-1.5 px-2 text-center font-mono font-bold text-slate-400 text-[10px]">
                              {idx + 1}
                            </td>

                            {/* Item Type Badge */}
                            <td className="py-1.5 px-2">
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-bold border ${
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
                            <td className="py-1.5 px-2">
                              <select
                                value={row.itemId}
                                onChange={(e) => handleItemSelect(idx, e.target.value)}
                                className="w-full h-6.5 px-1.5 border border-slate-300 rounded text-xs font-medium text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                              >
                                <option value="">-- Choose {row.itemType} --</option>
                                {availableList.map((m) => (
                                  <option key={m._id} value={m._id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Quantity (kg) */}
                            <td className="py-1.5 px-2 text-right">
                              <div className="relative inline-block w-full">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  placeholder="0.0"
                                  value={row.quantity}
                                  onChange={(e) => handleQuantityChange(idx, e.target.value)}
                                  className="w-full h-6.5 px-1.5 pr-6 border border-slate-300 rounded text-xs font-mono font-bold text-right text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                                />
                                <span className="absolute right-1.5 top-1 text-[9px] text-slate-400 font-bold pointer-events-none">
                                  kg
                                </span>
                              </div>
                            </td>

                            {/* Percentage % */}
                            <td className="py-1.5 px-2 text-center hidden sm:table-cell font-mono text-[10px] text-slate-600 font-semibold">
                              {row.percentage}%
                            </td>

                            {/* Delete Row */}
                            <td className="py-1.5 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveRow(idx)}
                                className="text-slate-300 hover:text-rose-600 p-0.5 rounded transition hover:bg-rose-50 cursor-pointer text-xs"
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

              {/* LIVE BATCH VALIDATOR BANNER (Compact) */}
              <div
                className={`p-2 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 text-xs font-semibold shadow-2xs transition-all ${
                  isPerfectBatch
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : isUnderweight
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-rose-50 text-rose-900 border-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {isPerfectBatch ? '🟢' : isUnderweight ? '🟡' : '🔴'}
                  </span>
                  <div>
                    <div className="font-bold text-[11px] sm:text-xs">
                      Total Weight: <span className="font-mono">{totalWeight} kg</span> /{' '}
                      <span className="font-mono">{targetBatchSize} kg</span> ({((totalWeight / targetBatchSize) * 100).toFixed(1)}%)
                    </div>
                    <div className="text-[10px] font-medium opacity-90">
                      {isPerfectBatch && '✓ Exact 1 Ton (1,000 kg) batch size reached. Ready for production!'}
                      {isUnderweight && `Missing ${batchDiff} kg to reach exact 1,000 kg batch.`}
                      {isOverweight && `Batch exceeds 1,000 kg by ${Math.abs(batchDiff)} kg.`}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white/80 border border-current shadow-2xs">
                  {isPerfectBatch ? '100.00% BALANCED' : `${((totalWeight / targetBatchSize) * 100).toFixed(2)}% TOTAL`}
                </div>
              </div>
            </div>

            {/* Section 3: Validity Dates & Formulation Notes (Compact) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-0.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5 cursor-pointer">
                  Start Date (Effective From)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.target.showPicker?.();
                    } catch {}
                  }}
                  className="w-full h-7 px-2 border border-slate-300 rounded-md text-xs text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5 cursor-pointer">
                  End Date (Valid Until)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  onClick={(e) => {
                    try {
                      e.target.showPicker?.();
                    } catch {}
                  }}
                  className="w-full h-7 px-2 border border-slate-300 rounded-md text-xs text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-0.5">
                  Nutritionist Notes (opt)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Higher protein for winter"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full h-7 px-2 border border-slate-300 rounded-md text-xs text-slate-700 focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* Fixed Sticky Footer (Always Visible!) */}
          <div className="px-3.5 sm:px-4 py-2 border-t border-slate-200 bg-slate-50/90 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-white transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>💾</span>
              <span>{submitting ? 'Saving...' : editingFormulation ? 'Update Formulation' : 'Save Formulation'}</span>
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
            className="bg-white w-full max-w-md sm:max-w-lg rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[82vh] overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className={`px-3.5 py-2 sm:py-2.5 border-b border-slate-200 flex items-center justify-between ${
                bulkPickerType === 'Raw Material'
                  ? 'bg-gradient-to-r from-amber-50 to-orange-50'
                  : 'bg-gradient-to-r from-purple-50 to-indigo-50'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg">
                  {bulkPickerType === 'Raw Material' ? '🌾' : '💊'}
                </span>
                <div>
                  <h4 className="font-bold text-slate-800 text-xs sm:text-sm">
                    Select {bulkPickerType === 'Raw Material' ? 'Raw Materials' : 'Feed Medicines'}
                  </h4>
                  <p className="text-[10px] text-slate-500">
                    Tick any items to add them in bulk to your formula.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBulkPickerType(null)}
                className="text-slate-400 hover:text-slate-700 font-bold text-base p-1 rounded-lg hover:bg-white/80 transition cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Search & Quick Controls */}
            <div className="p-2.5 border-b border-slate-200 bg-slate-50 space-y-1.5">
              <div className="relative">
                <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
                <input
                  type="text"
                  autoFocus
                  placeholder={`Search ${bulkPickerType.toLowerCase()}s by name or code...`}
                  value={bulkSearch}
                  onChange={(e) => setBulkSearch(e.target.value)}
                  className="w-full h-7 pl-7 pr-6 bg-white border border-slate-300 rounded-md text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {bulkSearch && (
                  <button
                    type="button"
                    onClick={() => setBulkSearch('')}
                    className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectAllBulk(filteredBulkCandidates)}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition cursor-pointer"
                >
                  {allFilteredSelected ? 'Deselect All' : `Select All (${filteredBulkCandidates.length})`}
                </button>
                <span className="text-[10px] font-semibold text-slate-500">
                  {bulkSelectedIds.length} item{bulkSelectedIds.length === 1 ? '' : 's'} selected
                </span>
              </div>
            </div>

            {/* Items Checklist List */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1 divide-y divide-slate-100 max-h-60 sm:max-h-72">
              {filteredBulkCandidates.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs italic">
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
                      className={`flex items-center justify-between p-1.5 rounded-lg transition cursor-pointer border ${
                        isChecked
                          ? bulkPickerType === 'Raw Material'
                            ? 'bg-amber-50/80 border-amber-300'
                            : 'bg-purple-50/80 border-purple-300'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleBulkItem(c._id.toString())}
                          className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-slate-800 truncate">
                              {c.name}
                            </span>
                          </div>
                          {c.aliasName && (
                            <p className="text-[9px] text-slate-400 truncate">
                              Alias: {c.aliasName}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {alreadyInFormula && (
                          <span className="text-[8px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800">
                            In Recipe
                          </span>
                        )}
                        <span className="text-[9px] text-slate-400 font-mono">
                          {c.uom || 'kg'}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            {/* Bulk Picker Footer */}
            <div className="p-2.5 border-t border-slate-200 flex items-center justify-between bg-slate-50">
              <button
                type="button"
                onClick={() => setBulkPickerType(null)}
                className="px-3 py-1 border border-slate-300 text-slate-600 rounded-md text-xs font-semibold hover:bg-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyBulkSelection}
                className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1"
              >
                <span>+</span>
                <span>
                  Add Selected ({bulkSelectedIds.length})
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
