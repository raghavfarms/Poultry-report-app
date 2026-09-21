import { useState, useEffect } from 'react';
import {
  fetchSuppliers,
  createSupplierApi,
  updateSupplierApi,
  toggleSupplierStatusApi,
} from '../api/supplierApi.js';

const INITIAL_FORM = {
  code: '',
  name: '',
  contactPerson: '',
  mobile: '',
  email: '',
  address: '',
  gstin: '',
};

export default function SupplierMasterPage() {
  // Data & loading state
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);

  // Modal & form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  // Load suppliers from backend
  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchSuppliers({
        search,
        includeInactive,
      });
      setSuppliers(data.suppliers || []);
    } catch (err) {
      setError(err.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, [search, includeInactive]);

  // Modal open/close handlers
  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setError('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (sup) => {
    setEditingId(sup._id);
    setFormData({
      code: sup.code,
      name: sup.name,
      contactPerson: sup.contactPerson || '',
      mobile: sup.mobile || '',
      email: sup.email || '',
      address: sup.address || '',
      gstin: sup.gstin || '',
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
  };

  // Submit form (Create or Update)
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      if (editingId) {
        await updateSupplierApi(editingId, formData);
        setSuccessMsg('Supplier updated successfully!');
      } else {
        await createSupplierApi(formData);
        setSuccessMsg('Supplier created successfully!');
      }

      handleCloseModal();
      loadSuppliers();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to save supplier');
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle status (Active / Inactive)
  const handleToggleStatus = async (id) => {
    try {
      setError('');
      await toggleSupplierStatusApi(id);
      loadSuppliers();
    } catch (err) {
      setError(err.message || 'Failed to update supplier status');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">
            🏭 Supplier Master
          </h1>
          <p className="text-xs text-slate-500 md:text-sm">
            Manage medicine vendors, contact details, and GSTIN information.
          </p>
        </div>
        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 md:text-sm"
        >
          + Add Supplier
        </button>
      </div>

      {/* Success & Error Banners */}
      {successMsg && (
        <div className="rounded-md bg-emerald-50 p-3 text-xs font-medium text-emerald-800 border border-emerald-200">
          ✓ {successMsg}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-xs font-medium text-red-800 border border-red-200">
          ✕ {error}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder="Search by name, code, contact..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-full rounded-md border border-slate-200 px-3 text-xs focus:border-emerald-500 focus:outline-none sm:w-72"
        />

        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Show Inactive Suppliers
        </label>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Loading suppliers...
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">
          No suppliers found. Click "+ Add Supplier" to create one.
        </div>
      ) : (
        <>
          {/* DESKTOP TABLE (hidden md:block) */}
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Supplier Name</th>
                  <th className="px-4 py-3">Contact Person</th>
                  <th className="px-4 py-3">Phone / Mobile</th>
                  <th className="px-4 py-3">GSTIN</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {suppliers.map((sup) => (
                  <tr key={sup._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {sup.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {sup.name}
                      {sup.email && (
                        <span className="block text-[11px] text-slate-400">
                          {sup.email}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{sup.contactPerson || '—'}</td>
                    <td className="px-4 py-3">{sup.mobile || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      {sup.gstin || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          sup.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {sup.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditModal(sup)}
                        className="font-medium text-emerald-600 hover:text-emerald-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(sup._id)}
                        className={`font-medium ${
                          sup.active
                            ? 'text-red-600 hover:text-red-800'
                            : 'text-emerald-600 hover:text-emerald-800'
                        }`}
                      >
                        {sup.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS (md:hidden) */}
          <div className="space-y-3 md:hidden">
            {suppliers.map((sup) => (
              <div
                key={sup._id}
                className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm space-y-2 text-xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-semibold text-slate-800">
                      {sup.code}
                    </span>
                    <h2 className="font-bold text-slate-900">{sup.name}</h2>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      sup.active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {sup.active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] pt-1 border-t border-slate-100">
                  <div>
                    <span className="text-slate-400">Contact: </span>
                    {sup.contactPerson || '—'}
                  </div>
                  <div>
                    <span className="text-slate-400">Mobile: </span>
                    {sup.mobile || '—'}
                  </div>
                  {sup.gstin && (
                    <div className="col-span-2">
                      <span className="text-slate-400">GSTIN: </span>
                      <span className="font-mono">{sup.gstin}</span>
                    </div>
                  )}
                  {sup.address && (
                    <div className="col-span-2 truncate">
                      <span className="text-slate-400">Address: </span>
                      {sup.address}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => handleOpenEditModal(sup)}
                    className="font-medium text-emerald-600 hover:text-emerald-800"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(sup._id)}
                    className={`font-medium ${
                      sup.active ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {sup.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* COMPACT MODAL (Add / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl border border-slate-200">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
              <h2 className="text-sm font-bold text-slate-800">
                {editingId ? 'Edit Supplier' : 'Add New Supplier'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                {/* Code */}
                <div>
                  <label className="mb-1 block font-medium text-slate-700">
                    Supplier Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingId}
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="e.g. SUP-001"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs uppercase focus:border-emerald-500 focus:outline-none disabled:bg-slate-100"
                  />
                </div>

                {/* Name */}
                <div>
                  <label className="mb-1 block font-medium text-slate-700">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g. BioVet Pharma"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label className="mb-1 block font-medium text-slate-700">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={formData.contactPerson}
                    onChange={(e) =>
                      setFormData({ ...formData, contactPerson: e.target.value })
                    }
                    placeholder="e.g. Rajesh Sharma"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Mobile */}
                <div>
                  <label className="mb-1 block font-medium text-slate-700">
                    Mobile Number
                  </label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) =>
                      setFormData({ ...formData, mobile: e.target.value })
                    }
                    placeholder="e.g. 9876543210"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1 block font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="sales@biovet.com"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* GSTIN */}
                <div>
                  <label className="mb-1 block font-medium text-slate-700">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={formData.gstin}
                    onChange={(e) =>
                      setFormData({ ...formData, gstin: e.target.value.toUpperCase() })
                    }
                    placeholder="22AAAAA0000A1Z5"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs uppercase focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Address (full width) */}
                <div className="col-span-2">
                  <label className="mb-1 block font-medium text-slate-700">
                    Address
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) =>
                      setFormData({ ...formData, address: e.target.value })
                    }
                    placeholder="Plot 12, Industrial Area, Phase 1"
                    className="h-8 w-full rounded border border-slate-200 px-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingId ? 'Update Supplier' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}