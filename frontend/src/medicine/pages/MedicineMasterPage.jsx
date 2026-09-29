
import { useState, useEffect, useRef } from 'react';
import {
  fetchMedicines,
  createMedicineApi,
  updateMedicineApi,
  toggleMedicineStatusApi,
  deleteCategoryApi,
  deleteUnitApi,
  deleteMedicineApi,
} from '../api/medicineApi.js';
const DEFAULT_CATEGORIES = [
  'Feed Medicine',
  'Vaccine',
  'General',
  'Antibiotics',
  'Vitamins & Minerals',
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
  category: 'Feed Medicine',
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
              className="px-2.5 py-1.5 text-xs text-emerald-600 font-bold hover:bg-emerald-50 cursor-pointer flex items-center gap-1 bg-slate-50/50"
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
  // Data states
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [openActionId, setOpenActionId] = useState(null);

  // Dynamic categories & units combining poultry presets with database items
  const safeMedicines = Array.isArray(medicines) ? medicines.filter(Boolean) : [];
  const dbCategories = safeMedicines
    .map((m) => m?.category)
    .filter((cat) => cat && !['Sanitizers & Disinfectants', 'Dewormers', 'Supplements & Feed Additives', 'Vaccines'].includes(cat));
  const availableCategories = Array.from(new Set([...DEFAULT_CATEGORIES, ...dbCategories]));

  const dbUnits = safeMedicines
    .map((m) => m?.unit)
    .filter((u) => u && !['Sachet / Packet', 'Tablet / Strip', 'Sachet', 'Strip'].includes(u));
  const availableUnits = Array.from(new Set([...DEFAULT_UNITS, ...dbUnits]));

//  Load MEDICINES FROM BACKEND 

const loadMedicines= async ()=>{
 
    try{
         setLoading(true);
         setError('');
         //calling fetchMedicines with paramters 
         const data=await fetchMedicines({
            search,
            category:selectedCategory,
            includeInactive,
         });

         setMedicines(data.medicines || []);
    }catch(err){
        setError(err.message || 'failed to load medicines');
    }finally{
        setLoading(false);
    }
}

  // Automatically fetch medicines on page load and whenever filter chnages 

  useEffect(()=>{
    loadMedicines();
  },[search,selectedCategory,includeInactive]);

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleCloseModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);


   // OPEN MODAL HANDLERS
   const handleOpenAddModal = () => {
     setEditingId(null);
     setFormData({
       code: '',
       name: '',
       aliasName: '',
       category: availableCategories[0] || 'Feed Medicine',
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
     const handleToggleStatus= async (id,currentStatus)=>{
          const action=currentStatus ? 'deactivate' : 'activate';
          if(!window.confirm(`Are you sure you want to ${action} this medicine `))
            return;
 
      try{
        // calling toggleMedicineStatusApi with (id)
        await toggleMedicineStatusApi(id);
        loadMedicines(); // refresh table 
          } catch (err) {
      alert(err.message || 'Failed to update status.');
    }
  }; // <-- This closes handleToggleStatus

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
    if (!window.confirm(`Are you sure you want to permanently delete medicine "${med.name}" (${med.code || 'No Code'})?`)) {
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

  // Now comes the return statement INSIDE the component:
  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Medicine Master Admin View */}
      {/* 1. Header Section */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 sm:gap-4 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Medicine Master</h1>
          <p className="text-xs sm:text-sm text-slate-500">Manage medicine catalog, specifications, and stock alert levels</p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg shadow transition flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span> Add Medicine
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs sm:text-sm font-medium">
          ✓ {successMsg}
        </div>
      )}
      {error && !isModalOpen && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs sm:text-sm font-medium">
          ⚠ {error}
        </div>
      )}

      {/* 2. Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm items-stretch sm:items-center">
        {/* Search */}
        <div className="flex-1">
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Search</label>
          <input
            type="text"
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Category Filter */}
        <div className="sm:w-64">
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white cursor-pointer"
          >
            <option value="">All Categories</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Inactive Checkbox */}
        <div className="sm:pt-5 sm:self-center">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            <span className="whitespace-nowrap">Show Inactive</span>
          </label>
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
            <div className="hidden md:block overflow-x-auto min-h-[240px] pb-12">
              <table className="w-full min-w-[700px] text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Medicine Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4 text-center">Stock Alert</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 pr-6 text-right w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {medicines.map((med) => (
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
                        {med.reorderLevel ? (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            Alert &lt; {med.reorderLevel} {med.unit}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
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
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none"
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
                              <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-left animate-in fade-in zoom-in-95 duration-100">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    handleOpenEditModal(med);
                                  }}
                                  className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-emerald-700 flex items-center gap-2 transition"
                                >
                                  <span>✏️</span> Edit Details
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    handleToggleStatus(med._id, med.active);
                                  }}
                                  className={`w-full px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition ${
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
                                  className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition"
                                >
                                  <span>🗑️</span> Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (visible only on mobile phones) */}
            <div className="md:hidden divide-y divide-slate-100">
              {medicines.map((med) => (
                <div key={med._id} className="p-4 space-y-3 hover:bg-slate-50/50 transition">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {med.code}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base mt-1 leading-snug">{med.name}</h3>
                      {med.aliasName && (
                        <p className="text-xs text-emerald-700 font-medium italic mt-0.5">
                          Alias: {med.aliasName}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        med.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {med.active ? 'Active' : 'Inactive'}
                      </span>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionId(openActionId === `m-${med._id}` ? null : `m-${med._id}`);
                          }}
                          className="p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition focus:outline-none"
                          title="Actions"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                        {openActionId === `m-${med._id}` && (
                          <>
                            <div
                              className="fixed inset-0 z-20 cursor-default"
                              onClick={() => setOpenActionId(null)}
                            />
                            <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 text-left">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  handleOpenEditModal(med);
                                }}
                                className="w-full px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition"
                              >
                                <span>✏️</span> Edit Details
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  handleToggleStatus(med._id, med.active);
                                }}
                                className={`w-full px-3.5 py-2 text-xs font-semibold flex items-center gap-2 transition ${
                                  med.active ? 'text-amber-700 hover:bg-amber-50' : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                <span>{med.active ? '⏸️' : '▶️'}</span>
                                {med.active ? 'Deactivate' : 'Activate'}
                              </button>
                              <div className="my-1 border-t border-slate-100" />
                              <button
                                type="button"
                                onClick={() => handleDeleteMedicine(med)}
                                className="w-full px-3.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition"
                              >
                                <span>🗑️</span> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Category</span>
                      <span className="font-medium text-slate-800">{med.category}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Unit</span>
                      <span className="font-medium text-slate-800">{med.unit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Stock Alert</span>
                      <span className="font-medium text-slate-800">
                        {med.reorderLevel ? `< ${med.reorderLevel} ${med.unit}` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => handleOpenEditModal(med)}
                      className="flex-1 py-2 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-semibold text-xs text-center hover:bg-blue-100 transition"
                    >
                      ✏ Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(med._id, med.active)}
                      className={`flex-1 py-2 px-3 rounded-lg font-semibold text-xs text-center border transition ${
                        med.active
                          ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {med.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 4. Add / Edit Modal (Compact & Mobile-Optimized) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2.5 sm:p-4 overflow-y-auto cursor-pointer"
          onClick={handleCloseModal}
        >
          <div
            className="bg-white w-full max-w-[325px] rounded-xl shadow-2xl animate-in fade-in zoom-in duration-150 my-auto cursor-default"
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
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold transition cursor-pointer"
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
                      className="text-[10px] text-emerald-600 hover:text-emerald-700 font-bold transition cursor-pointer"
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
    </div>
  );
} // <-- This closes MedicineMasterPage

