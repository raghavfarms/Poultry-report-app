import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  fetchFeedItems,
  createFeedItemApi,
  updateFeedItemApi,
  toggleFeedItemStatusApi,
} from '../api/feedMedRawMasterApi.js';
import {
  fetchFormulations,
  toggleFormulationStatusApi,
} from '../api/feedFormulationApi.js';
import FeedFormulationModal from '../components/FeedFormulationModal.jsx';

// Default options matching client requirements
const FEED_MED_CATEGORIES = ['Regular', 'Treatment'];
// Ton removed from Feed Medicine packagings as requested
const FEED_MED_PACKAGINGS = ['Bag', 'Drum', 'Bottle', 'Can', 'Box', 'Packet', 'Vial'];
// Raw Material packagings include Ton, Bag, Bulk, etc.
const RAW_MATERIAL_PACKAGINGS = ['Ton', 'Bag', 'Drum', 'Box', 'Bulk'];
const DEFAULT_UNITS = ['kg', 'gm', 'ltr', 'ml'];
const FEED_TYPES = [
  'All',
  'CHICKS',
  'GROWER',
  'DEVELOPER',
  'PRE-BREEDER',
  'PHASE-1',
  'PHASE-2',
  'PHASE-3',
  'OTHER',
];

const INITIAL_FORM = {
  code: '',
  itemType: 'Feed Medicine',
  name: '',
  aliasName: '',
  companyName: '',
  category: 'Regular',
  packagingType: 'Bag',
  packSize: '',
  uom: 'kg',
  reorderLevel: '',
};

