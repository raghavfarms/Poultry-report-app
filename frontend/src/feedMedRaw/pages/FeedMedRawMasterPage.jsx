import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  fetchFeedItems,
  createFeedItemApi,
  updateFeedItemApi,
  toggleFeedItemStatusApi,
} from '../api/feedMedRawMasterApi.js';

// Default options matching client requirements
const FEED_MED_CATEGORIES = ['Regular', 'Treatment'];
const RAW_MATERIAL_CATEGORIES = ['Raw Material', 'Grain', 'Protein', 'Mineral', 'Oil'];
const DEFAULT_PACKAGINGS = ['Bag', 'Drum', 'Bottle', 'Can', 'Box', 'Packet', 'Ton', 'Vial'];
const DEFAULT_UNITS = ['kg', 'gm', 'ltr', 'ml'];

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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('All');
  const [statusFilter, setStatusFilter] = useState('active');

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

  // Dynamic available categories based on Item Type
  const availableCategories = useMemo(() => {
    return formData.itemType === 'Feed Medicine'
      ? FEED_MED_CATEGORIES
      : RAW_MATERIAL_CATEGORIES;
  }, [formData.itemType]);

  // Load items from API
  const loadItems = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetchFeedItems({
        search: search.trim(),
        itemType: selectedType,
        status: statusFilter,
      });
      setItems(res?.data || []);
    } catch (err) {
      setError(err?.message || 'Failed to load feed items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [selectedType, statusFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

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
      aliasName: item.aliasName || '',
      companyName: item.companyName || '',
      category: item.category || (item.itemType === 'Feed Medicine' ? 'Regular' : 'Raw Material'),
      packagingType: item.packagingType || 'Bag',
      packSize: item.packSize || 1,
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

      if (editingId) {
        await updateFeedItemApi(editingId, formData);
        setSuccessMsg('Item updated successfully!');
      } else {
        await createFeedItemApi(formData);
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

  const feedMedCount = useMemo(
    () => items.filter((i) => i.itemType === 'Feed Medicine').length,
    [items]
  );
  const rawMaterialCount = useMemo(
    () => items.filter((i) => i.itemType === 'Raw Material').length,
    [items]
  );

  return (
    <div className="space-y-3 sm:space-y-4 p-2 sm:p-4 max-w-7xl mx-auto">
      {/* 1. Header Section */}
      <div className="flex justify-between items-center gap-3 bg-white p-3 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl">🌾</span>
            <h1 className="text-base sm:text-2xl font-bold text-slate-800">
              Feed Medicine & Raw Material Master
            </h1>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block mt-0.5">
            Manage feed premixes, routine additives, and raw materials catalog
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => handleOpenAddModal('Feed Medicine')}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm shrink-0"
            >
              <span className="text-base leading-none font-bold">+</span> Add Item
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
      {error && !isModalOpen && (
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
            placeholder="Search code, name, company, or alias..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Item Type & Status */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-4">
          <div className="sm:w-56">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">
              Item Type
            </label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full h-8 sm:h-10 px-2 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer font-medium"
            >
              <option value="All">All Items ({items.length})</option>
              <option value="Feed Medicine">Feed Medicine ({feedMedCount})</option>
              <option value="Raw Material">Raw Material ({rawMaterialCount})</option>
            </select>
          </div>

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
      </div>

      {/* 3. Table / Directory (Exact 1:1 match to General Medicine Master) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto min-h-[350px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-50 z-10 shadow-2xs">
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Medicine Name</th>
                <th className="py-3 px-4">Alias Name</th>
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Category</th>
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
                  <td colSpan={canManage ? 9 : 8} className="p-8 sm:p-12 text-center text-slate-500 font-medium">
                    Loading items...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="p-8 sm:p-12 text-center text-slate-500">
                    <p className="text-base font-semibold">No items found</p>
                    <p className="text-sm mt-1">Try changing your filters or add a new item.</p>
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const isDropup = idx >= items.length - 2 && idx > 0;
                  return (
                    <tr key={item._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        {item.code}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {item.name}
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {item.aliasName ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                            {item.aliasName}
                          </span>
                        ) : (
                          <span className="text-slate-300 italic text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {item.companyName ? (
                          <span className="font-medium text-slate-800">{item.companyName}</span>
                        ) : (
                          <span className="text-slate-300 italic text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                          {item.category || item.itemType}
                        </span>
                      </td>
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
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. Add / Edit Modal (EXACT CLONE OF GENERAL MEDICINE)    */}
      {/* Size: max-w-[360px], compact, identical field order       */}
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
                {editingId
                  ? `Edit ${formData.itemType}`
                  : `Add New ${formData.itemType === 'Feed Medicine' ? 'Medicine' : 'Raw Material'}`}
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

            {/* Modal Body Form */}
            <form onSubmit={handleSubmit} className="p-3 space-y-2.5">
              {modalError && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                  {modalError}
                </div>
              )}

              {/* Item Type Switcher (Feed Medicine vs Raw Material) */}
              {!editingId && (
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        itemType: 'Feed Medicine',
                        category: 'Regular',
                        packagingType: 'Bag',
                        packSize: '',
                        uom: 'kg',
                      }))
                    }
                    className={`py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      formData.itemType === 'Feed Medicine'
                        ? 'bg-white text-purple-700 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>💊</span>
                    <span>Feed Med</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        itemType: 'Raw Material',
                        category: null,
                        packagingType: 'Ton',
                        packSize: 1000,
                        uom: 'kg',
                      }))
                    }
                    className={`py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      formData.itemType === 'Raw Material'
                        ? 'bg-white text-amber-700 shadow-2xs font-extrabold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🌾</span>
                    <span>Raw Material</span>
                  </button>
                </div>
              )}

              {/* 1. Essential Fields: Medicine/Item Name & Alias Name (Exact row 1) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1 truncate">
                    {formData.itemType === 'Feed Medicine' ? 'Medicine Name' : 'Item Name'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder={
                      formData.itemType === 'Feed Medicine'
                        ? 'e.g. Paracetamol'
                        : 'e.g. Maize / Soya'
                    }
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
                    placeholder={
                      formData.itemType === 'Feed Medicine'
                        ? 'e.g. Toxin Binder (optional)'
                        : 'e.g. मक्का / Corn (optional)'
                    }
                    value={formData.aliasName}
                    onChange={(e) =>
                      setFormData({ ...formData, aliasName: e.target.value })
                    }
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                  />
                </div>
              </div>

              {/* 2. When Feed Medicine: Show Category & Packaging. When Raw Material: Hide Category */}
              {formData.itemType === 'Feed Medicine' ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Category (Regular / Treatment) */}
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

                    {/* Packaging */}
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
                              if (val === 'Ton') {
                                updates.packSize = 1000;
                                updates.uom = 'kg';
                              } else if (val === 'Vial') {
                                updates.packSize = 1;
                                updates.uom = prev.uom === 'kg' ? 'ml' : prev.uom;
                              } else if (prev.packagingType === 'Ton' && Number(prev.packSize) === 1000) {
                                updates.packSize = '';
                              }
                              return updates;
                            });
                          }}
                          options={DEFAULT_PACKAGINGS}
                          placeholder="-- Select --"
                          onAddCustom={() => {
                            setIsCustomPackaging(true);
                            setFormData({ ...formData, packagingType: '' });
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Row 3 for Feed Med: Pack Size & Unit */}
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
                </>
              ) : (
                /* RAW MATERIAL LAYOUT (No Category!) */
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Packaging Container */}
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
                              if (val === 'Ton') {
                                updates.packSize = 1000;
                                updates.uom = 'kg';
                              } else if (val === 'Vial') {
                                updates.packSize = 1;
                                updates.uom = prev.uom === 'kg' ? 'ml' : prev.uom;
                              } else if (prev.packagingType === 'Ton' && Number(prev.packSize) === 1000) {
                                updates.packSize = '';
                              }
                              return updates;
                            });
                          }}
                          options={DEFAULT_PACKAGINGS}
                          placeholder="-- Select --"
                          onAddCustom={() => {
                            setIsCustomPackaging(true);
                            setFormData({ ...formData, packagingType: '' });
                          }}
                        />
                      )}
                    </div>

                    {/* Unit of Measure */}
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

                  {/* Pack Size alone on row 3 for Raw Material */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                      Pack Size <span className="text-slate-400 font-normal">(Qty/Pack)</span> <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      placeholder="e.g. 50"
                      value={formData.packSize}
                      onChange={(e) =>
                        setFormData({ ...formData, packSize: e.target.value })
                      }
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                    />
                  </div>
                </>
              )}

              {/* Packaging Rule Formula Banner (Exact banner from General Med) */}
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

              {/* 4. More Details (Company Name / Code / Reorder Level) */}
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

              {/* Modal Footer Buttons */}
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
          </div>
        </div>
      )}
    </div>
  );
}
