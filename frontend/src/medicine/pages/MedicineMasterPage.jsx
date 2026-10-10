import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useSearchParams } from 'react-router-dom';
import {
  fetchMedicines,
  createMedicineApi,
  updateMedicineApi,
  toggleMedicineStatusApi,
  deleteCategoryApi,
  deleteUnitApi,
  deleteMedicineApi,
} from '../api/medicineApi.js';
import {
  fetchSuppliers,
  createSupplierApi,
  updateSupplierApi,
  toggleSupplierStatusApi,
} from '../api/supplierApi.js';
import { api } from '../../api/client.js';
import MedicineTransferAuditReport from '../components/MedicineTransferAuditReport.jsx';
import MedicineTransferModal from '../components/MedicineTransferModal.jsx';

const DEFAULT_CATEGORIES = [
  'General',
  'Vaccination',
  'Spray',
];

const DEFAULT_UNITS = [
  'Bottle',
  'Litre (L)',
  'Millilitre (ml)',
  'Kilogram (Kg)',
  'Gram (g)',
  'Vial',
  'Packet',
  'Tablet',
];

const INITIAL_FORM = {
  code: '',
  name: '',
  aliasName: '',
  category: 'General',
  unit: 'Bottle',
  shelfLifeMonths: '',
  minimumStock: '',
  reorderLevel: '',
};

