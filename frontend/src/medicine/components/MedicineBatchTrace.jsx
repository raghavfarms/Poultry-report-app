import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';
import {
  fetchBatchTraceability,
  updateBatchApi,
  deleteBatchApi,
} from '../api/reportApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import MedicineBarcodeScannerModal from './MedicineBarcodeScannerModal.jsx';
import { formatUnit, getPackagingPlural } from '../utils/packagingHelper.js';

export default function MedicineBatchTrace({
  firms = [],
  selectedFarm = '',
  canManage: canManageProp,
  initialQuery = '',
  initialBatchId = '',
}) {
  const { user } = useAuth();
  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);
  const canManage = canManageProp !== undefined ? canManageProp : isAdminOrDev;
  const canAccessTrace = isAdminOrDev || user?.permissions?.medicine_master === true;

  // Farm selection
  const [internalFirms, setInternalFirms] = useState(firms);
  const [farmFilter, setFarmFilter] = useState(selectedFarm || '');

  // Search state
  const [searchBatch, setSearchBatch] = useState(initialQuery || '');
  const [traceData, setTraceData] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceError, setTraceError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Edit batch modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editPacks, setEditPacks] = useState('');
  const [editPackaging, setEditPackaging] = useState('Bottle');
  const [editUnit, setEditUnit] = useState('L');
  const [editPackSize, setEditPackSize] = useState(1);
  const [savingBatch, setSavingBatch] = useState(false);
  const [editBatchError, setEditBatchError] = useState('');
  const [allMedicinesList, setAllMedicinesList] = useState([]);

  // Delete batch modal state
  const [deletingBatch, setDeletingBatch] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  // Load firms if not provided
  useEffect(() => {
    if (firms && firms.length > 0) {
      setInternalFirms(firms);
    } else {
      (async () => {
        try {
          const res = await api('/firms');
          const list = (res.firms || []).filter((f) => {
            const name = (f.name || '').toLowerCase();
            return name.includes('raghav') || name.includes('sanjana');
          });
          list.sort((a, b) => {
            if (a.name.toLowerCase().includes('raghav')) return -1;
            if (b.name.toLowerCase().includes('raghav')) return 1;
            return 0;
          });
          setInternalFirms(list);
          if (list.length > 0 && !farmFilter) {
            setFarmFilter(list[0]._id);
          }
        } catch (err) {
          console.error('Failed to load firms in trace component:', err);
        }
      })();
    }
  }, [firms]);

  useEffect(() => {
    if (selectedFarm) {
      setFarmFilter(selectedFarm);
    }
  }, [selectedFarm]);

  // Initial query execution if provided
  useEffect(() => {
    if (initialQuery || initialBatchId) {
      if (initialQuery) setSearchBatch(initialQuery);
      handleTraceSearch(null, initialQuery, initialBatchId);
    }
  }, [initialQuery, initialBatchId]);

  // Format date to strictly DD-MM-YYYY
  const formatExpiryDDMMYYYY = (isoOrDateStr) => {
    if (!isoOrDateStr) return '—';
    try {
      const d = new Date(isoOrDateStr);
      if (isNaN(d.getTime())) {
        const parts = String(isoOrDateStr).split('-');
        if (parts.length === 3 && parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
        }
        return isoOrDateStr;
      }
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return isoOrDateStr || '—';
    }
  };

  // Perform traceability search
  const handleTraceSearch = async (e, queryOverride, batchIdOverride) => {
    if (e) e.preventDefault();
    const query = (queryOverride !== undefined ? queryOverride : searchBatch).trim();
    if (!query && !batchIdOverride) return;

    try {
      setLoadingTrace(true);
      setTraceError('');
      setDeleteSuccess('');
      if (!batchIdOverride) {
        setTraceData(null);
      }
      const data = await fetchBatchTraceability(
        query,
        batchIdOverride
          ? { batchId: batchIdOverride, farm: farmFilter || undefined }
          : { farm: farmFilter || undefined }
      );
      setTraceData(data);
    } catch (err) {
      setTraceError(err.message || `No history found for '${query}'`);
      setTraceData(null);
    } finally {
      setLoadingTrace(false);
    }
  };

  const handleSelectRelatedBatch = (rb) => {
    if (!rb) return;
    setSearchBatch(rb.batchNumber);
    handleTraceSearch(null, rb.batchNumber, rb._id);
  };

  // Open Edit Batch modal
  const handleOpenEditBatchModal = async (batch) => {
    if (!batch) return;
    setEditingBatch(batch);
    setEditBatchNumber(batch.batchNumber || '');
    setEditExpiryDate(batch.expiryDate ? batch.expiryDate.split('T')[0] : '');
    const qty = batch.quantityAvailable !== undefined ? batch.quantityAvailable : '';
    setEditQuantity(qty);
    setEditBatchError('');

    let list = allMedicinesList;
    if (list.length === 0) {
      try {
        const data = await fetchMedicines({ includeInactive: false });
        list = data.medicines || [];
        setAllMedicinesList(list);
      } catch (err) {
        console.error('Failed to load medicines for edit modal', err);
      }
    }

    const medId = batch.medicine?._id || batch.medicineId;
    const med = list.find((m) => String(m._id) === String(medId)) || batch.medicine;
    const size = Number(med?.packSize) || 1;
    setEditPackSize(size);
    setEditPackaging(med?.packagingType || 'Bottle');
    setEditUnit(formatUnit(med?.unit || 'Units'));

    if (size > 0 && size !== 1 && qty !== '' && !isNaN(qty)) {
      setEditPacks(Number((Number(qty) / size).toFixed(3)));
    } else {
      setEditPacks('');
    }
    setIsEditModalOpen(true);
  };

  const handleSaveBatchEdit = async (e) => {
    e.preventDefault();
    if (!editingBatch?._id) return;
    const trimmedBatch = editBatchNumber.trim().toUpperCase();
    if (!trimmedBatch) {
      setEditBatchError('Batch number cannot be empty.');
      return;
    }
    if (!editExpiryDate) {
      setEditBatchError('Expiry date is required.');
      return;
    }

    try {
      setSavingBatch(true);
      setEditBatchError('');
      await updateBatchApi(editingBatch._id, {
        batchNumber: trimmedBatch,
        expiryDate: editExpiryDate,
        quantityAvailable: editQuantity !== '' ? Number(editQuantity) : undefined,
      });

      setSearchBatch(trimmedBatch);
      await handleTraceSearch(null, trimmedBatch, editingBatch._id);

      setIsEditModalOpen(false);
      setEditingBatch(null);
    } catch (err) {
      setEditBatchError(err.message || 'Failed to update batch details.');
    } finally {
      setSavingBatch(false);
    }
  };

  // Open & Confirm Delete Batch
  const handleOpenDeleteBatch = (batch) => {
    if (!batch) return;
    setDeletingBatch(batch);
    setDeleteError('');
  };

  const handleConfirmDeleteBatch = async () => {
    if (!deletingBatch?._id) return;
    try {
      setDeleting(true);
      setDeleteError('');
      await deleteBatchApi(deletingBatch._id);
      setDeleteSuccess(`Batch #${deletingBatch.batchNumber} has been permanently deleted.`);
      setDeletingBatch(null);
      setTraceData(null);
      setSearchBatch('');
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete batch.');
    } finally {
      setDeleting(false);
    }
  };

  // Permission guard
  if (!canAccessTrace) {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-center text-xs font-semibold">
        ⛔ Access Restricted: You do not have permission to access Batch Traceability.
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* 1. Search & Farm Filter Header */}
      <div className="bg-white p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div>
            <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>🔍</span> Reverse Batch Investigation & Traceability
            </h2>
            <p className="text-[11px] text-slate-500">
              Search by <strong className="text-slate-700">Medicine Name</strong> or <strong className="text-slate-700">Batch Number</strong> to trace arrival, supplier, and shed consumption.
            </p>
          </div>

          {/* Farm Filter Dropdown */}
          {internalFirms.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-bold text-slate-500">🏢 Farm:</span>
              <select
                value={farmFilter}
                onChange={(e) => {
                  setFarmFilter(e.target.value);
                  if (searchBatch.trim()) {
                    handleTraceSearch(null, searchBatch);
                  }
                }}
                className="h-8 px-2.5 bg-slate-50 text-slate-700 text-xs font-bold border border-slate-300 rounded-lg focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
              >
                {internalFirms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleTraceSearch} className="flex gap-1.5 pt-0.5">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={searchBatch}
              onChange={(e) => setSearchBatch(e.target.value)}
              placeholder="Medicine name (e.g. Paracetamol, RanCox) or batch # (e.g. #20017)..."
              className="w-full h-8.5 pl-3 pr-14 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
            />
            {searchBatch && (
              <button
                type="button"
                onClick={() => {
                  setSearchBatch('');
                  setTraceData(null);
                  setTraceError('');
                }}
                className="absolute right-7 top-1 h-6.5 px-1 text-slate-400 hover:text-slate-700 text-xs rounded transition flex items-center justify-center cursor-pointer"
                title="Clear"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="absolute right-1 top-1 h-6.5 px-1.5 text-slate-500 hover:text-slate-800 text-xs rounded transition flex items-center justify-center cursor-pointer hover:bg-slate-200/50"
              title="Scan Barcode / Label"
            >
              📷
            </button>
          </div>
          <button
            type="submit"
            disabled={loadingTrace || !searchBatch.trim()}
            className="h-8.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer"
          >
            {loadingTrace ? 'Searching...' : 'Trace'}
          </button>
        </form>
      </div>

      {/* Success Notification */}
      {deleteSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>✓ {deleteSuccess}</span>
          <button
            type="button"
            onClick={() => setDeleteSuccess('')}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Notification */}
      {traceError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
          ⚠ {traceError}
        </div>
      )}

      {/* 2. Trace Result Display */}
      {traceData ? (() => {
        const batch = traceData.batch || {};
        const availableQty = batch.quantityAvailable ?? 0;
        const issuedQty = batch.totalIssued ?? 0;
        const initialQty = batch.initialQuantity || (availableQty + issuedQty) || 0;
        const unit = formatUnit(batch.medicine?.unit || 'Units');

        const expiryDate = batch.expiryDate;
        let daysLeft = null;
        if (expiryDate) {
          const diffTime = new Date(expiryDate) - new Date();
          daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }

        const sheds = Object.entries(batch.shedBreakdown || {});

        return (
          <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100 text-xs">
            {/* Related Batches Strip (Active pills + Past archive dropdown) */}
            {traceData.relatedBatches && traceData.relatedBatches.length > 1 && (() => {
              const related = traceData.relatedBatches;
              const activeBatches = related.filter((rb) => (rb.quantityAvailable ?? 0) > 0 && rb.status !== 'DEPLETED');
              const depletedBatches = related.filter((rb) => (rb.quantityAvailable ?? 0) <= 0 || rb.status === 'DEPLETED');
              const isCurrentDepleted = depletedBatches.some((rb) => rb.batchNumber === batch.batchNumber);

              return (
                <div className="px-3 sm:px-4 py-2 bg-slate-100/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                    <span>🏷️</span>
                    <span>Batches of {batch.medicine?.name}:</span>
                    <span className="text-[10px] font-normal text-slate-500">
                      ({activeBatches.length} active{depletedBatches.length > 0 ? `, ${depletedBatches.length} past` : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full">
                    {/* Active batches pills */}
                    {activeBatches.map((rb) => {
                      const isCurrent = rb.batchNumber === batch.batchNumber;
                      return (
                        <button
                          key={rb._id || rb.batchNumber}
                          type="button"
                          onClick={() => handleSelectRelatedBatch(rb)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer border ${
                            isCurrent
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-extrabold'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span className="font-mono">{rb.batchNumber}</span>
                          {rb.farm?.name && (
                            <span className={`text-[8.5px] font-bold opacity-80 ${isCurrent ? 'text-emerald-100' : 'text-slate-500'}`}>
                              ({rb.farm.name})
                            </span>
                          )}
                          <span
                            className={`text-[9px] px-1 py-0.2 rounded font-extrabold ${
                              isCurrent
                                ? 'bg-emerald-700 text-emerald-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {rb.quantityAvailable} left
                          </span>
                        </button>
                      );
                    })}

                    {/* Currently selected depleted batch pill */}
                    {isCurrentDepleted && (
                      <div className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-700 text-white border border-slate-800 shadow-2xs flex items-center gap-1 shrink-0">
                        <span className="font-mono">{batch.batchNumber}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                          Depleted
                        </span>
                      </div>
                    )}

                    {/* Past batches dropdown */}
                    {depletedBatches.length > 0 && (
                      <select
                        value={isCurrentDepleted ? batch.batchNumber : ''}
                        onChange={(e) => {
                          const found = depletedBatches.find((b) => b.batchNumber === e.target.value);
                          if (found) handleSelectRelatedBatch(found);
                        }}
                        className="h-6.5 pl-2 pr-6 py-0 text-[11px] font-bold bg-white text-slate-700 border border-slate-300 hover:border-slate-400 rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer shrink-0 shadow-2xs"
                        title="Select past depleted batch to inspect"
                      >
                        <option value="" disabled>
                          🗄️ Past Batches ({depletedBatches.length})...
                        </option>
                        {depletedBatches.map((db) => (
                          <option key={db._id || db.batchNumber} value={db.batchNumber}>
                            {db.batchNumber} {db.farm?.name ? `(${db.farm.name})` : ''} (0 left — {formatExpiryDDMMYYYY(db.expiryDate)})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Header: Medicine, Farm, Expiry and Actions */}
            <div className="px-3 sm:px-4 py-2.5 bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm">💊</span>
                <span className="font-mono text-xs font-black text-slate-900 tracking-tight">
                  {batch.batchNumber}
                </span>
                <span className="px-1.5 py-0.2 rounded bg-slate-200/80 text-slate-700 text-[9px] font-bold">
                  {batch.medicine?.category || 'General'}
                </span>
                <span className="font-bold text-xs text-slate-800">
                  {batch.medicine?.name}
                </span>
                {batch.medicine?.aliasName && (
                  <span className="text-[10px] text-slate-400 font-normal italic">
                    ({batch.medicine.aliasName})
                  </span>
                )}
                {batch.farm?.name && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                    🏢 {batch.farm.name}
                  </span>
                )}
              </div>

              {/* Expiry Badge & Admin Actions */}
              <div className="flex items-center gap-2">
                {daysLeft !== null ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black ${
                    daysLeft <= 0
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : daysLeft <= 30
                      ? 'bg-red-100 text-red-800 border border-red-200'
                      : daysLeft <= 60
                      ? 'bg-orange-100 text-orange-800 border border-orange-200'
                      : daysLeft <= 90
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  }`}>
                    <span>{daysLeft <= 0 ? '🔴' : daysLeft <= 30 ? '🔴' : daysLeft <= 60 ? '🟠' : daysLeft <= 90 ? '🟡' : '🟢'}</span>
                    <span>{daysLeft <= 0 ? `Expired (${Math.abs(daysLeft)}d ago)` : daysLeft <= 90 ? `Use Soon (${daysLeft}d left)` : `${daysLeft}d Safe`}</span>
                    <span className="opacity-70 font-mono text-[9.5px]">({formatExpiryDDMMYYYY(batch.expiryDate)})</span>
                  </span>
                ) : (
                  <span className="font-mono text-[10.5px] text-slate-500 font-semibold">{formatExpiryDDMMYYYY(batch.expiryDate)}</span>
                )}

                {canManage && (
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEditBatchModal(batch)}
                      className="px-2 py-0.5 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition cursor-pointer"
                      title="Edit Batch"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteBatch(batch)}
                      className="px-2 py-0.5 text-[11px] font-bold text-rose-700 bg-white border border-rose-200 rounded hover:bg-rose-50 transition cursor-pointer"
                      title="Delete Batch"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 4-Column Stats Grid */}
            <div className="px-3 sm:px-4 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Supplier</span>
                <strong className="text-slate-900 text-xs block truncate leading-tight mt-0.5">{batch.supplier?.name || 'Direct Delivery'}</strong>
                <span className="text-[10px] text-slate-400 block truncate">{batch.supplier?.mobile || 'Farm Store'}</span>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Received</span>
                <strong className="text-slate-900 text-xs sm:text-sm block leading-tight mt-0.5">{initialQty} {unit}</strong>
                <span className="text-[10px] text-slate-400 block">
                  {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : 'Arrived'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Given to Birds</span>
                <strong className="text-blue-700 text-xs sm:text-sm block leading-tight mt-0.5">{issuedQty} {unit}</strong>
                <span className="text-[10px] text-blue-600 font-semibold block truncate">
                  {sheds.length > 0 ? sheds.map(([s, q]) => `${s}: ${q}`).join(', ') : 'Issued Out'}
                </span>
              </div>

              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Available Stock</span>
                <strong className="text-emerald-700 text-xs sm:text-sm block leading-tight mt-0.5">{availableQty} {unit}</strong>
                <span className="text-[10px] text-emerald-600 font-semibold block">
                  {batch.farm?.name ? `In ${batch.farm.name} Store` : 'In Store'}
                </span>
              </div>
            </div>

            {/* Movement History Timeline */}
            <div className="px-3 sm:px-4 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Movement History</span>
                <span>{(traceData.timeline?.receipts?.length || 1) + (traceData.timeline?.issues?.length || 0) + (batch.disposals?.length || 0)} entries</span>
              </div>
              <div className="space-y-1 text-xs">
                {/* IN entries */}
                {(traceData.timeline?.receipts?.length ? traceData.timeline.receipts : [{ _id: 'legacy', receivedQuantity: initialQty, createdAt: batch.createdAt }]).map((receipt) => (
                  <div key={receipt._id} className="flex justify-between gap-2 py-1 text-[11px] border-b border-slate-50 last:border-none">
                    <div className="min-w-0">
                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 mr-1.5">
                        IN
                      </span>
                      <span className="font-bold text-slate-800">+{receipt.storeAcceptedQuantity || receipt.receivedQuantity} {unit}</span> Received from {receipt.supplier?.name || batch.supplier?.name || 'Direct Farm Purchase'}
                      <div className="text-slate-600 text-[10px] mt-0.5">
                        Received by: <strong>{receipt.receiverName || receipt.receivedBy?.name || receipt.receivedBy?.username || 'Not recorded'}</strong>
                      </div>
                    </div>
                    <span className="shrink-0 text-slate-400 text-[10px] font-mono">
                      {receipt.createdAt ? new Date(receipt.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : ''}
                    </span>
                  </div>
                ))}

                {/* DISPOSED entries */}
                {(batch.disposals || []).map((entry, index) => (
                  <div key={entry._id || index} className="py-1 text-xs text-rose-700 border-b border-slate-50 last:border-none">
                    <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-100 text-rose-800 mr-1.5">
                      DISPOSED
                    </span>
                    <strong>-{entry.quantity} {unit}</strong> ? By {entry.performedByName || 'Admin'} ? {new Date(entry.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                ))}

                {/* OUT entries */}
                {(traceData.timeline?.issues || []).map((iss) => (
                  <div key={iss._id} className="flex items-center justify-between py-1 text-[11px] border-b border-slate-50 last:border-none">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 shrink-0">
                        OUT
                      </span>
                      <div className="min-w-0 break-words">
                        <div className="font-semibold text-slate-800">-{iss.issuedQuantity} {unit} to {iss.shed || 'Shed'}</div>
                        <div className="text-[10.5px] text-slate-600">
                          Received by: <strong>{iss.issuedTo || 'Not recorded'}</strong>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Issued by: {iss.issuedByName || iss.issuedBy?.name || 'Not recorded'}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-2">
                      {iss.issueDate ? new Date(iss.issueDate).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : (iss.createdAt ? new Date(iss.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) : '')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })() : (
        <div className="bg-white p-8 rounded-xl sm:rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
          <div className="text-3xl">🔍</div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-700">No batch investigated yet</h3>
          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
            Type any medicine name or batch number in the search box above, or click the camera button to scan a barcode.
          </p>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <MedicineBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={({ batchNumber, medicineName }) => {
          const val = batchNumber || medicineName;
          if (val) {
            setSearchBatch(val);
            handleTraceSearch(null, val);
          }
        }}
      />

      {/* Edit Batch Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="font-bold text-sm">Edit Stock Batch Details</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingBatch(null);
                }}
                className="text-white/80 hover:text-white text-lg p-0.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBatchEdit} className="p-5 space-y-3.5">
              {editBatchError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
                  ⚠️ {editBatchError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Medicine Name
                </label>
                <input
                  type="text"
                  disabled
                  value={editingBatch?.medicine?.name || ''}
                  className="w-full h-10 px-3 font-semibold text-xs border border-slate-200 rounded-xl bg-slate-100 text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Batch Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editBatchNumber}
                  onChange={(e) => setEditBatchNumber(e.target.value.toUpperCase())}
                  className="w-full h-10 px-3 font-mono font-bold text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  In Stock Quantity ({editUnit}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={editQuantity}
                  onChange={(e) => setEditQuantity(e.target.value)}
                  className="w-full h-10 px-3 font-bold text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Expiry Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={editExpiryDate}
                  onChange={(e) => setEditExpiryDate(e.target.value)}
                  className="w-full h-10 px-3 font-mono text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={savingBatch}
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingBatch(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBatch}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {savingBatch ? 'Saving...' : '💾 Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Batch Confirmation Modal */}
      {deletingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-rose-200 overflow-hidden">
            <div className="px-5 py-3.5 bg-rose-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗑️</span>
                <h3 className="font-bold text-sm">Delete Stock Batch</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingBatch(null)}
                className="text-white/80 hover:text-white text-lg p-0.5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              {deleteError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
                  ⚠️ {deleteError}
                </div>
              )}

              <p className="text-xs text-slate-700">
                Are you sure you want to permanently delete this batch from live inventory?
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Medicine:</span>
                  <strong className="text-slate-900">{deletingBatch.medicine?.name || 'Medicine'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Batch Number:</span>
                  <span className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                    {deletingBatch.batchNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Stock Balance:</span>
                  <strong className="text-emerald-700">{deletingBatch.quantityAvailable} {formatUnit(deletingBatch.medicine?.unit)}</strong>
                </div>
                {deletingBatch.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expiry Date:</span>
                    <span className="font-mono text-slate-700">{formatExpiryDDMMYYYY(deletingBatch.expiryDate)}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeletingBatch(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDeleteBatch}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : '🗑️ Delete Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
