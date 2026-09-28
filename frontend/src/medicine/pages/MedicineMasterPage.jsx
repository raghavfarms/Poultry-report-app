
import { useState, useEffect } from 'react';
import {
  fetchMedicines,
  createMedicineApi,
  updateMedicineApi,
  toggleMedicineStatusApi,
  deleteCategoryApi,
  deleteUnitApi,
  deleteMedicineApi,
} from '../api/medicineApi.js';
import SupplierMasterPage from './SupplierMasterPage.jsx';
import PurchaseOrderPage from './PurchaseOrderPage.jsx';
import MedicineReceiptPage from './MedicineReceiptPage.jsx';
import MedicineIssuePage from './MedicineIssuePage.jsx';
import MedicineAdjustmentPage from './MedicineAdjustmentPage.jsx';
import MedicineReportPage from './MedicineReportPage.jsx';
import MedicineDispatchPage from './MedicineDispatchPage.jsx';

const INITIAL_FORM = {
  code: '',
  name: '',
  aliasName: '',
  category: '',
  unit: '',
  manufacturer: '',
  shelfLifeMonths: '',
  minimumStock: '',
  reorderLevel: '',
};


export default function MedicineMasterPage(){

// tab state
const [activeTab, setActiveTab] = useState('medicines');

// state variable 
const [medicines,setMedicines]=useState([]);
const [loading, setLoading]=useState(true);
const [error,setError]=useState('');
const [successMsg,setSuccessMsg]=useState('');

// filter state 

const [search,setSearch]=useState('');
const [selectedCategory,setSelectedCategory]=useState('');
const [includeInactive,setIncludeInactive]=useState(false);

// Modal & Form State 
const [isModalOpen,setIsModalOpen]=useState(false);
const [editingId,setEditingId]=useState(null);
const [formData,setFormData]=useState(INITIAL_FORM);
const [submitting,setSubmitting]=useState(false);
const [isCustomCategory, setIsCustomCategory] = useState(false);
const [isCustomUnit, setIsCustomUnit] = useState(false);
const [openActionId, setOpenActionId] = useState(null);

// Dynamic categories & units derived purely from existing medicines in database (Zero dummy data)
const safeMedicines = Array.isArray(medicines) ? medicines.filter(Boolean) : [];
const availableCategories = Array.from(
  new Set(safeMedicines.map((m) => m?.category).filter(Boolean))
);

const availableUnits = Array.from(
  new Set(safeMedicines.map((m) => m?.unit).filter(Boolean))
);

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


   // OPEN MODAL HANDLERS
   const handleOpenAddModal = () => {
     setEditingId(null);
     setFormData({
       code: '',
       name: '',
       aliasName: '',
       category: availableCategories[0] || '',
       unit: availableUnits[0] || '',
       manufacturer: '',
       shelfLifeMonths: '',
       minimumStock: '',
       reorderLevel: '',
     });
     setIsCustomCategory(availableCategories.length === 0);
     setIsCustomUnit(availableUnits.length === 0);
     setError('');
     setIsModalOpen(true);
   };

   const handleOpenEditModal = (med) => {
     setEditingId(med._id);
     setFormData({
       code: med.code,
       name: med.name,
       aliasName: med.aliasName || '',
       category: med.category || '',
       unit: med.unit || '',
       manufacturer: med.manufacturer || '',
       shelfLifeMonths: med.shelfLifeMonths ?? '',
       minimumStock: med.minimumStock ?? '',
       reorderLevel: med.reorderLevel ?? '',
     });
     setIsCustomCategory(!availableCategories.includes(med.category));
     setIsCustomUnit(!availableUnits.includes(med.unit));
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
         code: formData.code.trim().toUpperCase(),
         code: formData.code ? formData.code.trim().toUpperCase() : '',
         name: formData.name.trim(),
         aliasName: formData.aliasName ? formData.aliasName.trim() : '',
         category: trimmedCategory,
         unit: trimmedUnit,
         manufacturer: formData.manufacturer ? formData.manufacturer.trim() : '',
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
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Tab Navigation (Mobile Responsive with smooth horizontal scroll) */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-6 overflow-x-auto no-scrollbar scrollbar-none pb-0 -mx-3 px-3 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveTab('medicines')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'medicines'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>💊</span> Medicine Catalog
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('suppliers')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'suppliers'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>🏭</span> Suppliers
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('purchaseOrders')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'purchaseOrders'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>📋</span> Purchase Orders (PO)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('receipts')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'receipts'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>📥</span> Receipts & Stock (GRN)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('issues')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'issues'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>💉</span> Issues & Consumption (FEFO)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('adjustments')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'adjustments'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>🔄</span> Returns & Adjustments
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'reports'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>📊</span> Analytics & Reports
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dispatches')}
          className={`shrink-0 whitespace-nowrap pb-2.5 sm:pb-3 text-xs sm:text-sm font-bold border-b-2 transition flex items-center gap-1.5 sm:gap-2 ${
            activeTab === 'dispatches'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>🚚</span> HO Dispatches & Gate
        </button>
      </div>

      {activeTab === 'suppliers' ? (
        <SupplierMasterPage />
      ) : activeTab === 'purchaseOrders' ? (
        <PurchaseOrderPage />
      ) : activeTab === 'receipts' ? (
        <MedicineReceiptPage />
      ) : activeTab === 'issues' ? (
        <MedicineIssuePage />
      ) : activeTab === 'adjustments' ? (
        <MedicineAdjustmentPage />
      ) : activeTab === 'reports' ? (
        <MedicineReportPage />
      ) : activeTab === 'dispatches' ? (
        <MedicineDispatchPage />
      ) : (
        <>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-sm">
        {/* Search */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Search</label>
          <input
            type="text"
            placeholder="Search code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Category Filter */}
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">Category</label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Categories</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Inactive Checkbox */}
        <div className="flex items-center sm:pt-6">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
            />
            Show Inactive Medicines
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
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Unit</th>
                    <th className="py-3 px-4">Manufacturer</th>
                    <th className="py-3 px-4 text-center">Min / Reorder</th>
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
                      <td className="py-3 px-4 text-slate-500">{med.manufacturer || '—'}</td>
                      <td className="py-3 px-4 text-center text-slate-600 font-mono">
                        {med.minimumStock} / {med.reorderLevel}
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

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Category</span>
                      <span className="font-medium text-slate-800">{med.category}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Unit</span>
                      <span className="font-medium text-slate-800">{med.unit}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Manufacturer</span>
                      <span className="font-medium text-slate-800">{med.manufacturer || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Min / Reorder</span>
                      <span className="font-mono font-medium text-slate-800">{med.minimumStock} / {med.reorderLevel}</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3">
          <div className="bg-white w-full max-w-sm sm:max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                {editingId ? 'Edit Medicine' : 'Add New Medicine'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl leading-none p-1"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSubmit} className="p-3.5 sm:p-4 space-y-2.5">
              {error && (
                <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] font-medium">
                  {error}
                </div>
              )}

              {/* Row 1: Code */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Medicine Code <span className="text-slate-400 font-normal lowercase">(optional, auto-generated if blank)</span>
                </label>
                <input
                  type="text"
                  disabled={Boolean(editingId)}
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. MED-001 (or leave blank)"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs uppercase focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none"
                />
              </div>

              {/* Row 2: Medicine Name (Generic / Chemical) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Medicine Name (Generic / Chemical) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Amoxicillin Trihydrate 20%"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Row 3: Alias Name (Brand / Local Trade Name) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Alias / Brand Name <span className="text-slate-400 font-normal">(Optional, e.g. Moxikem, Local Trade Name)</span>
                </label>
                <input
                  type="text"
                  value={formData.aliasName}
                  onChange={(e) => setFormData({ ...formData, aliasName: e.target.value })}
                  placeholder="e.g. Moxikem-500 or Trade Name"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Row 4: Category / Type (Dynamic Dropdown / Custom Entry) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Category / Type <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomCategory(!isCustomCategory);
                      if (!isCustomCategory) {
                        setFormData({ ...formData, category: '' });
                      }
                    }}
                    className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold transition cursor-pointer"
                  >
                    {isCustomCategory ? '← Choose from dropdown' : '+ Add New Category'}
                  </button>
                </div>

                {isCustomCategory || availableCategories.length === 0 ? (
                  <input
                    type="text"
                    required
                    autoFocus={isCustomCategory}
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Type new category (e.g. Vaccination, General, Feed)..."
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                ) : (
                  <select
                    required
                    value={formData.category}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomCategory(true);
                        setFormData({ ...formData, category: '' });
                      } else {
                        setFormData({ ...formData, category: e.target.value });
                      }
                    }}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white font-medium text-slate-700 cursor-pointer"
                  >
                    <option value="">-- Select Category --</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <option value="__NEW__" className="text-emerald-600 font-bold">
                      + Add New Category...
                    </option>
                  </select>
                )}
              </div>

              {/* Row 5: Unit of Measurement (Dynamic Dropdown / Custom Entry) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    Unit of Measurement <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomUnit(!isCustomUnit);
                      if (!isCustomUnit) {
                        setFormData({ ...formData, unit: '' });
                      }
                    }}
                    className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold transition cursor-pointer"
                  >
                    {isCustomUnit ? '← Choose from dropdown' : '+ Add New Unit'}
                  </button>
                </div>

                {isCustomUnit || availableUnits.length === 0 ? (
                  <input
                    type="text"
                    required
                    autoFocus={isCustomUnit}
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="Type new unit (e.g. Bottle, Vial, Litre, Kg)..."
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                ) : (
                  <select
                    required
                    value={formData.unit}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomUnit(true);
                        setFormData({ ...formData, unit: '' });
                      } else {
                        setFormData({ ...formData, unit: e.target.value });
                      }
                    }}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white font-medium text-slate-700 cursor-pointer"
                  >
                    <option value="">-- Select Unit --</option>
                    {availableUnits.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    <option value="__NEW__" className="text-emerald-600 font-bold">
                      + Add New Unit...
                    </option>
                  </select>
                )}
              </div>

              {/* Row 6: Manufacturer */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Manufacturer / Brand
                </label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g. Pfizer, Cadila (Optional)"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Row 7: Shelf Life, Min Stock, Reorder Level */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5 truncate">
                    Shelf Life (Mo)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.shelfLifeMonths}
                    onChange={(e) => setFormData({ ...formData, shelfLifeMonths: e.target.value })}
                    placeholder="e.g. 12"
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5 truncate">
                    Min Stock
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.minimumStock}
                    onChange={(e) => setFormData({ ...formData, minimumStock: e.target.value })}
                    placeholder="e.g. 10"
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5 truncate">
                    Reorder Lvl
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reorderLevel}
                    onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
                    placeholder="e.g. 5"
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
} // <-- This closes MedicineMasterPage