// Compact scrollable dropdown that shows exactly 5 items, matching General Medicine master
function ScrollDropdown({
  value,
  onChange,
  options = [],
  placeholder = '-- Select --',
  onAddCustom,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs flex items-center justify-between bg-white text-slate-700 hover:border-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:outline-none transition cursor-pointer"
      >
        <span className={`truncate text-left ${!value ? 'text-slate-400' : 'font-medium text-slate-800'}`}>
          {value || placeholder}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 ml-1 transition-transform duration-150 ${isOpen ? 'rotate-180 text-emerald-600' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-[148px] overflow-y-auto py-0.5 divide-y divide-slate-100 animate-in fade-in duration-100 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
          {options.map((opt) => {
            const isSelected = opt === value;
            return (
              <div
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`px-2.5 py-1.5 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-800 font-semibold'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="truncate">{opt}</span>
                {isSelected && (
                  <span className="text-emerald-600 font-bold text-xs shrink-0 ml-1">✓</span>
                )}
              </div>
            );
          })}

          {onAddCustom && (
            <div
              onClick={() => {
                setIsOpen(false);
                onAddCustom();
              }}
              className="px-2.5 py-1.5 text-[8px] text-emerald-600 font-medium hover:bg-emerald-50 cursor-pointer flex items-center gap-1 bg-slate-50/50"
            >
              <span>+</span>
              <span>Add Custom...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FeedMedRawMasterPage() {
  const { user } = useAuth();
  const canManage = ['admin', 'developer'].includes(user?.role);

  // Data states
  const [allItems, setAllItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Tab state: 'feed-medicine' | 'raw-material' | 'feed-formulation'
  const [activeTab, setActiveTab] = useState('feed-medicine');

  // Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [feedTypeFilter, setFeedTypeFilter] = useState('All');

  // Formulation states
  const [allFormulations, setAllFormulations] = useState([]);
  const [loadingFormulations, setLoadingFormulations] = useState(false);
  const [isFormulationModalOpen, setIsFormulationModalOpen] = useState(false);
  const [editingFormulation, setEditingFormulation] = useState(null);
  const [expandedRecipeId, setExpandedRecipeId] = useState(null);

  // Modal states (matching max-w-[360px] compact design)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomPackaging, setIsCustomPackaging] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);

  // Close 3-dot action menu when clicking outside
  useEffect(() => {
    if (!openActionId) return;
    const handleOutsideClick = () => setOpenActionId(null);
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [openActionId]);

  // Load items from API (loads all items once, then filters client-side)
  const loadItems = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchFeedItems({ status: 'all' });
      setAllItems(res?.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load feed items');
    } finally {
      setLoading(false);
    }
  };

  // Load formulations from API
  const loadFormulations = async () => {
    try {
      setLoadingFormulations(true);
      const res = await fetchFormulations({ status: 'all' });
      setAllFormulations(res?.data || []);
    } catch (err) {
      console.error('Failed to load formulations:', err);
    } finally {
      setLoadingFormulations(false);
    }
  };

  useEffect(() => {
    loadItems();
    loadFormulations();
  }, []);

  // Filtered items & static badge counts from allItems
  const { filteredItems, feedMedCount, rawMaterialCount } = useMemo(() => {
    // Total counts based on status filter
    let statusFiltered = allItems;
    if (statusFilter === 'active') {
      statusFiltered = statusFiltered.filter((i) => i.isActive !== false);
    } else if (statusFilter === 'inactive') {
      statusFiltered = statusFiltered.filter((i) => i.isActive === false);
    }

    const feedMedCount = statusFiltered.filter((i) => i.itemType === 'Feed Medicine').length;
    const rawMaterialCount = statusFiltered.filter((i) => i.itemType === 'Raw Material').length;

    // Filter by Active Tab
    const targetType = activeTab === 'feed-medicine' ? 'Feed Medicine' : 'Raw Material';
    let list = statusFiltered.filter((i) => i.itemType === targetType);

    // Filter by search query
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((i) => {
        const matchesBasic =
          i.name?.toLowerCase().includes(q) ||
          i.code?.toLowerCase().includes(q);
        if (targetType === 'Feed Medicine') {
          return (
            matchesBasic ||
            i.aliasName?.toLowerCase().includes(q) ||
            i.companyName?.toLowerCase().includes(q)
          );
        }
        return matchesBasic;
      });
    }

    return { filteredItems: list, feedMedCount, rawMaterialCount };
  }, [allItems, statusFilter, activeTab, search]);

  // Filtered formulations & badge count
  const { filteredFormulations, formulationCount } = useMemo(() => {
    let list = allFormulations;
    if (statusFilter === 'active') {
      list = list.filter((f) => f.isActive !== false);
    } else if (statusFilter === 'inactive') {
      list = list.filter((f) => f.isActive === false);
    }
    const count = list.length;

    if (feedTypeFilter !== 'All') {
      list = list.filter((f) => f.feedType === feedTypeFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (f) =>
          f.feedName?.toLowerCase().includes(q) ||
          f.bomNumber?.toLowerCase().includes(q) ||
          f.flockName?.toLowerCase().includes(q) ||
          f.feedType?.toLowerCase().includes(q)
      );
    }

    return { filteredFormulations: list, formulationCount: count };
  }, [allFormulations, statusFilter, feedTypeFilter, search]);

  // Open modal for Adding
  const handleOpenAddModal = (defaultType = 'Feed Medicine') => {
    setEditingId(null);
    setFormData({
      ...INITIAL_FORM,
      itemType: defaultType,
      category: defaultType === 'Feed Medicine' ? 'Regular' : null,
      packagingType: defaultType === 'Raw Material' ? 'Ton' : 'Bag',
      packSize: defaultType === 'Raw Material' ? 1000 : '',
      uom: 'kg',
      aliasName: '',
      companyName: '',
    });
    setIsCustomCategory(false);
    setIsCustomPackaging(false);
    setIsCustomUnit(false);
    setShowAdvanced(false);
    setModalError('');
    setIsModalOpen(true);
  };

  // Open modal for Editing
  const handleOpenEditModal = (item) => {
    setEditingId(item._id);
    setFormData({
      code: item.code || '',
      itemType: item.itemType || 'Feed Medicine',
      name: item.name || '',
      aliasName: item.itemType === 'Raw Material' ? '' : (item.aliasName || ''),
      companyName: item.itemType === 'Raw Material' ? '' : (item.companyName || ''),
      category: item.itemType === 'Feed Medicine' ? (item.category || 'Regular') : null,
      packagingType: item.packagingType || (item.itemType === 'Raw Material' ? 'Ton' : 'Bag'),
      packSize: item.packSize || (item.itemType === 'Raw Material' ? 1000 : 1),
      uom: item.uom || 'kg',
      reorderLevel: item.reorderLevel || '',
    });
    setIsCustomCategory(false);
    setIsCustomPackaging(false);
    setIsCustomUnit(false);
    setShowAdvanced(false);
    setModalError('');
    setIsModalOpen(true);
  };

  // Close modal
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setModalError('');
  };

  // Save (Create or Update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setModalError('');

      if (!formData.name?.trim()) {
        throw new Error(
          formData.itemType === 'Feed Medicine'
            ? 'Medicine Name is required'
            : 'Raw Material Name is required'
        );
      }

      if (!formData.uom?.trim()) {
        throw new Error('Please select or enter a Unit (Measure)');
      }

      const payload = {
        ...formData,
        name: formData.name.trim(),
        aliasName: formData.itemType === 'Raw Material' ? '' : (formData.aliasName?.trim() || ''),
        companyName: formData.itemType === 'Raw Material' ? '' : (formData.companyName?.trim() || ''),
        category: formData.itemType === 'Raw Material' ? null : (formData.category || 'Regular'),
        packagingType: formData.packagingType?.trim() || (formData.itemType === 'Raw Material' ? 'Ton' : 'Bag'),
        packSize: Number(formData.packSize) || (formData.itemType === 'Raw Material' ? 1000 : 1),
        uom: formData.uom?.trim() || 'kg',
      };

      if (editingId) {
        await updateFeedItemApi(editingId, payload);
        setSuccessMsg('Item updated successfully!');
      } else {
        await createFeedItemApi(payload);
        setSuccessMsg(`${formData.itemType} added successfully!`);
      }

      handleCloseModal();
      await loadItems();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      setModalError(err?.message || 'Failed to save item');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle active/inactive
  const handleToggleStatus = async (item) => {
    try {
      await toggleFeedItemStatusApi(item._id);
      await loadItems();
      setSuccessMsg(
        `${item.name} marked as ${item.isActive ? 'Inactive' : 'Active'}`
      );
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      alert(err?.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 p-2 sm:p-4 max-w-7xl mx-auto">
      {/* 0. Master Switch Tabs (Medicine, Raw Material, Formulation) */}
      <div className="flex bg-slate-200/70 p-1 rounded-xl gap-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('feed-medicine')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'feed-medicine'
              ? 'bg-white text-purple-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>💊</span>
          <span>Feed Medicine</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
              activeTab === 'feed-medicine'
                ? 'bg-purple-100 text-purple-800'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {feedMedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('raw-material')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'raw-material'
              ? 'bg-white text-amber-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>🌾</span>
          <span>Raw Material</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
              activeTab === 'raw-material'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {rawMaterialCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('feed-formulation')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'feed-formulation'
              ? 'bg-white text-teal-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>🥣</span>
          <span>Feed Formulation</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
              activeTab === 'feed-formulation'
                ? 'bg-teal-100 text-teal-800'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {formulationCount}
          </span>
        </button>
      </div>

      {/* 1. Header Section */}
      <div className="flex justify-between items-center gap-2 bg-white p-3 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-lg sm:text-2xl shrink-0">
              {activeTab === 'feed-medicine' ? '💊' : activeTab === 'raw-material' ? '🌾' : '🥣'}
            </span>
            <h1 className="text-sm sm:text-2xl font-bold text-slate-800 leading-snug">
              {activeTab === 'feed-medicine'
                ? 'Feed Medicine Master'
                : activeTab === 'raw-material'
                  ? 'Raw Material Master'
                  : 'Feed Formulation Master (BOM)'}
            </h1>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block mt-0.5">
            {activeTab === 'feed-medicine'
              ? 'Manage routine premixes, additives, and treatment feed medicines'
              : activeTab === 'raw-material'
                ? 'Manage bulk grains, protein meals, minerals, and oils'
                : 'Manage 1 Ton (1,000 kg) standard feed recipes, Bill of Materials, and mixing ratios'}
          </p>
        </div>

        <div className="shrink-0">
          {canManage && (
            <button
              onClick={() => {
                if (activeTab === 'feed-formulation') {
                  setEditingFormulation(null);
                  setIsFormulationModalOpen(true);
                } else {
                  handleOpenAddModal(
                    activeTab === 'feed-medicine' ? 'Feed Medicine' : 'Raw Material'
                  );
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer text-xs sm:text-sm whitespace-nowrap"
            >
              <span className="text-base leading-none font-bold">+</span>
              <span>
                Add{' '}
                {activeTab === 'feed-medicine'
                  ? 'Medicine'
                  : activeTab === 'raw-material'
                    ? 'Raw Material'
                    : 'Formulation'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs sm:text-sm font-medium animate-in fade-in">
          ✓ {successMsg}
        </div>
      )}
      {error && !isModalOpen && !isFormulationModalOpen && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs sm:text-sm font-medium">
          ⚠ {error}
        </div>
      )}

      {/* 2. Filters & Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs space-y-2 sm:space-y-0 sm:flex sm:gap-4 sm:items-center">
        {/* Search */}
        <div className="flex-1">
          <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">
            Search
          </label>
          <input
            type="text"
            placeholder={
              activeTab === 'feed-medicine'
                ? 'Search medicine code, name, company, or alias...'
                : activeTab === 'raw-material'
                  ? 'Search raw material code or name...'
                  : 'Search formulation name, BOM code, flock, or stage...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Feed Stage Filter for Formulations only */}
        {activeTab === 'feed-formulation' && (
          <div className="sm:w-44">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">
              Feed Stage
            </label>
            <select
              value={feedTypeFilter}
              onChange={(e) => setFeedTypeFilter(e.target.value)}
              className="w-full h-8 sm:h-10 px-2 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer font-medium"
            >
              {FEED_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'All' ? 'All Feed Stages' : t}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Status Filter */}
        <div className="sm:w-44">
          <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">
            Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-8 sm:h-10 px-2 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer font-medium"
          >
            <option value="active">Active Only</option>
            <option value="all">All Status</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* 3. Table / Directory (Desktop Table + Mobile Cards) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* ======================================================== */}
        {/* A. DESKTOP VIEW                                          */}
        {/* ======================================================== */}
        <div className="hidden md:block overflow-x-auto min-h-[350px]">
          {activeTab === 'feed-formulation' ? (
            /* ==================================== */
            /* 1. FEED FORMULATION DESKTOP TABLE    */
            /* ==================================== */
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-2xs">
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">BOM Code</th>
                  <th className="py-3 px-4">Recipe / Feed Name</th>
                  <th className="py-3 px-4">Stage / Type</th>
                  <th className="py-3 px-4">Consumed By</th>
                  <th className="py-3 px-4">Target Flock</th>
                  <th className="py-3 px-4 text-center">Batch Items</th>
                  <th className="py-3 px-4 text-center">1 Ton Batch Status</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {canManage && (
                    <th className="py-3 px-4 pr-6 text-right w-24">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingFormulations ? (
                  <tr>
                    <td colSpan={canManage ? 9 : 8} className="p-8 sm:p-12 text-center text-slate-500 font-medium">
                      Loading feed formulations...
                    </td>
                  </tr>
                ) : filteredFormulations.length === 0 ? (
                  <tr>
                    <td colSpan={canManage ? 9 : 8} className="p-8 sm:p-12 text-center text-slate-500">
                      <p className="text-base font-semibold">No feed formulations found</p>
                      <p className="text-sm mt-1">Click &quot;+ Add Formulation&quot; to create your first standard 1 Ton recipe.</p>
                    </td>
                  </tr>
                ) : (
                  filteredFormulations.map((item, idx) => {
                    const isDropup = idx >= filteredFormulations.length - 2 && idx > 0;
                    const isBalanced = Math.abs((item.totalWeight || 0) - (item.targetBatchSize || 1000)) < 0.001;
                    const isExpanded = expandedRecipeId === item._id;

                    return (
                      <tbody key={item._id} className="divide-y divide-slate-100">
                        <tr
                          className={`hover:bg-slate-50 transition cursor-pointer ${
                            isExpanded ? 'bg-teal-50/40' : ''
                          }`}
                          onClick={() => setExpandedRecipeId(isExpanded ? null : item._id)}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-teal-800">
                            {item.bomNumber}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{item.feedName}</div>
                            {item.notes && (
                              <div className="text-[11px] text-slate-400 italic truncate max-w-xs">
                                {item.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                              {item.feedType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs font-medium text-slate-700">
                            {item.consumedBy === 'FEMALE'
                              ? 'FEMALE (मुर्गी)'
                              : item.consumedBy === 'MALE'
                                ? 'MALE (मुर्गा)'
                                : 'ALL BIRDS'}
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600">
                            {item.flockName || 'All Flocks'}
                          </td>
                          <td className="py-3 px-4 text-center font-medium">
                            <span className="text-xs text-slate-800 font-bold">
                              {item.items?.length || 0} items
                            </span>
                            <div className="text-[10px] text-teal-700 font-semibold">
                              {isExpanded ? '▲ Hide recipe' : '▼ View recipe'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                isBalanced
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-amber-50 text-amber-800 border-amber-300'
                              }`}
                            >
                              <span>{isBalanced ? '🟢' : '🟡'}</span>
                              <span>{item.totalWeight || 0} kg</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                                item.isActive
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          {canManage && (
                            <td className="py-3 px-4 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="relative inline-block text-left">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenActionId(openActionId === `f-${item._id}` ? null : `f-${item._id}`)
                                  }
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                                  title="Actions"
                                >
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                  </svg>
                                </button>

                                {openActionId === `f-${item._id}` && (
                                  <>
                                    <div
                                      className="fixed inset-0 z-20 cursor-default"
                                      onClick={() => setOpenActionId(null)}
                                    />
                                    <div
                                      className={`absolute right-0 ${
                                        isDropup ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                                      } w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-left animate-in fade-in zoom-in-95 duration-100`}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionId(null);
                                          setEditingFormulation(item);
                                          setIsFormulationModalOpen(true);
                                        }}
                                        className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                      >
                                        <span>✏️</span> Edit Recipe
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenActionId(null);
                                          setExpandedRecipeId(isExpanded ? null : item._id);
                                        }}
                                        className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-teal-700 flex items-center gap-2 transition cursor-pointer"
                                      >
                                        <span>👁️</span> {isExpanded ? 'Hide Ingredients' : 'View Ingredients'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          setOpenActionId(null);
                                          try {
                                            await toggleFormulationStatusApi(item._id);
                                            await loadFormulations();
                                            setSuccessMsg(`${item.feedName} status updated!`);
                                            setTimeout(() => setSuccessMsg(''), 3000);
                                          } catch (err) {
                                            alert(err?.message || 'Failed to update status');
                                          }
                                        }}
                                        className={`w-full px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                          item.isActive
                                            ? 'text-amber-700 hover:bg-amber-50'
                                            : 'text-emerald-700 hover:bg-emerald-50'
                                        }`}
                                      >
                                        <span>{item.isActive ? '⏸️' : '▶️'}</span>
                                        {item.isActive ? 'Deactivate' : 'Activate'}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>

                        {/* Inline Expandable Recipe Ingredients */}
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <td colSpan={canManage ? 9 : 8} className="p-3 sm:p-4">
                              <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-xs">
                                <div className="flex items-center justify-between mb-2">
                                  <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>🥣</span>
                                    <span>BOM Recipe Ingredients for 1 Ton (1,000 kg):</span>
                                  </h5>
                                  <span className="text-[11px] font-bold text-teal-800">
                                    Total: {item.totalWeight} kg ({((item.totalWeight / (item.targetBatchSize || 1000)) * 100).toFixed(1)}%)
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {item.items?.map((it, iIdx) => (
                                    <div
                                      key={iIdx}
                                      className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                                    >
                                      <div className="min-w-0 flex-1 pr-2">
                                        <div className="font-semibold text-slate-900 truncate">
                                          {it.itemName}
                                        </div>
                                        <span
                                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                            it.itemType === 'Raw Material'
                                              ? 'bg-amber-100 text-amber-800'
                                              : 'bg-purple-100 text-purple-800'
                                          }`}
                                        >
                                          {it.itemType}
                                        </span>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className="font-mono font-bold text-slate-900">
                                          {it.quantity} kg
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono">
                                          {it.percentage}%
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })
                )}
              </tbody>
            </table>
          ) : (
            /* ========================================= */
            /* 2. FEED MEDICINE / RAW MATERIAL TABLE     */
            /* ========================================= */
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-2xs">
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">
                    {activeTab === 'feed-medicine' ? 'Medicine Name' : 'Raw Material Name'}
                  </th>
                  {activeTab === 'feed-medicine' && <th className="py-3 px-4">Alias Name</th>}
                  {activeTab === 'feed-medicine' && <th className="py-3 px-4">Company Name</th>}
                  {activeTab === 'feed-medicine' && <th className="py-3 px-4">Category</th>}
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4 text-center">Stock & Alert</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  {canManage && (
                    <th className="py-3 px-4 pr-6 text-right w-24">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td
                      colSpan={canManage ? (activeTab === 'feed-medicine' ? 9 : 6) : activeTab === 'feed-medicine' ? 8 : 5}
                      className="p-8 sm:p-12 text-center text-slate-500 font-medium"
                    >
                      Loading items...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={canManage ? (activeTab === 'feed-medicine' ? 9 : 6) : activeTab === 'feed-medicine' ? 8 : 5}
                      className="p-8 sm:p-12 text-center text-slate-500"
                    >
                      <p className="text-base font-semibold">
                        No {activeTab === 'feed-medicine' ? 'feed medicines' : 'raw materials'} found
                      </p>
                      <p className="text-sm mt-1">Try changing your filters or add a new item.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const isDropup = idx >= filteredItems.length - 2 && idx > 0;
                    return (
                      <tr key={item._id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">
                          {item.code}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {item.name}
                        </td>
                        {activeTab === 'feed-medicine' && (
                          <td className="py-3 px-4 font-medium">
                            {item.aliasName ? (
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                                {item.aliasName}
                              </span>
                            ) : (
                              <span className="text-slate-300 italic text-xs">—</span>
                            )}
                          </td>
                        )}
                        {activeTab === 'feed-medicine' && (
                          <td className="py-3 px-4 text-slate-700">
                            {item.companyName ? (
                              <span className="font-medium text-slate-800">{item.companyName}</span>
                            ) : (
                              <span className="text-slate-300 italic text-xs">—</span>
                            )}
                          </td>
                        )}
                        {activeTab === 'feed-medicine' && (
                          <td className="py-3 px-4">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                              {item.category || 'Regular'}
                            </span>
                          </td>
                        )}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">
                            {item.packagingType}
                          </div>
                          <div className="text-[11px] text-emerald-700 font-medium">
                            1 {item.packagingType} = {item.packSize || 1} {item.uom}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <span>🟢</span> {item.currentStock || 0} {item.packagingType}
                            </span>
                            <span className="text-[10px] text-amber-700 font-medium">
                              Alert &lt; {item.reorderLevel || 20} {item.packagingType}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                              item.isActive
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {item.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {canManage && (
                          <td className="py-3 px-4 pr-6 text-right">
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionId(openActionId === item._id ? null : item._id);
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                                title="Actions"
                              >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                </svg>
                              </button>

                              {openActionId === item._id && (
                                <>
                                  <div
                                    className="fixed inset-0 z-20 cursor-default"
                                    onClick={() => setOpenActionId(null)}
                                  />
                                  <div
                                    className={`absolute right-0 ${
                                      isDropup ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                                    } w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-left animate-in fade-in zoom-in-95 duration-100`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        handleOpenEditModal(item);
                                      }}
                                      className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                    >
                                      <span>✏️</span> Edit Details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        handleToggleStatus(item);
                                      }}
                                      className={`w-full px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                        item.isActive
                                          ? 'text-amber-700 hover:bg-amber-50'
                                          : 'text-emerald-700 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <span>{item.isActive ? '⏸️' : '▶️'}</span>
                                      {item.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ======================================================== */}
        {/* B. MOBILE VIEW                                           */}
        {/* ======================================================== */}
        <div className="md:hidden divide-y divide-slate-100">
          {activeTab === 'feed-formulation' ? (
            /* FORMULATION MOBILE CARDS */
            loadingFormulations ? (
              <div className="p-8 text-center text-slate-500 font-medium">Loading formulations...</div>
            ) : filteredFormulations.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <p className="text-base font-semibold">No feed formulations found</p>
                <p className="text-xs mt-1">Tap &quot;+ Add Formulation&quot; to create a new recipe.</p>
              </div>
            ) : (
              filteredFormulations.map((item, idx) => {
                const isDropup = idx >= filteredFormulations.length - 2 && idx > 0;
                const isBalanced = Math.abs((item.totalWeight || 0) - (item.targetBatchSize || 1000)) < 0.001;
                const isExpanded = expandedRecipeId === item._id;

                return (
                  <div key={item._id} className="p-3 hover:bg-slate-50/80 transition space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => setExpandedRecipeId(isExpanded ? null : item._id)}
                      >
                        <span className="font-mono text-[10px] font-bold text-teal-800 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200 shrink-0">
                          {item.bomNumber}
                        </span>
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {item.feedName}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            item.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>

                        {canManage && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionId(openActionId === `mf-${item._id}` ? null : `mf-${item._id}`);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                              title="Actions"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>

                            {openActionId === `mf-${item._id}` && (
                              <>
                                <div
                                  className="fixed inset-0 z-20 cursor-default"
                                  onClick={() => setOpenActionId(null)}
                                />
                                <div
                                  className={`absolute right-0 ${
                                    isDropup ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                                  } w-40 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 text-left animate-in fade-in zoom-in-95 duration-100`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionId(null);
                                      setEditingFormulation(item);
                                      setIsFormulationModalOpen(true);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                  >
                                    <span>✏️</span> Edit Recipe
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setOpenActionId(null);
                                      try {
                                        await toggleFormulationStatusApi(item._id);
                                        await loadFormulations();
                                        setSuccessMsg(`${item.feedName} status updated!`);
                                        setTimeout(() => setSuccessMsg(''), 3000);
                                      } catch (err) {
                                        alert(err?.message || 'Failed to update status');
                                      }
                                    }}
                                    className={`w-full px-3 py-1.5 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                      item.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <span>{item.isActive ? '⏸️' : '▶️'}</span>
                                    {item.isActive ? 'Deactivate' : 'Activate'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
                      <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 font-bold">
                        {item.feedType}
                      </span>
                      <span>• {item.consumedBy}</span>
                      <span>• {item.flockName || 'All Flocks'}</span>
                    </div>

                    <div
                      className="flex items-center justify-between text-[10px] pt-0.5 cursor-pointer"
                      onClick={() => setExpandedRecipeId(isExpanded ? null : item._id)}
                    >
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          isBalanced
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        <span>{isBalanced ? '🟢' : '🟡'}</span>
                        <span>Total: {item.totalWeight} kg</span>
                      </span>

                      <span className="text-[10px] text-teal-700 font-bold">
                        {item.items?.length || 0} Ingredients {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
                        {item.items?.map((it, iIdx) => (
                          <div key={iIdx} className="flex justify-between items-center text-[10px] bg-slate-50 p-1.5 rounded">
                            <span className="font-semibold text-slate-800 truncate mr-2">{it.itemName}</span>
                            <span className="font-mono font-bold text-slate-900 shrink-0">{it.quantity} kg ({it.percentage}%)</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : (
            /* MEDICINE / RAW MATERIAL MOBILE CARDS */
            loading ? (
              <div className="p-8 text-center text-slate-500 font-medium">Loading items...</div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                <p className="text-base font-semibold">No items found</p>
                <p className="text-xs mt-1">Try changing filters or add a new item.</p>
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isDropup = idx >= filteredItems.length - 2 && idx > 0;
                return (
                  <div
                    key={item._id}
                    className="p-3 hover:bg-slate-50/80 transition space-y-2"
                  >
                    {/* Row 1: Code, Name, Alias (Feed Med only) & 3-dot Action */}
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => handleOpenEditModal(item)}
                      >
                        <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                          {item.code}
                        </span>
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {item.name}
                        </span>
                        {activeTab === 'feed-medicine' && item.aliasName && (
                          <span className="text-[10px] text-emerald-700 italic truncate shrink-0">
                            ({item.aliasName})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            item.isActive
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {item.isActive ? 'Active' : 'Inactive'}
                        </span>

                        {canManage && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionId(openActionId === `m-${item._id}` ? null : `m-${item._id}`);
                              }}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                              title="Actions"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>

                            {openActionId === `m-${item._id}` && (
                              <>
                                <div
                                  className="fixed inset-0 z-20 cursor-default"
                                  onClick={() => setOpenActionId(null)}
                                />
                                <div
                                  className={`absolute right-0 ${
                                    isDropup ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                                  } w-40 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-30 text-left animate-in fade-in zoom-in-95 duration-100`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionId(null);
                                      handleOpenEditModal(item);
                                    }}
                                    className="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                  >
                                    <span>✏️</span> Edit Details
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionId(null);
                                      handleToggleStatus(item);
                                    }}
                                    className={`w-full px-3 py-1.5 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                      item.isActive ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <span>{item.isActive ? '⏸️' : '▶️'}</span>
                                    {item.isActive ? 'Deactivate' : 'Activate'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Row 2: Category (Feed Med only), Packaging & Rule, Company (Feed Med only) */}
                    <div
                      className="flex flex-wrap items-center gap-2 text-[10px] text-slate-600 cursor-pointer"
                      onClick={() => handleOpenEditModal(item)}
                    >
                      {activeTab === 'feed-medicine' && item.category && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold text-[9px]">
                          {item.category}
                        </span>
                      )}

                      <span className="text-emerald-700 font-medium">
                        1 {item.packagingType} = {item.packSize || 1} {item.uom}
                      </span>

                      {activeTab === 'feed-medicine' && item.companyName && (
                        <span className="text-slate-500 font-medium">
                          • {item.companyName}
                        </span>
                      )}
                    </div>

                    {/* Row 3: Stock Pill & Low Stock Alert */}
                    <div
                      className="flex items-center justify-between text-[10px] pt-0.5 cursor-pointer"
                      onClick={() => handleOpenEditModal(item)}
                    >
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <span>🟢</span> Stock: {item.currentStock || 0} {item.packagingType}
                      </span>
                      <span className="text-[10px] text-amber-700 font-medium">
                        Alert &lt; {item.reorderLevel || 20} {item.packagingType}
                      </span>
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. DEDICATED ADD / EDIT MODALS FOR EACH TAB              */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2.5 sm:p-4 overflow-y-auto cursor-pointer"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white w-full max-w-[360px] rounded-xl shadow-2xl animate-in fade-in zoom-in duration-150 my-auto cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-3.5 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="font-bold text-slate-800 text-sm">
                {formData.itemType === 'Feed Medicine'
                  ? editingId
                    ? 'Edit Feed Medicine'
                    : 'Add New Feed Medicine'
                  : editingId
                    ? 'Edit Raw Material'
                    : 'Add New Raw Material'}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg leading-none p-1 rounded-md hover:bg-slate-200/50 transition cursor-pointer"
                title="Close"
              >
                &times;
              </button>
            </div>

            {/* FORM 1: DEDICATED FEED MEDICINE ENTRY FORM */}
            {formData.itemType === 'Feed Medicine' ? (
              <form onSubmit={handleSubmit} className="p-3 space-y-2.5">
                {modalError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                    {modalError}
                  </div>
                )}

                {/* Row 1: Medicine Name & Alias Name */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1 truncate">
                      Medicine Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. Paracetamol"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                      Alias Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Toxin Binder (optional)"
                      value={formData.aliasName}
                      onChange={(e) =>
                        setFormData({ ...formData, aliasName: e.target.value })
                      }
                      className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>

                {/* Row 2: Category & Packaging (NO Ton) */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Category */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                        Category <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCategory(!isCustomCategory);
                          if (!isCustomCategory) {
                            setFormData({ ...formData, category: '' });
                          }
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-medium transition cursor-pointer inline-block"
                        style={{ fontSize: '13px', transform: 'scale(0.85)', transformOrigin: 'right center' }}
                      >
                        {isCustomCategory ? '← List' : '+ Custom'}
                      </button>
                    </div>

                    {isCustomCategory ? (
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. Regular"
                        value={formData.category}
                        onChange={(e) =>
                          setFormData({ ...formData, category: e.target.value })
                        }
                        className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      />
                    ) : (
                      <ScrollDropdown
                        value={formData.category}
                        onChange={(val) =>
                          setFormData({ ...formData, category: val })
                        }
                        options={FEED_MED_CATEGORIES}
                        placeholder="-- Select --"
                        onAddCustom={() => {
                          setIsCustomCategory(true);
                          setFormData({ ...formData, category: '' });
                        }}
                      />
                    )}
                  </div>

                  {/* Packaging (Ton Removed!) */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                        Packaging <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomPackaging(!isCustomPackaging);
                          if (!isCustomPackaging) {
                            setFormData({ ...formData, packagingType: '' });
                          }
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-medium transition cursor-pointer inline-block"
                        style={{ fontSize: '13px', transform: 'scale(0.85)', transformOrigin: 'right center' }}
                      >
                        {isCustomPackaging ? '← List' : '+ Custom'}
                      </button>
                    </div>

                    {isCustomPackaging ? (
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. Bag / Drum"
                        value={formData.packagingType}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            packagingType: e.target.value,
                          })
                        }
                        className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      />
                    ) : (
                      <ScrollDropdown
                        value={formData.packagingType}
                        onChange={(val) => {
                          setFormData((prev) => {
                            const updates = { ...prev, packagingType: val };
                            if (val === 'Vial') {
                              updates.packSize = 1;
                              updates.uom = prev.uom === 'kg' ? 'ml' : prev.uom;
                            }
                            return updates;
                          });
                        }}
                        options={FEED_MED_PACKAGINGS}
                        placeholder="-- Select --"
                        onAddCustom={() => {
                          setIsCustomPackaging(true);
                          setFormData({ ...formData, packagingType: '' });
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Row 3: Pack Size & Unit */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                      Pack Size <span className="text-slate-400 font-normal">(Qty/Pack)</span> <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      placeholder="e.g. 25"
                      value={formData.packSize}
                      onChange={(e) =>
                        setFormData({ ...formData, packSize: e.target.value })
                      }
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                        Unit (Measure) <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomUnit(!isCustomUnit);
                          if (!isCustomUnit) {
                            setFormData({ ...formData, uom: '' });
                          }
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-medium transition cursor-pointer inline-block"
                        style={{ fontSize: '13px', transform: 'scale(0.85)', transformOrigin: 'right center' }}
                      >
                        {isCustomUnit ? '← List' : '+ Custom'}
                      </button>
                    </div>

                    {isCustomUnit ? (
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. kg"
                        value={formData.uom}
                        onChange={(e) =>
                          setFormData({ ...formData, uom: e.target.value.toLowerCase() })
                        }
                        className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                      />
                    ) : (
                      <ScrollDropdown
                        value={formData.uom}
                        onChange={(val) =>
                          setFormData({ ...formData, uom: val })
                        }
                        options={DEFAULT_UNITS}
                        placeholder="-- Select Unit --"
                        onAddCustom={() => {
                          setIsCustomUnit(true);
                          setFormData({ ...formData, uom: '' });
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Packaging Rule Formula Banner */}
                <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs text-emerald-950 font-medium shadow-2xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <span>📦</span>
                    <span className="text-emerald-800 font-semibold">Rule:</span>
                    <strong className="text-emerald-950 font-bold">
                      1 {formData.packagingType || 'Container'} = {formData.packSize ? `${formData.packSize} ${formData.uom}` : `... ${formData.uom}`}
                    </strong>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium italic shrink-0">
                    Auto-totals everywhere
                  </span>
                </div>

                {/* More Details (Company Name / Code / Reorder Level) */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full py-1.5 px-2 text-xs font-semibold text-slate-600 hover:text-emerald-700 flex items-center justify-between border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer bg-slate-50/60"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>⚙️</span>
                      <span>More Details</span>
                    </span>
                    <span className="text-[11px] text-emerald-600 font-bold shrink-0">
                      {showAdvanced ? '▲ Hide' : '▼ Show'}
                    </span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2 animate-in fade-in duration-100">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                          Company Name <span className="text-slate-400 font-normal">(Manufacturer)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Altech, Roche, Cargill"
                          value={formData.companyName}
                          onChange={(e) =>
                            setFormData({ ...formData, companyName: e.target.value })
                          }
                          className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                            Code <span className="text-slate-400 font-normal">(opt)</span>
                          </label>
                          <input
                            type="text"
                            disabled={Boolean(editingId)}
                            value={formData.code}
                            placeholder="Auto-generated"
                            className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs uppercase focus:outline-none bg-slate-100 text-slate-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                            Low Stock Alert <span className="text-slate-400 font-normal">(opt)</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 50"
                            value={formData.reorderLevel}
                            onChange={(e) =>
                              setFormData({ ...formData, reorderLevel: e.target.value })
                            }
                            className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              /* FORM 2: DEDICATED RAW MATERIAL ENTRY FORM (No Alias, No Company, No Category) */
              <form onSubmit={handleSubmit} className="p-3 space-y-2.5">
                {modalError && (
                  <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                    {modalError}
                  </div>
                )}

                {/* Row 1: Raw Material Name only (No Alias Name!) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1 truncate">
                    Raw Material Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Maize / Soya / Mustard Cake"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                  />
                </div>

                {/* Row 2: Packaging (Default Ton) & Unit (Default kg) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                        Packaging <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomPackaging(!isCustomPackaging);
                          if (!isCustomPackaging) {
                            setFormData({ ...formData, packagingType: '' });
                          }
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-medium transition cursor-pointer inline-block"
                        style={{ fontSize: '13px', transform: 'scale(0.85)', transformOrigin: 'right center' }}
                      >
                        {isCustomPackaging ? '← List' : '+ Custom'}
                      </button>
                    </div>

                    {isCustomPackaging ? (
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. Ton / Bag"
                        value={formData.packagingType}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            packagingType: e.target.value,
                          })
                        }
                        className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                      />
                    ) : (
                      <ScrollDropdown
                        value={formData.packagingType}
                        onChange={(val) => {
                          setFormData((prev) => {
                            const updates = { ...prev, packagingType: val };
                            if (val === 'Ton') {
                              updates.packSize = 1000;
                              updates.uom = 'kg';
                            } else if (prev.packagingType === 'Ton' && Number(prev.packSize) === 1000) {
                              updates.packSize = '';
                            }
                            return updates;
                          });
                        }}
                        options={RAW_MATERIAL_PACKAGINGS}
                        placeholder="-- Select --"
                        onAddCustom={() => {
                          setIsCustomPackaging(true);
                          setFormData({ ...formData, packagingType: '' });
                        }}
                      />
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                        Unit (Measure) <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomUnit(!isCustomUnit);
                          if (!isCustomUnit) {
                            setFormData({ ...formData, uom: '' });
                          }
                        }}
                        className="text-emerald-600 hover:text-emerald-700 font-medium transition cursor-pointer inline-block"
                        style={{ fontSize: '13px', transform: 'scale(0.85)', transformOrigin: 'right center' }}
                      >
                        {isCustomUnit ? '← List' : '+ Custom'}
                      </button>
                    </div>

                    {isCustomUnit ? (
                      <input
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. kg"
                        value={formData.uom}
                        onChange={(e) =>
                          setFormData({ ...formData, uom: e.target.value.toLowerCase() })
                        }
                        className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white font-medium"
                      />
                    ) : (
                      <ScrollDropdown
                        value={formData.uom}
                        onChange={(val) =>
                          setFormData({ ...formData, uom: val })
                        }
                        options={DEFAULT_UNITS}
                        placeholder="-- Select Unit --"
                        onAddCustom={() => {
                          setIsCustomUnit(true);
                          setFormData({ ...formData, uom: '' });
                        }}
                      />
                    )}
                  </div>
                </div>

                {/* Row 3: Pack Size (Qty/Pack) */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Pack Size <span className="text-slate-400 font-normal">(Qty/Pack)</span> <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    required
                    placeholder="e.g. 1000"
                    value={formData.packSize}
                    onChange={(e) =>
                      setFormData({ ...formData, packSize: e.target.value })
                    }
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                  />
                </div>

                {/* Packaging Rule Formula Banner */}
                <div className="bg-emerald-50/90 border border-emerald-200/90 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs text-emerald-950 font-medium shadow-2xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <span>📦</span>
                    <span className="text-emerald-800 font-semibold">Rule:</span>
                    <strong className="text-emerald-950 font-bold">
                      1 {formData.packagingType || 'Container'} = {formData.packSize ? `${formData.packSize} ${formData.uom}` : `... ${formData.uom}`}
                    </strong>
                  </span>
                  <span className="text-[10px] text-emerald-700 font-medium italic shrink-0">
                    Auto-totals everywhere
                  </span>
                </div>

                {/* More Details (Code & Low Stock Alert ONLY - NO Company Name!) */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full py-1.5 px-2 text-xs font-semibold text-slate-600 hover:text-emerald-700 flex items-center justify-between border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer bg-slate-50/60"
                  >
                    <span className="flex items-center gap-1.5">
                      <span>⚙️</span>
                      <span>More Details</span>
                    </span>
                    <span className="text-[11px] text-emerald-600 font-bold shrink-0">
                      {showAdvanced ? '▲ Hide' : '▼ Show'}
                    </span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-2 p-2 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2 animate-in fade-in duration-100">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                            Code <span className="text-slate-400 font-normal">(opt)</span>
                          </label>
                          <input
                            type="text"
                            disabled={Boolean(editingId)}
                            value={formData.code}
                            placeholder="Auto-generated"
                            className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs uppercase focus:outline-none bg-slate-100 text-slate-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                            Low Stock Alert <span className="text-slate-400 font-normal">(opt)</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            placeholder="e.g. 50"
                            value={formData.reorderLevel}
                            onChange={(e) =>
                              setFormData({ ...formData, reorderLevel: e.target.value })
                            }
                            className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="px-3.5 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 5. FEED FORMULATION MODAL */}
      <FeedFormulationModal
        isOpen={isFormulationModalOpen}
        onClose={() => setIsFormulationModalOpen(false)}
        onSaved={loadFormulations}
        editingFormulation={editingFormulation}
        masterItems={allItems}
      />
    </div>
  );
}
