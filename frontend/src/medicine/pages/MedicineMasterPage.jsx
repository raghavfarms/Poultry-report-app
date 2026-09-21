
import { useState,useEffect} from 'react';
import{
    fetchMedicines,
    createMedicineApi,
    updateMedicineApi,
    toggleMedicineStatusApi,
} from '../api/medicineApi.js'

const CATEGORIES=['FEED_MEDICINE','GENERAL_MEDICINE','VACCINATION'];
const UNITS = ['Bottle', 'Litre', 'ml', 'Kg', 'Gram', 'Tablet', 'Dose', 'Packet', 'Vial', 'Other'];

const INITIAL_FORM = {
  code: '',
  name: '',
  category: 'GENERAL_MEDICINE',
  unit: 'Bottle',
  manufacturer: '',
  shelfLifeMonths: '',
  minimumStock: 0,
  reorderLevel: 0,
};


export default function MedicineMasterPage(){

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
   const handleOpenAddModal=()=>{
     setEditingId(null);
     setFormData(INITIAL_FORM);
     setError('');
     setIsModalOpen(true);
   };

   const handleOpenEditModal=(med)=>{

    setEditingId(med._id);
    setFormData({
         code: med.code,
      name: med.name,
      category: med.category,
      unit: med.unit,
      manufacturer: med.manufacturer || '',
      shelfLifeMonths: med.shelfLifeMonths ?? '',
      minimumStock: med.minimumStock ?? 0,
      reorderLevel: med.reorderLevel ?? 0,
    });
       setError('');
       setIsModalOpen(true);

   };


   const handleCloseModal=()=>{
       setIsModalOpen(false);
       setEditingId(null);
       setFormData(INITIAL_FORM);

   };

   // SUBMIT FORM (CREATE OR UPDATE)

   const handleSubmit= async(e)=>{
     e.preventDefault();
     try{
        setSubmitting(true);
        setError('');

     if(editingId){
       // Calling updateMedicineApi with (id, formData)
       await updateMedicineApi(editingId,formData);
       setSuccessMsg('Medicine added successfully!');
     }else{
        // Calling createMedicineApi with (formData)
        await createMedicineApi(formData);
        setSuccessMsg('Medicine added successfully!')
     }
       handleCloseModal();
       loadMedicines(); // Refresh table with latest data 
       setTimeout(()=> setSuccessMsg(''),3500);
     }catch(err){
        setError(err.message || `operation failed `)
     }finally{
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

  // Now comes the return statement INSIDE the component:
  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
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
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace('_', ' ')}</option>
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
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
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
            <div className="hidden md:block overflow-x-auto">
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
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {medicines.map((med) => (
                    <tr key={med._id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{med.code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">{med.name}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          med.category === 'VACCINATION'
                            ? 'bg-purple-100 text-purple-800'
                            : med.category === 'FEED_MEDICINE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {med.category.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{med.unit}</td>
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
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditModal(med)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-xs px-2 py-1 rounded hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleStatus(med._id, med.active)}
                          className={`font-medium text-xs px-2 py-1 rounded ${
                            med.active
                              ? 'text-rose-600 hover:text-rose-800 hover:bg-rose-50'
                              : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                          }`}
                        >
                          {med.active ? 'Deactivate' : 'Activate'}
                        </button>
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
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                      med.active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {med.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">Category</span>
                      <span className="font-medium text-slate-800">{med.category.replace('_', ' ')}</span>
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

              {/* Row 1: Code & Unit (Placing Unit near the top gives its 10-item dropdown plenty of space below!) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                    Code <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingId)}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    placeholder="MED-001"
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs uppercase focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                    Unit <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white font-medium text-slate-700"
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: Medicine Name (Full width for long medicine names) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Medicine Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Amoxicillin Trihydrate"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Row 3: Category (Full width so GENERAL MEDICINE is never truncated) */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Category <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-white font-medium text-slate-700"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Row 4: Manufacturer */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                  Manufacturer / Brand
                </label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g. Pfizer, Cadila"
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Row 5: Shelf Life, Min Stock, Reorder Level */}
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
                    placeholder="24"
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
                    onChange={(e) => setFormData({ ...formData, minimumStock: Number(e.target.value) })}
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
                    onChange={(e) => setFormData({ ...formData, reorderLevel: Number(e.target.value) })}
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
    </div>
  );
} // <-- This closes MedicineMasterPage