// Compact scrollable dropdown that shows exactly 5 items, with remaining items scrollable below
function ScrollDropdown({
  value,
  onChange,
  options = [],
  placeholder = '-- Select --',
  onAddCustom,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close when clicking outside
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
      {/* Dropdown Toggle Button */}
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

      {/* Dropdown Menu (exactly 5 items visible, rest scrolled below) */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-[148px] overflow-y-auto py-0.5 divide-y divide-slate-100 animate-in fade-in duration-100 [scrollbar-width:thin] [scrollbar-color:#cbd5e1_transparent]">
          {options.map((opt) => {
            const isSelected = value === opt;
            return (
              <div
                key={opt}   //
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

export default function MedicineMasterPage() {
  const { user } = useAuth();
  const canManage = ['admin', 'developer'].includes(user?.role);

  // Data states
  const [medicines, setMedicines] = useState([]);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  // Pagination states (20 medicines per page)
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, statusFilter]);

   // useEffect to scr

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);

  // Tab State: 'medicines' | 'suppliers'
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'medicines';
  const setActiveTab = (tab) => {
    setSearchParams(tab === 'medicines' ? {} : { tab });
  };

  // Dedicated Suppliers Directory State
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierStatusFilter, setSupplierStatusFilter] = useState('all');
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState(null);
  const [supplierFormData, setSupplierFormData] = useState({
    code: '',
    name: '',
    contactPerson: '',
    mobile: '',
    email: '',
    address: '',
    gstin: '',
  });
  const [submittingSupplier, setSubmittingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState('');
  const [supplierSuccessMsg, setSupplierSuccessMsg] = useState('');

  // Dynamic categories & units combining poultry presets with database items
  const safeMedicines = Array.isArray(medicines) ? medicines.filter(Boolean) : [];
  const dbCategories = safeMedicines
    .map((m) => m?.category)
    .filter((cat) => cat && !['Feed Medicine', 'Sanitizers & Disinfectants', 'Dewormers', 'Supplements & Feed Additives', 'Vaccines'].includes(cat));
  const availableCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories]));

  const dbUnits = safeMedicines
    .map((m) => m?.unit)
    .filter((u) => u && !['Sachet / Packet', 'Tablet / Strip', 'Sachet', 'Strip'].includes(u));
  const availableUnits = Array.from(new Set([...DEFAULT_UNITS, ...dbUnits]));

  // Calculate 20 medicines per page
  const totalPages = Math.ceil(medicines.length / PAGE_SIZE) || 1;
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paginatedMedicines = medicines.slice(startIndex, startIndex + PAGE_SIZE);

  // Load MEDICINES FROM BACKEND
  const loadMedicines = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchMedicines({
        search,
        category: selectedCategory,
        status: statusFilter,
      });
      setMedicines(data.medicines || []);
    } catch (err) {
      setError(err.message || 'Failed to load medicines');
    } finally {
      setLoading(false);
    }
  };

  // Load suppliers list on mount
  const loadSuppliers = async () => {
    try {
      const res = await fetchSuppliers({ includeInactive: true });
      const list = (res.suppliers || []).filter((s) => !/apex/i.test(s.name));
      setAllSuppliers(list);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    }
  };

  useEffect(() => {
    loadSuppliers();
    api('/firms')
      .then((data) => setFirms(data.firms || data || []))
      .catch((err) => console.error('Failed to load firms:', err));
  }, []);

  // Automatically fetch medicines on page load and whenever filters change
  useEffect(() => {
    loadMedicines();
  }, [search, selectedCategory, statusFilter]);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isModalOpen) handleCloseModal();
        if (isSupplierModalOpen) handleCloseSupplierModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isSupplierModalOpen]);

  // OPEN MODAL HANDLERS
  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormData({
      code: '',
      name: '',
      aliasName: '',
      category: availableCategories[0] || 'General',
      unit: availableUnits[0] || 'Bottle',
      shelfLifeMonths: '',
      minimumStock: '',
      reorderLevel: '',
    });
    setIsCustomCategory(false);
    setIsCustomUnit(false);
    setShowAdvanced(false);
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (med) => {
    setEditingId(med._id);
    setFormData({
      code: med.code || '',
      name: med.name || '',
      aliasName: med.aliasName || '',
      category: med.category || '',
      unit: med.unit || '',
      shelfLifeMonths: med.shelfLifeMonths ?? '',
      minimumStock: med.minimumStock ?? '',
      reorderLevel: med.reorderLevel ?? '',
    });
    setIsCustomCategory(!availableCategories.includes(med.category));
    setIsCustomUnit(!availableUnits.includes(med.unit));
    setShowAdvanced(Boolean(med.aliasName || med.reorderLevel || med.code));
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setIsCustomCategory(false);
    setIsCustomUnit(false);
  };

  // Supplier Management Handlers
  const handleOpenAddSupplierModal = () => {
    setEditingSupplierId(null);
    setSupplierFormData({
      code: '',
      name: '',
      contactPerson: '',
      mobile: '',
      email: '',
      address: '',
      gstin: '',
    });
    setSupplierError('');
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplierModal = (sup) => {
    setEditingSupplierId(sup._id);
    setSupplierFormData({
      code: sup.code || '',
      name: sup.name || '',
      contactPerson: sup.contactPerson || '',
      mobile: sup.mobile || '',
      email: sup.email || '',
      address: sup.address || '',
      gstin: sup.gstin || '',
    });
    setSupplierError('');
    setIsSupplierModalOpen(true);
  };

  const handleCloseSupplierModal = () => {
    setIsSupplierModalOpen(false);
    setEditingSupplierId(null);
    setSupplierError('');
  };

  const handleSubmitSupplier = async (e) => {
    e.preventDefault();
    if (!supplierFormData.name?.trim()) {
      setSupplierError('Supplier / Company Name is required');
      return;
    }
    try {
      setSubmittingSupplier(true);
      setSupplierError('');
      if (editingSupplierId) {
        await updateSupplierApi(editingSupplierId, supplierFormData);
        setSupplierSuccessMsg('Supplier updated successfully!');
      } else {
        await createSupplierApi(supplierFormData);
        setSupplierSuccessMsg('Supplier registered successfully!');
      }
      setIsSupplierModalOpen(false);
      await loadSuppliers();
      setTimeout(() => setSupplierSuccessMsg(''), 3500);
    } catch (err) {
      setSupplierError(err.message || 'Failed to save supplier');
    } finally {
      setSubmittingSupplier(false);
    }
  };

  const handleToggleSupplierStatus = async (sup) => {
    try {
      await toggleSupplierStatusApi(sup._id);
      await loadSuppliers();
      setSupplierSuccessMsg(`Supplier ${sup.name} ${sup.active ? 'deactivated' : 'activated'} successfully.`);
      setTimeout(() => setSupplierSuccessMsg(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to update supplier status');
    }
  };

  const filteredSuppliers = useMemo(() => {
    let list = allSuppliers;
    if (supplierStatusFilter === 'active') {
      list = list.filter((s) => s.active !== false);
    } else if (supplierStatusFilter === 'inactive') {
      list = list.filter((s) => s.active === false);
    }
    if (supplierSearch.trim()) {
      const q = supplierSearch.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q) ||
          s.contactPerson?.toLowerCase().includes(q) ||
          s.mobile?.toLowerCase().includes(q) ||
          s.gstin?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.address?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allSuppliers, supplierStatusFilter, supplierSearch]);

  // SUBMIT FORM (CREATE OR UPDATE)
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      const trimmedCategory = formData.category?.trim();
      const trimmedUnit = formData.unit?.trim();

      if (!trimmedCategory) {
        throw new Error('Please select or enter a Category');
      }
      if (!trimmedUnit) {
        throw new Error('Please select or enter a Unit of measurement');
      }

      const payload = {
        code: formData.code ? formData.code.trim().toUpperCase() : '',
        name: formData.name.trim(),
        aliasName: formData.aliasName ? formData.aliasName.trim() : '',
        category: trimmedCategory,
        unit: trimmedUnit,
        shelfLifeMonths: formData.shelfLifeMonths ? Number(formData.shelfLifeMonths) : null,
        minimumStock: formData.minimumStock !== '' ? Number(formData.minimumStock) : 0,
        reorderLevel: formData.reorderLevel !== '' ? Number(formData.reorderLevel) : 0,
      };

      if (editingId) {
        await updateMedicineApi(editingId, payload);
        setSuccessMsg('Medicine updated successfully!');
      } else {
        await createMedicineApi(payload);
        setSuccessMsg('Medicine added successfully!');
      }
      handleCloseModal();
      loadMedicines();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      setError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ACTIVATE / DEACTIVATE
  const handleToggleStatus = async (id, currentStatus) => {
    const action = currentStatus ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} this medicine?`)) return;

    try {
      await toggleMedicineStatusApi(id);
      loadMedicines();
    } catch (err) {
      alert(err.message || 'Failed to update status.');
    }
  };

  // DELETE CATEGORY
  const handleDeleteCategory = async (catName) => {
    if (!catName) return;
    if (!window.confirm(`Are you sure you want to delete Category "${catName}"? Any medicines under this category will be changed to "General".`)) {
      return;
    }
    try {
      await deleteCategoryApi(catName);
      setSuccessMsg(`Category "${catName}" deleted successfully!`);
      if (formData.category === catName) {
        setFormData((prev) => ({ ...prev, category: '' }));
      }
      if (selectedCategory === catName) {
        setSelectedCategory('');
      }
      loadMedicines();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to delete category');
    }
  };

  // DELETE UNIT
  const handleDeleteUnit = async (unitName) => {
    if (!unitName) return;
    if (!window.confirm(`Are you sure you want to delete Unit "${unitName}"? Any medicines with this unit will be changed to "Unit".`)) {
      return;
    }
    try {
      await deleteUnitApi(unitName);
      setSuccessMsg(`Unit "${unitName}" deleted successfully!`);
      if (formData.unit === unitName) {
        setFormData((prev) => ({ ...prev, unit: '' }));
      }
      loadMedicines();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to delete unit');
    }
  };

  // DELETE MEDICINE
  const handleDeleteMedicine = async (med) => {
    if (!med) return;
    setOpenActionId(null);
    if (!window.confirm(`Are you sure you want to permanently delete medicine "${med.name}" (${med.code || 'No Code'})? This will remove the medicine and any related batches/records.`)) {
      return;
    }
    try {
      const res = await deleteMedicineApi(med._id);
      setSuccessMsg(res.message || `Medicine "${med.name}" deleted successfully.`);
      loadMedicines();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to delete medicine');
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4 w-full max-w-5xl mx-auto px-0 sm:px-2">
      {/* Top Navigation Tabs */}
      <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 p-1 sm:p-1.5 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto no-scrollbar whitespace-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab('medicines')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'medicines'
              ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>💊</span>
          <span>Medicines</span>
          <span className="hidden sm:inline">Catalog</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'medicines'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {medicines.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('suppliers')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'suppliers'
              ? 'bg-white text-emerald-800 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>🏭</span>
          <span>Suppliers</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'suppliers'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-200 text-slate-600'
            }`}
          >
            {allSuppliers.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transfers')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
            activeTab === 'transfers'
              ? 'bg-white text-blue-800 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>🔄</span>
          <span>Transfers</span>
          <span className="hidden sm:inline">Audit</span>
        </button>
      </div>

      {activeTab === 'medicines' && (
        <div className="space-y-3 sm:space-y-4">
          {/* 1. Header Section */}
          <div className="flex justify-between items-center gap-3 bg-white p-3 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base sm:text-2xl font-bold text-slate-800">General Medicine</h1>
          <p className="text-xs text-slate-500 hidden sm:block">Manage general medicine catalog, specifications, and stock alert levels</p>
        </div>
        {canManage && (
          <button
            onClick={handleOpenAddModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 sm:px-4 py-1.5 sm:py-2.5 rounded-lg shadow-xs transition flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm shrink-0"
          >
            <span className="text-base leading-none font-bold">+</span> Add Medicine
          </button>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs sm:text-sm font-medium">
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
          <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">Search</label>
          <input
            type="text"
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 sm:h-10 px-2.5 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Category & Status on mobile side-by-side */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-4">
          <div className="sm:w-60">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full h-8 sm:h-10 px-2 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
            >
              <option value="">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="sm:w-44">
            <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-600 uppercase mb-0.5">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-8 sm:h-10 px-2 sm:px-3 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer font-medium"
            >
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Medicines List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {loading ? (
          <div className="p-8 sm:p-12 text-center text-slate-500 font-medium">Loading medicines...</div>
        ) : medicines.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-slate-500">
            <p className="text-base font-semibold">No medicines found</p>
            <p className="text-sm mt-1">Try changing your filters or add a new medicine.</p>
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table View (hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto min-h-[400px]">
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-xs">
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Medicine Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4 text-center">Stock & Alert</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 pr-6 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedMedicines.map((med, idx) => {
                    const isDropup = idx >= paginatedMedicines.length - 2 && idx > 0;
                    return (
                      <tr key={med._id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">{med.code}</td>
                        <td className="py-3 px-4 font-medium text-slate-900">
                          <div className="font-semibold text-slate-900">{med.name}</div>
                          {med.aliasName && (
                            <div className="text-[11px] text-emerald-700 font-medium italic mt-0.5">
                              Alias: {med.aliasName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
                            {med.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{med.unit}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            {med.currentStock !== undefined && (
                              med.isLowStock ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <span>⚠️</span> {med.currentStock} {med.unit} (Low)
                                </span>
                              ) : med.currentStock === 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  <span>🔴</span> 0 {med.unit} (Out)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <span>🟢</span> {med.currentStock} {med.unit}
                                </span>
                              )
                            )}
                            {med.reorderLevel ? (
                              <span className="text-[10px] text-amber-700 font-medium">
                                Alert &lt; {med.reorderLevel} {med.unit}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                            med.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {med.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 pr-6 text-right">
                          <div className="relative inline-block text-left">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionId(openActionId === med._id ? null : med._id);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                              title="Actions"
                            >
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                              </svg>
                            </button>

                            {openActionId === med._id && (
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
                                      handleOpenEditModal(med);
                                    }}
                                    className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                  >
                                    <span>✏️</span> Edit Details
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenActionId(null);
                                      handleToggleStatus(med._id, med.active);
                                    }}
                                    className={`w-full px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                      med.active
                                        ? 'text-amber-700 hover:bg-amber-50'
                                        : 'text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <span>{med.active ? '⏸️' : '▶️'}</span>
                                    {med.active ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <div className="my-1 border-t border-slate-100" />
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMedicine(med)}
                                    className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition cursor-pointer"
                                  >
                                    <span>🗑️</span> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Compact List View (High Density for Mobile) */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedMedicines.map((med, idx) => {
                const isDropup = idx >= paginatedMedicines.length - 2 && idx > 0;
                return (
                  <div
                    key={med._id}
                    className="px-3 py-2.5 hover:bg-slate-50/80 transition space-y-1.5"
                  >
                    {/* Top Row: Code, Name, Alias, Status & Actions Menu */}
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer"
                        onClick={() => handleOpenEditModal(med)}
                        title="Tap to Edit"
                      >
                        <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                          {med.code}
                        </span>
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {med.name}
                        </span>
                        {med.aliasName && (
                          <span className="text-[10px] text-emerald-700 italic truncate shrink-0">
                            ({med.aliasName})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            med.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {med.active ? 'Active' : 'Inactive'}
                        </span>

                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionId(openActionId === `m-${med._id}` ? null : `m-${med._id}`);
                            }}
                            className="p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition focus:outline-none cursor-pointer"
                            title="Actions"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                            </svg>
                          </button>
                          {openActionId === `m-${med._id}` && (
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
                                    handleOpenEditModal(med);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition cursor-pointer"
                                >
                                  <span>✏️</span> Edit Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    handleToggleStatus(med._id, med.active);
                                  }}
                                  className={`w-full px-3 py-1.5 text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
                                    med.active ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                >
                                  <span>{med.active ? '⏸️' : '▶️'}</span>
                                  {med.active ? 'Deactivate' : 'Activate'}
                                </button>
                                <div className="my-1 border-t border-slate-100" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    handleDeleteMedicine(med);
                                  }}
                                  className="w-full px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition cursor-pointer"
                                >
                                  <span>🗑️</span> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Category/Unit on Left, Live Stock & Alert Pill on Right */}
                    <div
                      className="flex items-center justify-between gap-2 text-[10px] cursor-pointer"
                      onClick={() => handleOpenEditModal(med)}
                    >
                      <div className="flex items-center gap-1.5 text-slate-500 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium truncate max-w-[120px]">
                          {med.category}
                        </span>
                        <span>•</span>
                        <span className="font-medium text-slate-600">{med.unit}</span>
                      </div>

                      {/* Right: Low Stock Alert or Live Stock Pill */}
                      <div className="shrink-0">
                        {med.isLowStock ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span>⚠️</span>
                            <span>Stock: <strong>{med.currentStock} {med.unit}</strong></span>
                            <span className="text-rose-500 font-normal">(&lt;{med.reorderLevel})</span>
                          </span>
                        ) : med.currentStock === 0 ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <span>🔴</span> Out of Stock
                          </span>
                        ) : med.currentStock !== undefined ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                            <span>Stock:</span>
                            <strong className="text-slate-900">{med.currentStock} {med.unit}</strong>
                          </span>
                        ) : med.reorderLevel ? (
                          <span className="text-[10px] text-slate-500 font-medium">
                            Alert &lt; {med.reorderLevel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls (20 medicines per page) */}
            {medicines.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-slate-600 bg-slate-50/70 rounded-b-xl">
                <div>
                  Showing <span className="font-bold text-slate-800">{startIndex + 1}</span> to{' '}
                  <span className="font-bold text-slate-800">
                    {Math.min(startIndex + PAGE_SIZE, medicines.length)}
                  </span>{' '}
                  of <span className="font-bold text-slate-800">{medicines.length}</span> medicines
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer shadow-2xs"
                  >
                    ◀ Prev
                  </button>

                  <span className="px-2 font-semibold text-slate-700">
                    Page {currentPage} of {totalPages}
                  </span>

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition cursor-pointer shadow-2xs"
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )}

  {/* ======================================================== */}
  {/* SUPPLIERS DIRECTORY TAB                                  */}
  {/* ======================================================== */}
  {activeTab === 'suppliers' && (
    <div className="space-y-3 sm:space-y-4">
      {/* Suppliers Header */}
      <div className="flex justify-between items-center gap-2 bg-white p-2.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div className="min-w-0">
          <h1 className="text-sm sm:text-2xl font-bold text-slate-800 truncate">Suppliers Directory</h1>
          <p className="text-xs text-slate-500 hidden sm:block">
            Manage vendors & suppliers. All active suppliers show in the Stock In entry dropdown.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={handleOpenAddSupplierModal}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-2.5 sm:px-4 py-1.5 sm:py-2.5 rounded-lg shadow-xs transition flex items-center gap-1 cursor-pointer text-xs sm:text-sm shrink-0"
          >
            <span className="text-base leading-none font-bold">+</span>
            <span>Add Supplier</span>
          </button>
        )}
      </div>

      {/* Supplier Notifications */}
      {supplierSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs sm:text-sm font-medium">
          ✓ {supplierSuccessMsg}
        </div>
      )}
      {supplierError && !isSupplierModalOpen && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs sm:text-sm font-medium">
          ⚠ {supplierError}
        </div>
      )}

      {/* Suppliers Search & Filters */}
      <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search supplier, contact, phone, GSTIN..."
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
            className="w-full h-8 sm:h-9 pl-7 pr-7 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
          />
          <span className="absolute left-2 top-2 text-xs text-slate-400">🔍</span>
          {supplierSearch && (
            <button
              type="button"
              onClick={() => setSupplierSearch('')}
              className="absolute right-2 top-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex gap-1 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5">
          <button
            type="button"
            onClick={() => setSupplierStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer shrink-0 ${
              supplierStatusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
            }`}
          >
            All ({allSuppliers.length})
          </button>
          <button
            type="button"
            onClick={() => setSupplierStatusFilter('active')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition flex items-center gap-1 cursor-pointer shrink-0 ${
              supplierStatusFilter === 'active'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <span>🟢</span> Active ({allSuppliers.filter((s) => s.active !== false).length})
          </button>
          <button
            type="button"
            onClick={() => setSupplierStatusFilter('inactive')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer shrink-0 ${
              supplierStatusFilter === 'inactive'
                ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
            }`}
          >
            Inactive ({allSuppliers.filter((s) => s.active === false).length})
          </button>
        </div>
      </div>

      {/* Suppliers Table & Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Desktop View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Company / Supplier Name</th>
                <th className="py-2.5 px-3">Contact Person</th>
                <th className="py-2.5 px-3">Phone / Mobile</th>
                <th className="py-2.5 px-3">Address</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                {canManage && <th className="py-2.5 px-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 6 : 5} className="py-8 text-center text-slate-400">
                    No suppliers found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50/80 transition">
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {s.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {s.contactPerson || <span className="text-slate-400">--</span>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-medium">
                      {s.mobile ? (
                        <a href={`tel:${s.mobile}`} className="hover:text-emerald-700">
                          📞 {s.mobile}
                        </a>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                      <div>{s.address || <span className="text-slate-400">No address</span>}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          s.active !== false
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {s.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditSupplierModal(s)}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-semibold transition cursor-pointer"
                            title="Edit Supplier"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSupplierStatus(s)}
                            className={`px-2 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                              s.active !== false
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                            title={s.active !== false ? 'Deactivate' : 'Activate'}
                          >
                            {s.active !== false ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile View (Compact, High Density & Clean) */}
        <div className="sm:hidden divide-y divide-slate-100">
          {filteredSuppliers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">
              No suppliers found matching your filters.
            </div>
          ) : (
            filteredSuppliers.map((s) => {
              const hasContact = Boolean(s.contactPerson);
              const hasPhone = Boolean(s.mobile);
              const hasAddress = Boolean(s.address);
              const isActive = s.active !== false;

              return (
                <div key={s._id} className="p-2.5 space-y-1.5 hover:bg-slate-50/80 transition">
                  {/* Row 1: Name, Code & Status / Actions */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="min-w-0 flex items-center gap-1.5 flex-1">
                      <h4 className="font-bold text-xs text-slate-900 truncate">
                        {s.name}
                      </h4>
                      {s.code && (
                        <span className="font-mono text-[9px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded border border-slate-200 shrink-0">
                          {s.code}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${
                          isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isActive ? 'Active' : 'Inactive'}
                      </span>

                      {canManage && (
                        <div className="flex items-center gap-1 ml-0.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditSupplierModal(s)}
                            className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold border border-slate-200 transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleSupplierStatus(s)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                              isActive
                                ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Details (Only displayed if details exist, inline & compact) */}
                  {(hasContact || hasPhone) && (
                    <div className="flex items-center gap-3 text-[10px] text-slate-600 flex-wrap">
                      {hasContact && (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400">👤</span>
                          <span className="font-medium text-slate-700">{s.contactPerson}</span>
                        </span>
                      )}
                      {hasPhone && (
                        <a
                          href={`tel:${s.mobile}`}
                          className="flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                        >
                          <span>📞</span>
                          <span>{s.mobile}</span>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Row 3: Address (if any) */}
                  {hasAddress && (
                    <div className="text-[10px] text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate flex items-center gap-1">
                      <span>📍</span>
                      <span className="truncate">{s.address}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  )}

  {/* ======================================================== */}
  {/* 3. INTER-FIRM TRANSFER AUDIT TAB                         */}
  {/* ======================================================== */}
  {activeTab === 'transfers' && (
    <div className="space-y-3 sm:space-y-4">
      <MedicineTransferAuditReport
        key={auditRefreshKey}
        firms={firms}
        onOpenTransferModal={() => setIsTransferModalOpen(true)}
      />
    </div>
  )}

  {/* 4. Add / Edit Modal (Compact & Mobile-Optimized) */}
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
                {editingId ? 'Edit Medicine' : 'Add New Medicine'}
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

            {/* Modal Body Form (Auto-height, compact, 30% reduced width) */}
            <form onSubmit={handleSubmit} className="p-3 space-y-2.5">
              {error && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
                  {error}
                </div>
              )}

              {/* 1. Essential Field: Medicine Name */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Medicine Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* 2. Essential Fields Grid: Category & Unit */}
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
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <ScrollDropdown
                      value={formData.category}
                      onChange={(val) => setFormData({ ...formData, category: val })}
                      options={availableCategories}
                      placeholder="-- Select --"
                      onAddCustom={() => {
                        setIsCustomCategory(true);
                        setFormData({ ...formData, category: '' });
                      }}
                    />
                  )}
                </div>

                {/* Unit */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wide">
                      Unit <span className="text-rose-500">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomUnit(!isCustomUnit);
                        if (!isCustomUnit) {
                          setFormData({ ...formData, unit: '' });
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
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    />
                  ) : (
                    <ScrollDropdown
                      value={formData.unit}
                      onChange={(val) => setFormData({ ...formData, unit: val })}
                      options={availableUnits}
                      placeholder="-- Select --"
                      onAddCustom={() => {
                        setIsCustomUnit(true);
                        setFormData({ ...formData, unit: '' });
                      }}
                    />
                  )}
                </div>
              </div>

              {/* 3. Optional Advanced Settings Toggle */}
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
                      {/* Medicine Code */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                          Code <span className="text-slate-400 font-normal">(opt)</span>
                        </label>
                        <input
                          type="text"
                          disabled={Boolean(editingId)}
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                          className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs uppercase focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none bg-white font-mono"
                        />
                      </div>

                      {/* Alias / Brand Name */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                          Brand <span className="text-slate-400 font-normal">(opt)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.aliasName}
                          onChange={(e) => setFormData({ ...formData, aliasName: e.target.value })}
                          className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                        />
                      </div>
                    </div>

                    {/* Low Stock Alert Level */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-0.5">
                        Low Stock Alert <span className="text-slate-400 font-normal">(opt)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.reorderLevel}
                        onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                        className="w-full h-7.5 px-2 border border-slate-300 rounded-md text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Add / Edit Modal */}
      {isSupplierModalOpen && (
        <div
          onClick={handleCloseSupplierModal}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-100 cursor-default"
          >
            <div className="px-4 py-3 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏭</span>
                <h3 className="text-sm font-bold">
                  {editingSupplierId ? 'Edit Supplier' : 'Add New Supplier'}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseSupplierModal}
                className="text-white/80 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitSupplier} className="p-4 space-y-3">
              {supplierError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-medium">
                  ⚠ {supplierError}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Supplier / Company Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Virbac Animal Health"
                  value={supplierFormData.name}
                  onChange={(e) =>
                    setSupplierFormData({ ...supplierFormData, name: e.target.value })
                  }
                  className="w-full h-9 px-2.5 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Contact Person <span className="text-slate-400 font-normal">(opt)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rajesh Kumar"
                    value={supplierFormData.contactPerson}
                    onChange={(e) =>
                      setSupplierFormData({
                        ...supplierFormData,
                        contactPerson: e.target.value,
                      })
                    }
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                    Phone / Mobile <span className="text-slate-400 font-normal">(opt)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={supplierFormData.mobile}
                    onChange={(e) =>
                      setSupplierFormData({ ...supplierFormData, mobile: e.target.value })
                    }
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase mb-1">
                  Office / Warehouse Address <span className="text-slate-400 font-normal">(opt)</span>
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Plot 12, Industrial Area, Karnal, Haryana"
                  value={supplierFormData.address}
                  onChange={(e) =>
                    setSupplierFormData({ ...supplierFormData, address: e.target.value })
                  }
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseSupplierModal}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSupplier}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {submittingSupplier ? 'Saving...' : editingSupplierId ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Request Modal */}
      <MedicineTransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        firms={firms}
        onSuccess={() => setAuditRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
