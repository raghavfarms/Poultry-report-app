import { useState, useEffect } from 'react';
import {
  fetchReceipts,
  createReceiptApi,
  acceptReceiptApi,
  fetchBatchStock,
} from '../api/receiptApi.js';
import { fetchPurchaseOrders } from '../api/purchaseOrderApi.js';
import { fetchSuppliers } from '../api/supplierApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import { api } from '../../api/client.js';

const STATUS_BADGES = {
  PENDING_STORE_VERIFICATION: 'bg-amber-50 text-amber-700 border-amber-200',
  STORE_ACCEPTED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  STORE_REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

const EXPIRY_BADGES = {
  VALID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRING_60_DAYS: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  EXPIRING_30_DAYS: 'bg-orange-50 text-orange-700 border-orange-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
};

export default function MedicineReceiptPage() {
  // Active Sub-Tab: 'receipts' or 'batches'
  const [subTab, setSubTab] = useState('receipts');

  // Data states
  const [receipts, setReceipts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [firms, setFirms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedFarm, setSelectedFarm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [acceptingReceipt, setAcceptingReceipt] = useState(null); // For Store Acceptance Modal
  const [submitting, setSubmitting] = useState(false);

  // Create Form State
  const [formPo, setFormPo] = useState('');
  const [formMedicine, setFormMedicine] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formFarm, setFormFarm] = useState('');
  const [formBatchNumber, setFormBatchNumber] = useState('');
  const [formMfgDate, setFormMfgDate] = useState('');
  const [formExpiryDate, setFormExpiryDate] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formChallan, setFormChallan] = useState('');

  // Accept Form State
  const [acceptQty, setAcceptQty] = useState('');
  const [acceptRemarks, setAcceptRemarks] = useState('');

  // 1. Load Dropdowns
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [supData, medData, firmData, poData] = await Promise.all([
          fetchSuppliers(),
          fetchMedicines({ includeInactive: false }),
          api('/firms'),
          fetchPurchaseOrders({ status: 'ISSUED' }), // POs waiting for goods
        ]);
        setSuppliers(supData.suppliers || []);
        setMedicines(medData.medicines || []);
        setFirms(firmData.firms || []);
        setPurchaseOrders(poData.purchaseOrders || []);
      } catch (err) {
        console.error('Failed to load dropdowns', err);
      }
    }
    loadDropdowns();
  }, []);

  // 2. Load Receipts or Batches depending on active sub-tab
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      if (subTab === 'receipts') {
        const data = await fetchReceipts({
          search,
          farm: selectedFarm,
          status: selectedStatus,
        });
        setReceipts(data.receipts || []);
      } else {
        const data = await fetchBatchStock({
          farm: selectedFarm,
        });
        setBatches(data.batches || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [subTab, search, selectedFarm, selectedStatus]);

  // When a PO is selected in form, auto-populate supplier & available medicines
  const handlePoChange = (poId) => {
    setFormPo(poId);
    if (!poId) return;
    const po = purchaseOrders.find((p) => p._id === poId);
    if (po) {
      if (po.supplier?._id) setFormSupplier(po.supplier._id);
      if (po.items?.length > 0) {
        const firstMed = po.items[0].medicine;
        setFormMedicine(firstMed?._id || firstMed);
        const item = po.items[0];
        setFormQty(item.balanceQuantity || item.orderedQuantity);
      }
    }
  };

  // Open Create Receipt Modal
  const handleOpenCreate = () => {
    setFormPo('');
    setFormSupplier(suppliers[0]?._id || '');
    setFormMedicine(medicines[0]?._id || '');
    setFormFarm(firms[0]?._id || '');
    setFormBatchNumber('');
    setFormMfgDate('');
    setFormExpiryDate('');
    setFormQty('');
    setFormChallan('');
    setError('');
    setIsCreateModalOpen(true);
  };

  // Submit New Receipt
  const handleCreateReceipt = async (e) => {
    e.preventDefault();
    if (!formMedicine || !formSupplier || !formFarm || !formBatchNumber || !formExpiryDate || !formQty) {
      return setError('Please fill all mandatory fields');
    }

    try {
      setSubmitting(true);
      setError('');
      const selectedMedObj = medicines.find((m) => m._id === formMedicine);

      await createReceiptApi({
        purchaseOrder: formPo || null,
        medicine: formMedicine,
        supplier: formSupplier,
        farm: formFarm,
        batchNumber: formBatchNumber,
        manufacturingDate: formMfgDate || null,
        expiryDate: formExpiryDate,
        receivedQuantity: Number(formQty),
        unit: selectedMedObj?.unit || 'Bottle',
        invoiceOrChallanNo: formChallan,
      });

      setSuccessMsg('Receipt recorded! It is now pending Storekeeper verification.');
      setIsCreateModalOpen(false);
      loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to create receipt');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Accept Modal
  const handleOpenAccept = (rcp) => {
    setAcceptingReceipt(rcp);
    setAcceptQty(rcp.receivedQuantity);
    setAcceptRemarks('Physical condition verified, seals intact.');
    setError('');
  };

  // Confirm Storekeeper Acceptance
  const handleConfirmAccept = async (e) => {
    e.preventDefault();
    if (!acceptingReceipt) return;

    try {
      setSubmitting(true);
      setError('');
      await acceptReceiptApi(acceptingReceipt._id, {
        acceptedQuantity: Number(acceptQty),
        verificationRemarks: acceptRemarks,
      });

      setSuccessMsg(`Receipt ${acceptingReceipt.receiptNumber} accepted! Stock is now available.`);
      setAcceptingReceipt(null);
      loadData();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      alert(err.message || 'Failed to accept receipt');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. Header & Sub-Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-800">Medicine Receipts & Stock</h1>
          <p className="text-[11px] text-slate-500">
            Log deliveries, verify storekeeper acceptance, and track live batch stock
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Sub-tab toggle buttons */}
          <div className="bg-slate-100 p-0.5 rounded-lg flex text-xs font-semibold">
            <button
              onClick={() => setSubTab('receipts')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition text-center ${
                subTab === 'receipts'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📥 Receipts (GRN)
            </button>
            <button
              onClick={() => setSubTab('batches')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md transition text-center ${
                subTab === 'batches'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              📦 Live Batch Stock
            </button>
          </div>

          <button
            onClick={handleOpenCreate}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-2 rounded-lg shadow-xs transition flex items-center justify-center gap-1.5"
          >
            <span className="text-sm leading-none">+</span> New Receipt
          </button>
        </div>
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
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Search</label>
          <input
            type="text"
            placeholder={subTab === 'receipts' ? 'Receipt #, Batch, Challan...' : 'Batch number...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-7.5 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Farm Location</label>
          <select
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full h-7.5 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Farms</option>
            {firms.map((f) => (
              <option key={f._id} value={f._id}>{f.name}</option>
            ))}
          </select>
        </div>

        {subTab === 'receipts' && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-7.5 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="PENDING_STORE_VERIFICATION">Pending Verification</option>
              <option value="STORE_ACCEPTED">Store Accepted</option>
              <option value="STORE_REJECTED">Store Rejected</option>
            </select>
          </div>
        )}
      </div>

      {/* 3A. VIEW 1: RECEIPTS LIST */}
      {subTab === 'receipts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-xs">Loading receipts...</div>
          ) : receipts.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              No delivery receipts found. Click <strong>+ New Receipt</strong> to record arriving medicine.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Receipt #</th>
                    <th className="py-2.5 px-3">Medicine & Batch</th>
                    <th className="py-2.5 px-3">Supplier & PO</th>
                    <th className="py-2.5 px-3">Farm</th>
                    <th className="py-2.5 px-3 text-center">Expiry</th>
                    <th className="py-2.5 px-3 text-center">Qty (Recv / Acc)</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {receipts.map((rcp) => (
                    <tr key={rcp._id} className="hover:bg-slate-50/75 transition">
                      <td className="py-2 px-3">
                        <div className="font-bold text-slate-900">{rcp.receiptNumber}</div>
                        <div className="text-[10px] text-slate-400">{new Date(rcp.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-slate-800">{rcp.medicine?.name}</div>
                        <div className="text-[10px] text-emerald-700 font-mono font-bold">Batch: {rcp.batchNumber}</div>
                      </td>
                      <td className="py-2 px-3">
                        <div className="text-slate-800">{rcp.supplier?.name}</div>
                        {rcp.purchaseOrder ? (
                          <div className="text-[10px] text-blue-600 font-bold">{rcp.purchaseOrder.poNumber}</div>
                        ) : (
                          <div className="text-[10px] text-slate-400">Direct / No PO</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600 font-medium">{rcp.farm?.name}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700">{rcp.expiryDate}</td>
                      <td className="py-2 px-3 text-center font-bold">
                        <span>{rcp.receivedQuantity}</span>
                        <span className="text-slate-400 font-normal"> / </span>
                        <span className="text-emerald-700">{rcp.storeAcceptedQuantity || 0}</span>
                        <span className="text-[10px] text-slate-400 font-normal block">{rcp.unit}</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            STATUS_BADGES[rcp.status] || 'bg-slate-100'
                          }`}
                        >
                          {rcp.status === 'PENDING_STORE_VERIFICATION' ? 'Pending Store' : rcp.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        {rcp.status === 'PENDING_STORE_VERIFICATION' ? (
                          <button
                            onClick={() => handleOpenAccept(rcp)}
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-2xs transition"
                          >
                            Verify & Accept
                          </button>
                        ) : (
                          <span className="text-[11px] font-semibold text-emerald-700">✓ In Stock</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="sm:hidden divide-y divide-slate-100">
              {receipts.map((rcp) => (
                <div key={rcp._id} className="p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono font-bold text-slate-900">{rcp.receiptNumber}</span>
                      <div className="text-[10px] text-slate-400">{new Date(rcp.createdAt).toLocaleDateString()}</div>
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        STATUS_BADGES[rcp.status] || 'bg-slate-100'
                      }`}
                    >
                      {rcp.status === 'PENDING_STORE_VERIFICATION' ? 'Pending Store' : rcp.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Medicine</span>
                      <span className="font-semibold text-slate-800">{rcp.medicine?.name}</span>
                      <div className="text-[10px] text-emerald-700 font-mono font-bold">Batch: {rcp.batchNumber}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Supplier</span>
                      <span className="font-medium text-slate-700">{rcp.supplier?.name}</span>
                      {rcp.purchaseOrder && (
                        <div className="text-[10px] text-blue-600 font-bold">{rcp.purchaseOrder.poNumber}</div>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Farm</span>
                      <span className="font-medium text-slate-700">{rcp.farm?.name}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Expiry</span>
                      <span className="font-mono font-medium text-slate-700">{rcp.expiryDate}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Qty (Recv / Acc)</span>
                      <span className="font-bold text-slate-800">{rcp.receivedQuantity}</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-emerald-700 font-bold">{rcp.storeAcceptedQuantity || 0}</span>
                      <span className="text-[10px] text-slate-400 ml-1">{rcp.unit}</span>
                    </div>
                    <div>
                      {rcp.status === 'PENDING_STORE_VERIFICATION' ? (
                        <button
                          onClick={() => handleOpenAccept(rcp)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition"
                        >
                          Verify & Accept
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-emerald-700">✓ In Stock</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )}

      {/* 3B. VIEW 2: LIVE BATCH INVENTORY */}
      {subTab === 'batches' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-slate-400 text-xs">Loading batch stock...</div>
          ) : batches.length === 0 ? (
            <div className="p-6 text-center text-slate-500 text-xs">
              No live batch inventory found. Accept delivery receipts to add stock here.
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Medicine</th>
                      <th className="py-2.5 px-3">Batch Number</th>
                      <th className="py-2.5 px-3">Farm</th>
                      <th className="py-2.5 px-3">Supplier</th>
                      <th className="py-2.5 px-3 text-center">Expiry Date</th>
                      <th className="py-2.5 px-3 text-center">Shelf Life Status</th>
                      <th className="py-2.5 px-3 text-right">Available Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.map((b) => (
                      <tr key={b._id} className="hover:bg-slate-50/75 transition">
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{b.medicine?.name}</div>
                          <div className="text-[10px] text-slate-400">{b.medicine?.code} • {b.medicine?.category?.replace('_', ' ')}</div>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {b.batchNumber}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-medium">{b.farm?.name}</td>
                        <td className="py-2 px-3 text-slate-600">{b.supplier?.name}</td>
                        <td className="py-2 px-3 text-center font-mono font-medium text-slate-800">{b.expiryDate}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${
                              EXPIRY_BADGES[b.expiryAlert] || 'bg-slate-100'
                            }`}
                          >
                            {b.daysRemaining <= 0
                              ? 'EXPIRED'
                              : `${b.daysRemaining} days left`}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="font-extrabold text-sm text-emerald-700">
                            {b.quantityAvailable} <span className="text-[11px] font-normal text-slate-500">{b.unit}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">Orig: {b.initialQuantity}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="sm:hidden divide-y divide-slate-100">
                {batches.map((b) => (
                  <div key={b._id} className="p-3 space-y-2 text-xs">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{b.medicine?.name}</h3>
                        <span className="text-[10px] text-slate-400">{b.medicine?.code} • {b.medicine?.category?.replace('_', ' ')}</span>
                      </div>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          EXPIRY_BADGES[b.expiryAlert] || 'bg-slate-100'
                        }`}
                      >
                        {b.daysRemaining <= 0 ? 'EXPIRED' : `${b.daysRemaining}d left`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Batch</span>
                        <span className="font-mono font-bold text-slate-800">{b.batchNumber}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Farm</span>
                        <span className="font-medium text-slate-700">{b.farm?.name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Supplier</span>
                        <span className="font-medium text-slate-700 truncate block">{b.supplier?.name}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Expiry Date</span>
                        <span className="font-mono font-medium text-slate-700">{b.expiryDate}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-1 border-t border-slate-50">
                      <span className="text-[10px] text-slate-400">Original Inward: {b.initialQuantity} {b.unit}</span>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Available</span>
                        <span className="font-extrabold text-sm text-emerald-700">{b.quantityAvailable} {b.unit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 4. MODAL: CREATE RECEIPT (GRN) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-xl border border-slate-100 my-auto animate-in fade-in zoom-in duration-150">
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100 shrink-0">
              <h2 className="text-xs sm:text-sm font-bold text-slate-800">Record Medicine Receipt (GRN)</h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-0.5 text-base font-bold leading-none"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateReceipt} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-3 sm:p-3.5 overflow-y-auto space-y-2.5 flex-1">
                {error && (
                  <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] font-medium">
                    ⚠ {error}
                  </div>
                )}

                {/* Optional PO Selector */}
                <div>
                  <label className="block text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-0.5">
                    Link to Purchase Order (Optional)
                  </label>
                  <select
                    value={formPo}
                    onChange={(e) => handlePoChange(e.target.value)}
                    className="w-full h-8 px-2 border border-blue-200 bg-blue-50/30 rounded-lg text-xs font-semibold text-blue-900 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">Direct Delivery (No PO)</option>
                    {purchaseOrders.map((po) => (
                      <option key={po._id} value={po._id}>
                        {po.poNumber} — {po.supplier?.name} ({po.items?.length} items)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Medicine & Supplier */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                      Medicine <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formMedicine}
                      onChange={(e) => setFormMedicine(e.target.value)}
                      required
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Select Medicine</option>
                      {medicines.map((m) => (
                        <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.unit}</option>
                      ))}
                    </select>
                  </div>

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
                </div>

                {/* Farm & Challan */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                      Destination Farm <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={formFarm}
                      onChange={(e) => setFormFarm(e.target.value)}
                      required
                      className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    >
                      <option value="">Select Farm</option>
                      {firms.map((f) => (
                        <option key={f._id} value={f._id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-0.5">
                      Challan / Invoice #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. INV-9042"
                      value={formChallan}
                      onChange={(e) => setFormChallan(e.target.value)}
                      className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Batch & Expiry Details */}
                <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 space-y-2">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide block">
                    Physical Batch Details
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                        Batch No <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. AMX-001"
                        required
                        value={formBatchNumber}
                        onChange={(e) => setFormBatchNumber(e.target.value)}
                        className="w-full h-7 px-2 border border-slate-300 rounded text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">Mfg Date</label>
                      <input
                        type="date"
                        value={formMfgDate}
                        onChange={(e) => setFormMfgDate(e.target.value)}
                        className="w-full h-7 px-2 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                        Expiry Date <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="date"
                        required
                        value={formExpiryDate}
                        onChange={(e) => setFormExpiryDate(e.target.value)}
                        className="w-full h-7 px-2 border border-slate-300 rounded text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                      Received Quantity <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 50"
                      required
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      className="w-full h-7 px-2 border border-slate-300 rounded text-xs font-bold text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
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
                  {submitting ? 'Recording...' : 'Record Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: STOREKEEPER VERIFICATION & ACCEPTANCE */}
      {acceptingReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-md w-full shadow-xl border border-slate-100 my-auto animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <h2 className="text-xs sm:text-sm font-bold text-slate-800">Storekeeper Verification</h2>
              <button
                onClick={() => setAcceptingReceipt(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 text-base font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAccept} className="p-4 space-y-3">
              {/* Receipt Summary Card */}
              <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg text-xs space-y-1">
                <div className="flex justify-between font-bold text-slate-800">
                  <span>{acceptingReceipt.medicine?.name}</span>
                  <span className="font-mono text-emerald-700">Batch: {acceptingReceipt.batchNumber}</span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Stated Delivered Qty: <strong className="text-slate-700">{acceptingReceipt.receivedQuantity} {acceptingReceipt.unit}</strong>
                </div>
                <div className="text-[11px] text-slate-500">
                  Farm: {acceptingReceipt.farm?.name} • Expiry: {acceptingReceipt.expiryDate}
                </div>
              </div>

              {/* Accepted Quantity */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                  Verified & Accepted Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  max={acceptingReceipt.receivedQuantity}
                  value={acceptQty}
                  onChange={(e) => setAcceptQty(e.target.value)}
                  required
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-bold text-emerald-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  If there was breakage or leakage, enter the actual accepted count.
                </span>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                  Verification Remarks
                </label>
                <input
                  type="text"
                  value={acceptRemarks}
                  onChange={(e) => setAcceptRemarks(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAcceptingReceipt(null)}
                  className="px-3 h-8 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 h-8 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Accepting...' : '✓ Confirm & Post Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}