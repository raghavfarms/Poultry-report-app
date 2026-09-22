import { useState, useEffect } from 'react';
import {
  fetchPurchaseOrders,
  createPurchaseOrderApi,
  updatePurchaseOrderStatusApi,
} from '../api/purchaseOrderApi.js';
import { fetchSuppliers } from '../api/supplierApi.js';
import { fetchMedicines } from '../api/medicineApi.js';

const STATUS_COLORS = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-300',
  ISSUED: 'bg-blue-50 text-blue-700 border-blue-200',
  PARTIALLY_RECEIVED: 'bg-purple-50 text-purple-700 border-purple-200',
  FULFILLED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const INITIAL_ITEM = { medicine: '', orderedQuantity: 1, unitPrice: 0 };

export default function PurchaseOrderPage() {
  // Data state
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filter state
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null); // For detail view modal
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formSupplier, setFormSupplier] = useState('');
  const [formOrderDate, setFormOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [formDeliveryDate, setFormDeliveryDate] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formItems, setFormItems] = useState([INITIAL_ITEM]);

  // 1. Load Dropdowns (Suppliers & Active Medicines)
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [supData, medData] = await Promise.all([
          fetchSuppliers(),
          fetchMedicines({ includeInactive: false }),
        ]);
        setSuppliers(supData.suppliers || []);
        setMedicines(medData.medicines || []);
      } catch (err) {
        console.error('Failed to load dropdowns', err);
      }
    }
    loadDropdowns();
  }, []);

  // 2. Load Purchase Orders
  const loadOrders = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchPurchaseOrders({
        search,
        supplier: selectedSupplier,
        status: selectedStatus,
      });
      setOrders(data.purchaseOrders || []);
    } catch (err) {
      setError(err.message || 'Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [search, selectedSupplier, selectedStatus]);

  // Handle Items in Form
  const handleAddItem = () => {
    setFormItems([...formItems, { ...INITIAL_ITEM, medicine: medicines[0]?._id || '' }]);
  };

  const handleRemoveItem = (index) => {
    if (formItems.length === 1) return; // Keep at least one row
    setFormItems(formItems.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index, field, value) => {
    const updated = [...formItems];
    updated[index][field] = value;
    setFormItems(updated);
  };

  // Calculate live Grand Total in modal
  const calculatedGrandTotal = formItems.reduce((acc, item) => {
    const qty = Number(item.orderedQuantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return acc + qty * price;
  }, 0);

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setFormSupplier(suppliers[0]?._id || '');
    setFormOrderDate(new Date().toISOString().split('T')[0]);
    setFormDeliveryDate('');
    setFormNotes('');
    setFormItems([{ ...INITIAL_ITEM, medicine: medicines[0]?._id || '' }]);
    setError('');
    setIsCreateModalOpen(true);
  };

  // Submit PO
  const handleCreatePo = async (e) => {
    e.preventDefault();
    if (!formSupplier) return setError('Please select a supplier');
    if (formItems.some((i) => !i.medicine || i.orderedQuantity <= 0)) {
      return setError('Please ensure all items have a selected medicine and quantity > 0');
    }

    try {
      setSubmitting(true);
      setError('');
      await createPurchaseOrderApi({
        supplier: formSupplier,
        orderDate: formOrderDate,
        expectedDeliveryDate: formDeliveryDate || null,
        notes: formNotes,
        items: formItems.map((item) => ({
          medicine: item.medicine,
          orderedQuantity: Number(item.orderedQuantity),
          unitPrice: Number(item.unitPrice) || 0,
        })),
      });

      setSuccessMsg('Purchase Order created successfully as DRAFT!');
      setIsCreateModalOpen(false);
      loadOrders();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to create Purchase Order');
    } finally {
      setSubmitting(false);
    }
  };

  // Change Status (e.g. DRAFT -> ISSUED or CANCELLED)
  const handleStatusChange = async (poId, newStatus) => {
    const confirmMsg =
      newStatus === 'ISSUED'
        ? 'Issue this Purchase Order to the supplier? Items will become locked.'
        : `Are you sure you want to change status to ${newStatus}?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await updatePurchaseOrderStatusApi(poId, newStatus);
      setSuccessMsg(`PO status updated to ${newStatus}`);
      loadOrders();
      if (selectedPo && selectedPo._id === poId) {
        setSelectedPo((prev) => ({ ...prev, status: newStatus }));
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-800">Purchase Orders (PO)</h1>
          <p className="text-[11px] text-slate-500">
            Create and track supplier procurement orders, items, and delivery fulfillment
          </p>
        </div>
        <button
          onClick={handleOpenCreateModal}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg shadow-xs transition flex items-center justify-center gap-1.5"
        >
          <span className="text-sm leading-none">+</span> Create Purchase Order
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-medium">
          ✓ {successMsg}
        </div>
      )}
      {error && !isCreateModalOpen && (
        <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-medium">
          ⚠ {error}
        </div>
      )}

      {/* 2. Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Search PO #</label>
          <input
            type="text"
            placeholder="e.g. PO-2026..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-7.5 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Supplier</label>
          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="w-full h-7.5 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Suppliers</option>
            {suppliers.map((s) => (
              <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full h-7.5 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            {Object.keys(STATUS_COLORS).map((st) => (
              <option key={st} value={st}>{st.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 3. Orders List (Mobile Cards + Desktop Table) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-slate-400 text-xs">Loading purchase orders...</div>
        ) : orders.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            No purchase orders found. Click <strong>+ Create Purchase Order</strong> to create your first order.
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">PO Number</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3 text-center">Items</th>
                    <th className="py-2.5 px-3 text-right">Total (₹)</th>
                    <th className="py-2.5 px-3 text-center">Fulfillment</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((po) => {
                    const percent =
                      po.totalOrdered > 0
                        ? Math.min(100, Math.round((po.totalReceived / po.totalOrdered) * 100))
                        : 0;

                    return (
                      <tr key={po._id} className="hover:bg-slate-50/75 transition">
                        <td className="py-2 px-3 font-bold text-slate-900">{po.poNumber}</td>
                        <td className="py-2 px-3 text-slate-500">{po.orderDate}</td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-800">{po.supplier?.name || '—'}</div>
                          <div className="text-[10px] text-slate-400">{po.supplier?.code}</div>
                        </td>
                        <td className="py-2 px-3 text-center font-medium">
                          {po.items?.length || 0}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-slate-800">
                          ₹{(po.totalAmount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 min-w-[110px]">
                          <div className="flex justify-between text-[10px] mb-0.5 font-semibold text-slate-500">
                            <span>{po.totalReceived} / {po.totalOrdered}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                percent === 100 ? 'bg-emerald-500' : percent > 0 ? 'bg-purple-500' : 'bg-slate-300'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                              STATUS_COLORS[po.status] || 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {po.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelectedPo(po)}
                              className="px-2 py-0.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition"
                            >
                              View
                            </button>
                            {po.status === 'DRAFT' && (
                              <button
                                onClick={() => handleStatusChange(po._id, 'ISSUED')}
                                className="px-2 py-0.5 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition"
                                title="Issue this PO to supplier"
                              >
                                Issue
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (< 640px) */}
            <div className="sm:hidden divide-y divide-slate-100">
              {orders.map((po) => {
                const percent =
                  po.totalOrdered > 0
                    ? Math.min(100, Math.round((po.totalReceived / po.totalOrdered) * 100))
                    : 0;

                return (
                  <div key={po._id} className="p-3 space-y-1.5">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-xs text-slate-900">{po.poNumber}</div>
                        <div className="text-[11px] font-semibold text-slate-700">{po.supplier?.name}</div>
                        <div className="text-[10px] text-slate-400">Date: {po.orderDate}</div>
                      </div>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                          STATUS_COLORS[po.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {po.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-50">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Total Amount</span>
                        <span className="font-bold text-slate-800">₹{(po.totalAmount || 0).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Fulfillment</span>
                        <span className="font-bold text-purple-700">{po.totalReceived} / {po.totalOrdered} ({percent}%)</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          percent === 100 ? 'bg-emerald-500' : percent > 0 ? 'bg-purple-500' : 'bg-slate-300'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {/* Mobile Action Buttons */}
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => setSelectedPo(po)}
                        className="flex-1 py-1 text-center text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition"
                      >
                        View Details
                      </button>
                      {po.status === 'DRAFT' && (
                        <button
                          onClick={() => handleStatusChange(po._id, 'ISSUED')}
                          className="flex-1 py-1 text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition"
                        >
                          Issue PO
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 4. CREATE PO MODAL (Compact & Neat for Desktop & Mobile) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-100 my-auto animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-800">Create Purchase Order</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 text-base font-bold leading-none"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCreatePo} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-3 sm:p-3.5 overflow-y-auto space-y-2.5 flex-1">
                {error && (
                  <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] font-medium">
                    ⚠ {error}
                  </div>
                )}

                {/* Top 3 Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {/* Supplier */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                      Supplier <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formSupplier}
                      onChange={(e) => setFormSupplier(e.target.value)}
                      required
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Select Supplier</option>
                      {suppliers.map((s) => (
                        <option key={s._id} value={s._id}>{s.name} ({s.code})</option>
                      ))}
                    </select>
                  </div>

                  {/* Order Date */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                      Order Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={formOrderDate}
                      onChange={(e) => setFormOrderDate(e.target.value)}
                      required
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>

                  {/* Expected Delivery */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                      Expected Delivery
                    </label>
                    <input
                      type="date"
                      value={formDeliveryDate}
                      onChange={(e) => setFormDeliveryDate(e.target.value)}
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Ordered Medicines Section */}
                <div className="border border-slate-200 rounded-lg p-2 bg-slate-50/75 space-y-1.5">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                      Ordered Medicines ({formItems.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="h-5 px-2 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded transition flex items-center gap-1"
                    >
                      + Add Item
                    </button>
                  </div>

                  {formItems.map((item, idx) => {
                    const selectedMed = medicines.find((m) => m._id === item.medicine);
                    const subtotal = (Number(item.orderedQuantity) || 0) * (Number(item.unitPrice) || 0);

                    return (
                      <div
                        key={idx}
                        className="bg-white p-1.5 rounded-lg border border-slate-200 shadow-2xs space-y-1 sm:space-y-0 sm:flex sm:items-center sm:gap-1.5"
                      >
                        {/* Medicine Dropdown */}
                        <div className="flex-1 min-w-0 flex items-center gap-1">
                          <select
                            value={item.medicine}
                            onChange={(e) => handleItemChange(idx, 'medicine', e.target.value)}
                            required
                            className="w-full h-7 px-2 border border-slate-300 rounded text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none truncate"
                          >
                            <option value="">Select Medicine *</option>
                            {medicines.map((m) => (
                              <option key={m._id} value={m._id}>
                                {m.name} ({m.code}) — {m.unit}
                              </option>
                            ))}
                          </select>
                          {/* Mobile-only delete button */}
                          {formItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="sm:hidden text-slate-400 hover:text-rose-600 p-0.5 text-xs font-bold leading-none"
                              title="Remove"
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Qty, Rate, Subtotal */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Quantity + Unit */}
                          <div className="flex items-center w-20 relative">
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={item.orderedQuantity}
                              onChange={(e) => handleItemChange(idx, 'orderedQuantity', e.target.value)}
                              required
                              className="w-full h-7 pl-1.5 pr-6 border border-slate-300 rounded text-xs font-bold text-slate-800 text-center focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            />
                            <span className="absolute right-1 text-[9px] text-slate-400 font-bold uppercase pointer-events-none truncate max-w-[20px]">
                              {selectedMed?.unit || 'qty'}
                            </span>
                          </div>

                          {/* Rate */}
                          <div className="w-20">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Rate ₹"
                              value={item.unitPrice || ''}
                              onChange={(e) => handleItemChange(idx, 'unitPrice', e.target.value)}
                              className="w-full h-7 px-1.5 border border-slate-300 rounded text-xs text-right font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                            />
                          </div>

                          {/* Subtotal */}
                          <div className="w-16 text-right font-bold text-xs text-slate-800 truncate">
                            ₹{subtotal.toLocaleString('en-IN')}
                          </div>

                          {/* Desktop delete */}
                          {formItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="hidden sm:inline-flex text-slate-400 hover:text-rose-600 w-5 h-7 items-center justify-center text-xs font-bold transition"
                              title="Remove item"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Grand Total bar */}
                  <div className="flex justify-between items-center py-1 px-2 text-xs font-bold text-slate-700 bg-white rounded-lg border border-slate-200/80">
                    <span className="text-[11px]">Total ({formItems.length} {formItems.length === 1 ? 'item' : 'items'}):</span>
                    <span className="text-emerald-700 text-xs sm:text-sm font-extrabold">
                      ₹{calculatedGrandTotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                    Notes / Instructions
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Optional delivery or packing instructions..."
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Modal Footer Buttons */}
              <div className="flex justify-end gap-2 px-4 py-2 bg-slate-50 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 h-8 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 h-8 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Save as DRAFT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. VIEW PO DETAILS MODAL (Compact) */}
      {selectedPo && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-100 my-auto animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900">{selectedPo.poNumber}</h2>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                    STATUS_COLORS[selectedPo.status]
                  }`}
                >
                  {selectedPo.status.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={() => setSelectedPo(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 text-base font-bold leading-none"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-3 sm:p-3.5 overflow-y-auto space-y-2.5 flex-1">
              {/* Supplier Info */}
              <div className="grid grid-cols-2 gap-2 p-2 bg-slate-50 rounded-lg text-xs">
                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[9px]">Supplier</span>
                  <span className="font-bold text-slate-800 text-[11px]">{selectedPo.supplier?.name}</span>
                  <span className="text-slate-500 block text-[10px]">{selectedPo.supplier?.code}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-bold text-[9px]">Contact</span>
                  <span className="font-medium text-slate-700 text-[11px]">{selectedPo.supplier?.contactPerson || '—'}</span>
                  <span className="text-slate-500 block text-[10px]">{selectedPo.supplier?.mobile || '—'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 font-bold text-slate-500 text-[9px] uppercase border-b border-slate-200">
                    <tr>
                      <th className="py-1.5 px-2">Medicine</th>
                      <th className="py-1.5 px-1.5 text-center">Ord</th>
                      <th className="py-1.5 px-1.5 text-center">Recv</th>
                      <th className="py-1.5 px-1.5 text-center">Bal</th>
                      <th className="py-1.5 px-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPo.items?.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-2">
                          <div className="font-bold text-slate-800 text-[11px]">{item.medicine?.name}</div>
                          <div className="text-[9px] text-slate-400">{item.medicine?.code}</div>
                        </td>
                        <td className="py-1 px-1.5 text-center font-semibold text-[11px]">
                          {item.orderedQuantity} {item.medicine?.unit}
                        </td>
                        <td className="py-1 px-1.5 text-center text-purple-700 font-bold text-[11px]">
                          {item.receivedQuantity || 0}
                        </td>
                        <td className="py-1 px-1.5 text-center text-slate-500 font-semibold text-[11px]">
                          {item.balanceQuantity ?? (item.orderedQuantity - (item.receivedQuantity || 0))}
                        </td>
                        <td className="py-1 px-2 text-right font-bold text-slate-800 text-[11px]">
                          ₹{(item.totalPrice || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-slate-50 p-2 flex justify-between items-center text-xs font-bold border-t border-slate-200">
                  <span className="text-[11px]">Grand Total:</span>
                  <span className="text-emerald-700 text-xs sm:text-sm font-extrabold">
                    ₹{(selectedPo.totalAmount || 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedPo.notes && (
                <div className="p-2 bg-slate-50 rounded-lg text-xs">
                  <span className="text-slate-400 font-bold block uppercase text-[9px]">Notes:</span>
                  <p className="text-slate-700 text-[11px]">{selectedPo.notes}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-4 py-2 bg-slate-50 border-t border-slate-100 shrink-0">
              {selectedPo.status === 'DRAFT' && (
                <button
                  onClick={() => handleStatusChange(selectedPo._id, 'ISSUED')}
                  className="px-3 h-8 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition"
                >
                  ✓ Issue to Supplier
                </button>
              )}
              <button
                onClick={() => setSelectedPo(null)}
                className="ml-auto px-3 h-8 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}