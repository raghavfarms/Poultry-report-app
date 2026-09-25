import React, { useState, useEffect } from 'react';
import {
  fetchDispatches,
  createDispatchApi,
  confirmGateReceiptApi,
  storeAcceptDispatchApi,
} from '../api/dispatchApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import { api } from '../../api/client.js';

const STATUS_BADGES = {
  DISPATCHED: 'bg-blue-50 text-blue-800 border-blue-200',
  GATE_RECEIVED: 'bg-amber-50 text-amber-800 border-amber-200',
  STORE_ACCEPTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200',
};

export default function MedicineDispatchPage() {
  const [dispatches, setDispatches] = useState([]);
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
  const [gateModalDispatch, setGateModalDispatch] = useState(null);
  const [storeModalDispatch, setStoreModalDispatch] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Create Form State
  const [formFarm, setFormFarm] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formVehicle, setFormVehicle] = useState('');
  const [formDriver, setFormDriver] = useState('');
  const [formDriverMobile, setFormDriverMobile] = useState('');
  const [formRemarks, setFormRemarks] = useState('');
  const [formItems, setFormItems] = useState([
    {
      medicine: '',
      batchNumber: '',
      manufacturingDate: '',
      expiryDate: '',
      dispatchedQuantity: '',
      unit: 'Bottle',
    },
  ]);

  // Gate Form State
  const [gatePackages, setGatePackages] = useState('');
  const [gateDamage, setGateDamage] = useState(false);
  const [gateRemarks, setGateRemarks] = useState('');

  // Store Accept Form State
  const [storeRemarks, setStoreRemarks] = useState('');

  // Load Dispatches
  const loadDispatches = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchDispatches({
        destinationFarm: selectedFarm,
        status: selectedStatus,
        search,
      });
      setDispatches(data.dispatches || []);
    } catch (err) {
      setError(err.message || 'Failed to load dispatches');
    } finally {
      setLoading(false);
    }
  };

  // Load Initial Metadata (Farms, Medicines)
  useEffect(() => {
    async function loadMeta() {
      try {
        const [medData, firmData] = await Promise.all([
          fetchMedicines({ includeInactive: false }),
          api('/firms'),
        ]);
        setMedicines(medData.medicines || []);
        setFirms(firmData || []);
      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    }
    loadMeta();
  }, []);

  useEffect(() => {
    loadDispatches();
  }, [selectedFarm, selectedStatus, search]);

  // Form item handlers
  const handleAddItem = () => {
    setFormItems((prev) => [
      ...prev,
      {
        medicine: '',
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
        dispatchedQuantity: '',
        unit: 'Bottle',
      },
    ]);
  };

  const handleRemoveItem = (index) => {
    if (formItems.length === 1) return;
    setFormItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    setFormItems((prev) => {
      const copy = [...prev];
      copy[index][field] = value;
      if (field === 'medicine') {
        const med = medicines.find((m) => m._id === value);
        if (med) copy[index].unit = med.unit;
      }
      return copy;
    });
  };

  // Create Dispatch Submit
  const handleCreateDispatch = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      for (const item of formItems) {
        if (!item.medicine || !item.batchNumber || !item.expiryDate || !item.dispatchedQuantity) {
          throw new Error('Please fill all mandatory fields for every medicine item');
        }
      }

      const res = await createDispatchApi({
        destinationFarm: formFarm,
        dispatchDate: formDate,
        vehicleNumber: formVehicle,
        driverName: formDriver,
        driverMobile: formDriverMobile,
        items: formItems.map((it) => ({
          ...it,
          dispatchedQuantity: Number(it.dispatchedQuantity),
        })),
        remarks: formRemarks,
      });

      setSuccessMsg(res.message || 'Dispatch created successfully!');
      setTimeout(() => setSuccessMsg(''), 4500);
      setIsCreateModalOpen(false);
      loadDispatches();
    } catch (err) {
      setError(err.message || 'Failed to create dispatch');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Gate Security Arrival Submit
  const handleGateConfirm = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      const res = await confirmGateReceiptApi(gateModalDispatch._id, {
        packagesCount: Number(gatePackages) || gateModalDispatch.items.length,
        hasVisibleDamage: gateDamage,
        remarks: gateRemarks,
      });

      setSuccessMsg(res.message || 'Gate arrival confirmed!');
      setTimeout(() => setSuccessMsg(''), 4500);
      setGateModalDispatch(null);
      loadDispatches();
    } catch (err) {
      setError(err.message || 'Failed to confirm gate arrival');
    } finally {
      setSubmitting(false);
    }
  };

  // Step 3: Store Acceptance Submit
  const handleStoreAccept = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      const res = await storeAcceptDispatchApi(storeModalDispatch._id, {
        remarks: storeRemarks,
      });

      setSuccessMsg(res.message || 'Accepted into store! Live batch inventory updated.');
      setTimeout(() => setSuccessMsg(''), 4500);
      setStoreModalDispatch(null);
      loadDispatches();
    } catch (err) {
      setError(err.message || 'Failed to accept into store');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🚚</span>
            <h1 className="text-base sm:text-lg font-bold text-slate-900">
              Head Office Dispatch & Farm Gate Security (Route A)
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Multi-tier custody: HO Dispatch (In-Transit) ➔ Gate Security (Physical Arrival) ➔ Store Acceptance (Available Stock)
          </p>
        </div>

        <button
          onClick={() => {
            setFormFarm(firms[0]?._id || '');
            setIsCreateModalOpen(true);
          }}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition flex items-center justify-center gap-1.5"
        >
          <span>+</span> Create HO Dispatch
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}
      {error && !isCreateModalOpen && !gateModalDispatch && !storeModalDispatch && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
          ⚠ {error}
        </div>
      )}

      {/* 2. Chain of Custody Explainer Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs">
        <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
          <span className="text-lg">1️⃣</span>
          <div>
            <strong className="block text-slate-800">HO Dispatch</strong>
            <span className="text-[10px] text-slate-500">In-transit. Farm Stock = 0</span>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
          <span className="text-lg">2️⃣</span>
          <div>
            <strong className="block text-slate-800">Farm Gate Security</strong>
            <span className="text-[10px] text-slate-500">Physical gate arrival. Farm Stock = 0</span>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200">
          <span className="text-lg">3️⃣</span>
          <div>
            <strong className="block text-slate-800">Storekeeper Verification</strong>
            <span className="text-[10px] text-emerald-700 font-bold">Increments Available Stock!</span>
          </div>
        </div>
      </div>

      {/* 3. Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Search</label>
          <input
            type="text"
            placeholder="e.g. DISP-2026-0001, UP-14..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Destination Farm</label>
          <select
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Destination Farms</option>
            {firms.map((f) => (
              <option key={f._id} value={f._id}>{f.name} ({f.code})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Pipeline Statuses</option>
            <option value="DISPATCHED">DISPATCHED (In-Transit)</option>
            <option value="GATE_RECEIVED">GATE_RECEIVED (Pending Store)</option>
            <option value="STORE_ACCEPTED">STORE_ACCEPTED (Available in Stock)</option>
          </select>
        </div>
      </div>

      {/* 4. Dispatches List (Dual View: Table + Mobile Cards) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading dispatch manifests...</div>
        ) : dispatches.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No dispatch records found. Click <strong>+ Create HO Dispatch</strong> to record material movement from Head Office.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Dispatch #</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Destination Farm</th>
                    <th className="py-2.5 px-3">Vehicle & Driver</th>
                    <th className="py-2.5 px-3 text-center">Items</th>
                    <th className="py-2.5 px-3 text-center">Pipeline Status</th>
                    <th className="py-2.5 px-3 text-center">Workflow Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dispatches.map((d) => (
                    <tr key={d._id} className="hover:bg-slate-50/75 transition">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{d.dispatchNumber}</td>
                      <td className="py-2.5 px-3 text-slate-600">{d.dispatchDate}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">
                        {d.destinationFarm?.name || '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{d.vehicleNumber || '—'}</div>
                        <div className="text-[10px] text-slate-400">
                          {d.driverName} {d.driverMobile ? `(${d.driverMobile})` : ''}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-700">
                        {d.items?.length || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                            STATUS_BADGES[d.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {d.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {d.status === 'DISPATCHED' ? (
                          <button
                            onClick={() => {
                              setGateModalDispatch(d);
                              setGatePackages(d.items?.length || 1);
                              setGateDamage(false);
                              setGateRemarks('');
                            }}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-[10px] rounded-lg transition shadow-2xs flex items-center gap-1 mx-auto"
                          >
                            <span>🛡️</span> Gate Confirm
                          </button>
                        ) : d.status === 'GATE_RECEIVED' ? (
                          <button
                            onClick={() => {
                              setStoreModalDispatch(d);
                              setStoreRemarks('');
                            }}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition shadow-2xs flex items-center gap-1 mx-auto"
                          >
                            <span>📥</span> Store Accept
                          </button>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700">
                            ✓ In Stock
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {dispatches.map((d) => (
                <div key={d._id} className="p-3.5 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs text-slate-900">{d.dispatchNumber}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        STATUS_BADGES[d.status] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {d.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-slate-800">
                    To: {d.destinationFarm?.name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Vehicle: {d.vehicleNumber || '—'} • Driver: {d.driverName || '—'}
                  </div>

                  <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                    <span className="text-[11px] text-slate-500">{d.items?.length || 0} items</span>
                    {d.status === 'DISPATCHED' ? (
                      <button
                        onClick={() => {
                          setGateModalDispatch(d);
                          setGatePackages(d.items?.length || 1);
                          setGateDamage(false);
                          setGateRemarks('');
                        }}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg transition"
                      >
                        🛡️ Gate Confirm
                      </button>
                    ) : d.status === 'GATE_RECEIVED' ? (
                      <button
                        onClick={() => {
                          setStoreModalDispatch(d);
                          setStoreRemarks('');
                        }}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition"
                      >
                        📥 Store Accept
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-emerald-700">✓ In Stock</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 5. MODAL: Create HO Dispatch */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>🚚</span> New Head Office Dispatch Manifest
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateDispatch} className="p-4 overflow-y-auto space-y-3 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Destination Farm *
                  </label>
                  <select
                    value={formFarm}
                    onChange={(e) => setFormFarm(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs"
                  >
                    <option value="">Select Destination Farm...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>{f.name} ({f.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Dispatch Date *
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Vehicle #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UP-14-AB-1234"
                    value={formVehicle}
                    onChange={(e) => setFormVehicle(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Driver Name
                  </label>
                  <input
                    type="text"
                    placeholder="Driver name"
                    value={formDriver}
                    onChange={(e) => setFormDriver(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                    Driver Mobile
                  </label>
                  <input
                    type="text"
                    placeholder="Mobile #"
                    value={formDriverMobile}
                    onChange={(e) => setFormDriverMobile(e.target.value)}
                    className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-600 uppercase">
                    Dispatched Medicines ({formItems.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-2 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[10px] rounded"
                  >
                    + Add Item
                  </button>
                </div>

                {formItems.map((item, idx) => (
                  <div key={idx} className="bg-white p-2 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="flex justify-between items-center gap-2">
                      <select
                        value={item.medicine}
                        onChange={(e) => handleItemChange(idx, 'medicine', e.target.value)}
                        required
                        className="flex-1 h-7 px-2 border border-slate-300 rounded text-xs font-semibold"
                      >
                        <option value="">Select Medicine *</option>
                        {medicines.map((m) => (
                          <option key={m._id} value={m._id}>{m.name} ({m.code}) — {m.unit}</option>
                        ))}
                      </select>

                      {formItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-500 hover:text-rose-700 text-xs font-bold px-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <input
                        type="text"
                        placeholder="Batch #"
                        required
                        value={item.batchNumber}
                        onChange={(e) => handleItemChange(idx, 'batchNumber', e.target.value.toUpperCase())}
                        className="h-7 px-2 border border-slate-300 rounded uppercase font-bold"
                      />
                      <input
                        type="date"
                        required
                        value={item.expiryDate}
                        onChange={(e) => handleItemChange(idx, 'expiryDate', e.target.value)}
                        className="h-7 px-1 border border-slate-300 rounded"
                        title="Expiry Date"
                      />
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        required
                        value={item.dispatchedQuantity}
                        onChange={(e) => handleItemChange(idx, 'dispatchedQuantity', e.target.value)}
                        className="h-7 px-2 border border-slate-300 rounded text-center font-bold text-slate-900"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Remarks</label>
                <input
                  type="text"
                  placeholder="Dispatch note / carrier remarks..."
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full h-8 px-2 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 h-8 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 h-8 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Dispatching...' : 'Confirm & Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: Gate Security Arrival Confirmation */}
      {gateModalDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-amber-500 text-white flex justify-between items-center">
              <h3 className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <span>🛡️</span> Confirm Gate Arrival ({gateModalDispatch.dispatchNumber})
              </h3>
              <button
                onClick={() => setGateModalDispatch(null)}
                className="text-white hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGateConfirm} className="p-4 space-y-3">
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                Security confirmation records that the vehicle and cartons physically entered the farm gate. <strong>Available stock remains 0</strong> until store acceptance.
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                  Number of Cartons / Packages Count *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={gatePackages}
                  onChange={(e) => setGatePackages(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-bold"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="damageCheck"
                  checked={gateDamage}
                  onChange={(e) => setGateDamage(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="damageCheck" className="text-xs font-semibold text-slate-700">
                  Any visible carton damage or seal tampering?
                </label>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Security Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Checked by Guard Ramesh, seal intact..."
                  value={gateRemarks}
                  onChange={(e) => setGateRemarks(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setGateModalDispatch(null)}
                  className="px-3 h-8 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 h-8 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Confirming...' : 'Confirm Gate Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL: Storekeeper Verification & Formal Stock Acceptance */}
      {storeModalDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-emerald-600 text-white flex justify-between items-center">
              <h3 className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                <span>📥</span> Storekeeper Formal Stock Acceptance
              </h3>
              <button
                onClick={() => setStoreModalDispatch(null)}
                className="text-white hover:text-slate-200 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleStoreAccept} className="p-4 space-y-3">
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-[11px] text-emerald-900">
                Accepting this dispatch will <strong>atomically increment live batch inventory</strong> and log an immutable transfer entry into the farm stock ledger.
              </div>

              <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Items to Accept:</span>
                {storeModalDispatch.items?.map((it, idx) => (
                  <div key={idx} className="flex justify-between text-xs text-slate-800">
                    <span>{it.medicine?.name || 'Medicine'} (Batch: {it.batchNumber})</span>
                    <strong className="text-emerald-700">{it.dispatchedQuantity} {it.unit}</strong>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">Store Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Verified carton count, placed in Cold Room..."
                  value={storeRemarks}
                  onChange={(e) => setStoreRemarks(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStoreModalDispatch(null)}
                  className="px-3 h-8 text-xs font-bold text-slate-600 bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 h-8 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Accepting...' : '✓ Accept & Increment Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
