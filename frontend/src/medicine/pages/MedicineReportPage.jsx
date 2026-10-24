import React, { useState, useEffect, useRef } from 'react';
import { formatStockDisplay, formatUnit, getPackagingPlural } from '../utils/packagingHelper.js';
import { fetchDashboardStats, fetchBatchTraceability, updateBatchApi, deleteBatchApi } from '../api/reportApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DailyMedicineActionPage from './DailyMedicineActionPage.jsx';
import MedicineConsumptionRegister from '../components/MedicineConsumptionRegister.jsx';
import MedicineBarcodeScannerModal from '../components/MedicineBarcodeScannerModal.jsx';
import MedicineTransferModal from '../components/MedicineTransferModal.jsx';
import MedicineTransferInboxModal from '../components/MedicineTransferInboxModal.jsx';
import { fetchPendingTransfers } from '../api/transferApi.js';

function BatchActionMenu({
  batch,
  onTrace,
  onEdit,
  onDelete,
  onDispose,
  canDispose,
  canEdit = true,
  canDelete = false,
  align = 'right',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const isExpired = batch?.urgency === 'EXPIRED';

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* 3-Dots Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className={`w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer border ${
          isOpen ? 'bg-slate-100 border-slate-300 text-slate-900 shadow-2xs' : 'border-slate-200/80 bg-white hover:border-slate-300'
        }`}
        title="Batch Actions"
      >
        <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {/* Floating Action Menu */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute ${
            align === 'right' ? 'right-0' : 'left-0'
          } mt-1 w-36 sm:w-40 bg-white border border-slate-200 rounded-xl shadow-xl py-1 z-50 text-left animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100`}
        >
          <div className="py-1">
            {onTrace && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onTrace(batch);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 flex items-center gap-2 cursor-pointer transition"
              >
                <span>🔍</span> Trace Batch
              </button>
            )}

            {canEdit && onEdit && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onEdit(batch);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-amber-700 flex items-center gap-2 cursor-pointer transition"
              >
                <span>✏️</span> Edit Batch
              </button>
            )}

            {isExpired && canDispose && onDispose && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onDispose(batch);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition"
              >
                <span>🗑️</span> Dispose Stock
              </button>
            )}
          </div>

          {canDelete && onDelete && (
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onDelete(batch);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition"
              >
                <span>🗑️</span> Delete Batch
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

class DailyActionErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('DailyActionErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-white rounded-xl border border-rose-200 shadow-sm text-center space-y-2">
          <div className="text-rose-600 font-bold text-sm">⚠️ Failed to load Daily Actions view</div>
          <p className="text-xs text-slate-500">{this.state.error?.message || 'An unexpected error occurred.'}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-md hover:bg-emerald-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function MedicineReportPage() {
  const { user } = useAuth();

  // Active Tab: 1. Daily In/Out (Default) | 2. Current Stock | 3. Consumption Register | 4. Traceability
  const [activeTab, setActiveTab] = useState('daily');

  // Farm Store Filter
  const [selectedFarm, setSelectedFarm] = useState('');
  const [firms, setFirms] = useState([]);

  // Live Stock State
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'SAFE' | 'SOON' | 'EXPIRED' | 'LOW'
  const [disposing, setDisposing] = useState('');
  const [disposeError, setDisposeError] = useState('');
  const [expandedMeds, setExpandedMeds] = useState({});
  const canDispose = ['admin', 'developer'].includes(user?.role);
  const canEditBatch = ['admin', 'developer'].includes(user?.role);
  const canAccessTraceAndAction = ['admin', 'developer'].includes(user?.role);
  const canTransferStock = ['admin', 'developer'].includes(user?.role);

  // Transfer Modals & Notification State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isInboxModalOpen, setIsInboxModalOpen] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState([]);

  const loadPendingTransfers = async () => {
    if (!canTransferStock) return;
    try {
      const res = await fetchPendingTransfers();
      setPendingTransfers(res.transfers || []);
    } catch (err) {
      console.error('Failed to load pending transfers:', err);
    }
  };

  const incomingTransferCount = React.useMemo(() => {
    if (!selectedFarm) return pendingTransfers.length;
    return pendingTransfers.filter(
      (t) => (t.toFarm?._id || t.toFarm)?.toString() === selectedFarm.toString()
    ).length;
  }, [pendingTransfers, selectedFarm]);

  const outgoingTransferCount = React.useMemo(() => {
    if (!selectedFarm) return 0;
    return pendingTransfers.filter(
      (t) => (t.fromFarm?._id || t.fromFarm)?.toString() === selectedFarm.toString()
    ).length;
  }, [pendingTransfers, selectedFarm]);

  useEffect(() => {
    loadPendingTransfers();
    // Poll pending transfers every 30 seconds
    const interval = setInterval(loadPendingTransfers, 30000);
    return () => clearInterval(interval);
  }, [canTransferStock]);

  useEffect(() => {
    if (!canAccessTraceAndAction && activeTab === 'traceability') {
      setActiveTab('daily');
    }
  }, [canAccessTraceAndAction, activeTab]);

  // Edit Batch Modal State
  const [editingBatch, setEditingBatch] = useState(null);
  const [editMedicineId, setEditMedicineId] = useState('');
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editPacks, setEditPacks] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [editBatchError, setEditBatchError] = useState('');
  const [allMedicinesList, setAllMedicinesList] = useState([]);

  // Delete Batch Confirmation State
  const [deletingBatch, setDeletingBatch] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleOpenEditBatchModal = async (batch) => {
    if (!batch) return;
    setEditingBatch(batch);
    const medId = batch.medicineId || batch.medicine?._id || '';
    setEditMedicineId(medId);
    setEditBatchNumber(batch.batchNumber || '');
    setEditExpiryDate(batch.expiryDate || '');
    const qty = batch.quantityAvailable !== undefined ? batch.quantityAvailable : '';
    setEditQuantity(qty);
    setEditBatchError('');
    setIsEditModalOpen(true);

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

    const med = list.find((m) => String(m._id) === String(medId)) || batch.medicine;
    const size = Number(med?.packSize) || 1;
    if (size > 0 && size !== 1 && qty !== '' && !isNaN(qty)) {
      setEditPacks(Number((Number(qty) / size).toFixed(3)));
    } else {
      setEditPacks('');
    }
  };

  const handleOpenDeleteBatch = (batch) => {
    if (!batch) return;
    setDeletingBatch(batch);
    setDeleteError('');
  };

  const handleTraceBatch = (batch) => {
    if (!batch) return;
    setActiveTab('traceability');
    setSearchBatch(batch.batchNumber);
    handleTraceSearch(null, batch.batchNumber, batch._id);
  };

  const handleConfirmDeleteBatch = async () => {
    if (!deletingBatch?._id) return;
    try {
      setDeleting(true);
      setDeleteError('');
      await deleteBatchApi(deletingBatch._id);
      await loadStats();
      if (activeTab === 'traceability') {
        setTraceData(null);
      }
      setDeletingBatch(null);
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete batch.');
    } finally {
      setDeleting(false);
    }
  };

  const disposeStock = async (batch) => {
    if (disposing) return;
    setDisposing(batch._id);
    setDisposeError('');
    try {
      await api(`/medicine/reports/batches/${batch._id}/dispose`, { method: 'POST' });
      await loadStats();
      setTraceData(null);
    } catch (error) { setDisposeError(error.message || 'Could not dispose stock.'); }
    finally { setDisposing(''); }
  };
  const disposalButton = (batch) => canDispose && (
    <button type="button" disabled={Boolean(disposing)} onClick={() => disposeStock(batch)}
      aria-label={`Dispose remaining stock of ${batch.medicineName}, batch ${batch.batchNumber}`}
      className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1 disabled:opacity-50">
      {disposing === batch._id ? 'Disposing...' : 'Dispose stock'}
    </button>
  );

  // Batch Traceability State
  const [searchBatch, setSearchBatch] = useState('');
  const [traceData, setTraceData] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceError, setTraceError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Load farms list
  const loadFirms = async () => {
    try {
      const data = await api('/firms');
      const loadedFirms = data.firms || [];
      setFirms(loadedFirms);
      if (loadedFirms.length === 1) {
        setSelectedFarm(loadedFirms[0]._id);
      }
    } catch (err) {
      console.error('Failed to load firms:', err);
    }
  };

  // Load Stock & Expiry stats with background refresh
  const loadStats = async (silent = false) => {
    try {
      if (!silent && !stats?.expiryRadar) {
        setLoadingStats(true);
      }
      const data = await fetchDashboardStats({ farm: selectedFarm });
      setStats(data);
    } catch (err) {
      console.error('Failed to load stock stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    loadFirms();
    // Proactively pre-load stock stats so Stock tab is instant
    loadStats(true);
  }, []);

  useEffect(() => {
    if (firms.length === 1 && selectedFarm !== firms[0]._id) {
      setSelectedFarm(firms[0]._id);
    }
  }, [firms, selectedFarm]);

  useEffect(() => {
    if (activeTab === 'stock') {
      setStockFilter('ALL');
      loadStats(Boolean(stats?.expiryRadar));
    } else if (activeTab === 'traceability' && searchBatch.trim()) {
      handleTraceSearch(null, searchBatch);
    }
  }, [activeTab, selectedFarm]);

  // Handle Traceability Search
  const handleTraceSearch = async (e, queryOverride, batchIdOverride) => {
    if (e) e.preventDefault();
    const query = (queryOverride !== undefined ? queryOverride : searchBatch).trim();
    if (!query && !batchIdOverride) return;

    try {
      setLoadingTrace(true);
      setTraceError('');
      if (!batchIdOverride) {
        setTraceData(null);
      }
      const data = await fetchBatchTraceability(
        query,
        batchIdOverride
          ? { batchId: batchIdOverride, farm: selectedFarm }
          : { farm: selectedFarm }
      );
      setTraceData(data);
    } catch (err) {
      setTraceError(err.message || `No history found for '${query}'`);
    } finally {
      setLoadingTrace(false);
    }
  };

  const handleSelectRelatedBatch = (rb) => {
    if (!rb) return;
    setSearchBatch(rb.batchNumber);
    handleTraceSearch(null, rb.batchNumber, rb._id);
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
        medicineId: editMedicineId || undefined,
        batchNumber: trimmedBatch,
        expiryDate: editExpiryDate,
        quantityAvailable: editQuantity !== '' ? Number(editQuantity) : undefined,
      });

      // Refresh traceability if open
      if (activeTab === 'traceability') {
        setSearchBatch(trimmedBatch);
        await handleTraceSearch(null, trimmedBatch, editingBatch._id);
      }
      // Refresh stock view
      await loadStats();

      setIsEditModalOpen(false);
      setEditingBatch(null);
    } catch (err) {
      setEditBatchError(err.message || 'Failed to update batch details.');
    } finally {
      setSavingBatch(false);
    }
  };

  const radar = stats?.expiryRadar || {};
  const lowStock = stats?.lowStockAlerts || [];

  // Flatten all available batches for live stock view, strictly sorted by earliest expiry date first (FEFO)
  const allBatches = React.useMemo(() => {
    const radarObj = stats?.expiryRadar || {};
    return [
      ...(radarObj.expired || []).map((b) => ({ ...b, urgency: 'EXPIRED' })),
      ...(radarObj.critical30 || []).map((b) => ({ ...b, urgency: 'CRITICAL' })),
      ...(radarObj.caution60 || []).map((b) => ({ ...b, urgency: 'CAUTION' })),
      ...(radarObj.warning90 || []).map((b) => ({ ...b, urgency: 'WARNING' })),
      ...(radarObj.safe || []).map((b) => ({ ...b, urgency: 'SAFE' })),
    ].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }, [stats]);

  // Group batches by unique Medicine + Farm (Strictly unmerged across farms)
  const groupedMedicines = React.useMemo(() => {
    const map = new Map();

    for (const b of allBatches) {
      const medId = (b.medicineId || b.medicineName || '').toString();
      if (!medId) continue;
      const farmId = b.farm?._id ? String(b.farm._id) : (b.farm?.name || 'farm');
      const key = `${medId}_${farmId}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          medicineId: b.medicineId,
          medicineName: b.medicineName,
          medicineCode: b.medicineCode,
          medicineAlias: b.medicineAlias,
          unit: b.unit,
          packSize: b.packSize || 1,
          packagingType: b.packagingType || 'Bottle',
          reorderLevel: b.reorderLevel,
          totalStock: 0,
          batches: [],
          farm: b.farm,
          urgency: 'SAFE',
          isLowStock: false,
        });
      }

      const entry = map.get(key);
      if (b.packSize && Number(b.packSize) > 0) {
        entry.packSize = Number(b.packSize);
      }
      if (b.packagingType) {
        entry.packagingType = b.packagingType;
      }
      entry.totalStock += Number(b.quantityAvailable || 0);
      entry.batches.push(b);
      if (!entry.farm && b.farm) {
        entry.farm = b.farm;
      }
      if (b.isLowStock) entry.isLowStock = true;
    }

    const urgencyRank = {
      EXPIRED: 4,
      CRITICAL: 3,
      CAUTION: 2,
      WARNING: 1,
      SAFE: 0,
    };

    const list = Array.from(map.values()).map((entry) => {
      // Batches sorted FEFO (earliest expiry first)
      entry.batches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      entry.earliestBatch = entry.batches[0] || null;

      let highestUrgency = 'SAFE';
      for (const b of entry.batches) {
        if ((urgencyRank[b.urgency] || 0) > (urgencyRank[highestUrgency] || 0)) {
          highestUrgency = b.urgency;
        }
      }
      entry.urgency = highestUrgency;
      return entry;
    });

    // Sort medicines alphabetically (A to Z), then by farm
    list.sort((a, b) => {
      const nameCompare = (a.medicineName || '').localeCompare(b.medicineName || '', undefined, { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return (a.farm?.name || '').localeCompare(b.farm?.name || '', undefined, { sensitivity: 'base' });
    });

    return list;
  }, [allBatches]);

  // Use deferred value for search to guarantee smooth 60fps typing on mobile keyboards
  const deferredStockSearch = React.useDeferredValue(stockSearch);
  const isStockSearchPureNumber = /^\d+$/.test(deferredStockSearch.trim());

  const filteredMedicines = React.useMemo(() => {
    const q = deferredStockSearch.trim().toLowerCase();

    return groupedMedicines.filter((m) => {
      // 1. Search match on Medicine Name, Code, Alias, or ANY child batch number
      const matchesSearch =
        !q ||
        m.medicineName?.toLowerCase().includes(q) ||
        (!isStockSearchPureNumber && m.medicineCode?.toLowerCase().includes(q)) ||
        m.medicineAlias?.toLowerCase().includes(q) ||
        m.farm?.name?.toLowerCase().includes(q) ||
        m.batches.some((b) => b.batchNumber?.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // 2. Shelf status filter
      if (stockFilter === 'SAFE') return m.urgency === 'SAFE';
      if (stockFilter === 'SOON') return m.urgency === 'CRITICAL' || m.urgency === 'CAUTION' || m.urgency === 'WARNING';
      if (stockFilter === 'EXPIRED') return m.urgency === 'EXPIRED';
      if (stockFilter === 'LOW') return Boolean(m.isLowStock);
      return true;
    });
  }, [groupedMedicines, deferredStockSearch, isStockSearchPureNumber, stockFilter]);

  // Only auto-expand when search query is typed (does NOT wipe expandedMeds on manual click)
  useEffect(() => {
    const q = deferredStockSearch.trim();
    if (q.length >= 2) {
      const autoExpand = {};
      filteredMedicines.forEach((m) => {
        autoExpand[m.key] = true;
      });
      setExpandedMeds(autoExpand);
    }
  }, [deferredStockSearch]);

  const toggleExpand = (key) => {
    setExpandedMeds((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isAllExpanded = React.useMemo(() => {
    return filteredMedicines.length > 0 && filteredMedicines.every((m) => expandedMeds[m.key]);
  }, [filteredMedicines, expandedMeds]);

  const toggleAllExpand = () => {
    if (isAllExpanded) {
      setExpandedMeds({});
    } else {
      const next = {};
      filteredMedicines.forEach((m) => {
        next[m.key] = true;
      });
      setExpandedMeds(next);
    }
  };

  const formatExpiryDDMMYYYY = (dateStr) => {
    if (!dateStr || dateStr === '—') return '—';
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const renderShelfBadge = (urgency, daysLeft) => {
    const hasDays = daysLeft !== null && daysLeft !== undefined && !isNaN(daysLeft);
    if (urgency === 'EXPIRED') {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
          🔴 {hasDays ? `Expired (${Math.abs(daysLeft)}d ago)` : 'Expired'}
        </span>
      );
    }
    if (urgency === 'CRITICAL') {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-red-100 text-red-900 border border-red-200 inline-flex items-center gap-1 shrink-0 whitespace-nowrap" title="Expires within 1 month">
          🔴 {hasDays ? `${daysLeft}d left` : 'Use Soon'}
        </span>
      );
    }
    if (urgency === 'CAUTION') {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-orange-100 text-orange-900 border border-orange-200 inline-flex items-center gap-1 shrink-0 whitespace-nowrap" title="Expires within 2 months">
          🟠 {hasDays ? `${daysLeft}d left` : 'Use Soon'}
        </span>
      );
    }
    if (urgency === 'WARNING') {
      return (
        <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 inline-flex items-center gap-1 shrink-0 whitespace-nowrap" title="Expires within 3 months">
          🟡 {hasDays ? `${daysLeft}d left` : 'Use Soon'}
        </span>
      );
    }
    return (
      <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 inline-flex items-center gap-1 shrink-0 whitespace-nowrap" title="Safe (> 3 months)">
        🟢 {hasDays ? `${daysLeft}d left` : 'Safe'}
      </span>
    );
  };

  const isAdmin = ['admin', 'developer', 'office', 'supervisor', 'farm_incharge'].includes(user?.role);

  return (
    <div className="space-y-1.5 sm:space-y-2.5 w-full max-w-7xl mx-auto px-1 sm:px-2 pb-2">
      {/* 1. Header & Navigation Tabs */}
      <div className="bg-white p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs space-y-1.5 sm:space-y-2">
        <div className="flex flex-row items-center justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg">💊</span>
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                General Medicine
              </h1>
            </div>
            <p className="hidden sm:block text-[10px] sm:text-[11px] text-slate-500">
              Daily fast In/Out, live stock & batch trace
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Farm filter */}
            {firms.length === 1 ? (
              <div className="h-7 sm:h-8 px-2 sm:px-2.5 bg-slate-100 border border-slate-200 rounded-lg text-[10px] sm:text-[11px] font-bold text-slate-700 flex items-center gap-1 shrink-0 shadow-2xs">
                <span>🏢</span>
                <span className="truncate max-w-[85px] sm:max-w-none">{firms[0].name}</span>
              </div>
            ) : firms.length > 1 ? (
              <select
                value={selectedFarm}
                onChange={(e) => setSelectedFarm(e.target.value)}
                className="h-7 sm:h-8 px-1.5 sm:px-2 border border-slate-300 rounded-lg text-[10px] sm:text-[11px] font-semibold text-slate-700 bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Farms</option>
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            ) : null}

            {/* Quick Link to Medicine Master & Suppliers for Admin / Supervisor */}
            {isAdmin && (
              <div className="flex items-center gap-1 shrink-0">
                {/* Transfer Notification Bell / Chat Icon */}
                {canTransferStock && (
                  <button
                    type="button"
                    onClick={() => setIsInboxModalOpen(true)}
                    className="relative h-7 sm:h-8 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[10px] sm:text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Incoming & Pending Transfer Requests"
                  >
                    <span>💬</span>
                    <span className="hidden sm:inline">Requests</span>
                    {selectedFarm ? (
                      incomingTransferCount > 0 ? (
                        <span
                          className="px-1.5 py-0.5 bg-rose-600 text-white rounded-full text-[9px] font-black animate-pulse leading-none"
                          title={`${incomingTransferCount} incoming transfers waiting for acceptance`}
                        >
                          {incomingTransferCount}
                        </span>
                      ) : outgoingTransferCount > 0 ? (
                        <span
                          className="px-1.5 py-0.5 bg-blue-600 text-white rounded-full text-[9px] font-black leading-none"
                          title={`${outgoingTransferCount} outgoing transfers on hold`}
                        >
                          {outgoingTransferCount}
                        </span>
                      ) : null
                    ) : pendingTransfers.length > 0 ? (
                      <span className="px-1.5 py-0.5 bg-rose-600 text-white rounded-full text-[9px] font-black animate-pulse leading-none">
                        {pendingTransfers.length}
                      </span>
                    ) : null}
                  </button>
                )}

                {/* Transfer Button */}
                {canTransferStock && (
                  <button
                    type="button"
                    onClick={() => setIsTransferModalOpen(true)}
                    className="h-7 sm:h-8 px-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 font-bold text-[10px] sm:text-[11px] rounded-lg transition flex items-center gap-1 shrink-0 cursor-pointer"
                    title="Send Medicine Stock to Another Farm"
                  >
                    <span>🔄</span>
                    <span>Transfer</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* The Clean Farm Views Tabs */}
        <div className={`grid ${canAccessTraceAndAction ? 'grid-cols-4' : 'grid-cols-3'} gap-1 p-0.5 sm:p-1 bg-slate-100 rounded-xl text-center`}>
          <button
            type="button"
            onClick={() => setActiveTab('daily')}
            className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'daily'
                ? 'bg-emerald-600 !text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>⚡</span>
            <span className={activeTab === 'daily' ? '!text-white' : ''}>In / Out</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('stock')}
            className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'stock'
                ? 'bg-emerald-600 !text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>📦</span>
            <span className={activeTab === 'stock' ? '!text-white' : ''}>Stock</span>
            {(radar.expiredCount || 0) > 0 && (
              <span className="px-1 py-0.2 bg-rose-500 !text-white rounded-full text-[9px] leading-tight">
                {radar.expiredCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('consumption')}
            className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeTab === 'consumption'
                ? 'bg-emerald-600 !text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <span>📋</span>
            <span className={activeTab === 'consumption' ? '!text-white' : ''}>Consume</span>
          </button>

          {canAccessTraceAndAction && (
            <button
              type="button"
              onClick={() => setActiveTab('traceability')}
              className={`py-1.5 px-1 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
                activeTab === 'traceability'
                  ? 'bg-emerald-600 !text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span>🔍</span>
              <span className={activeTab === 'traceability' ? '!text-white' : ''}>Trace</span>
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: Daily Quick Action (The Worker's Best Friend) */}
      {activeTab === 'daily' && (
        <DailyActionErrorBoundary>
          <DailyMedicineActionPage
            hideHeader={true}
            selectedFarm={selectedFarm}
            firms={firms}
            onOpenConsumptionRegister={() => setActiveTab('consumption')}
            onActivityUpdated={() => {
              setStockFilter('ALL');
              loadStats();
            }}
          />
        </DailyActionErrorBoundary>
      )}

      {/* VIEW 2: Current Stock & Expiry (Simple Visual List) */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          {disposeError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
              ⚠️ {disposeError}
            </div>
          )}

          {/* Quick Filter Strip */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row justify-between gap-2.5 items-stretch sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search medicine name, code, or batch..."
                className="w-full h-9 pl-8 pr-8 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50/50"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
              {stockSearch && (
                <button
                  type="button"
                  onClick={() => setStockSearch('')}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills & Expand Toggle */}
            <div className="flex items-center justify-between gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <div className="flex gap-1 overflow-x-auto no-scrollbar whitespace-nowrap py-0.5">
                <button
                  type="button"
                  onClick={() => setStockFilter('ALL')}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 border ${
                    stockFilter === 'ALL'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  All ({groupedMedicines.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('SAFE')}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                    stockFilter === 'SAFE'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span>🟢</span> Safe ({groupedMedicines.filter((m) => m.urgency === 'SAFE').length})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('SOON')}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                    stockFilter === 'SOON'
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <span>🟡</span> Soon ({groupedMedicines.filter((m) => ['CRITICAL', 'CAUTION', 'WARNING'].includes(m.urgency)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setStockFilter('EXPIRED')}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                    stockFilter === 'EXPIRED'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <span>🔴</span> Expired ({groupedMedicines.filter((m) => m.urgency === 'EXPIRED').length})
                </button>
                {lowStock.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStockFilter('LOW')}
                    className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                      stockFilter === 'LOW'
                        ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                        : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                    }`}
                  >
                    <span>⚠️</span> Low ({groupedMedicines.filter((m) => m.isLowStock).length})
                  </button>
                )}
              </div>

              {filteredMedicines.length > 0 && (
                <button
                  type="button"
                  onClick={toggleAllExpand}
                  className="text-[10px] sm:text-xs font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition cursor-pointer shrink-0 inline-flex items-center gap-1 whitespace-nowrap"
                  title={isAllExpanded ? 'Collapse all medicine batches' : 'Expand all medicine batches'}
                >
                  <span className="text-[9px]">{isAllExpanded ? '▲' : '▼'}</span>
                  <span className="hidden sm:inline">{isAllExpanded ? 'Collapse All' : 'Expand All'}</span>
                  <span className="sm:hidden">{isAllExpanded ? 'Collapse' : 'Expand'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Low Stock Warning Banner if any */}
          {lowStock.length > 0 && stockFilter === 'ALL' && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🚨</span>
                <span className="font-semibold text-rose-800">
                  {lowStock.length} medicine(s) are at or below reorder level:
                </span>
                <span className="font-bold text-rose-900">
                  {lowStock.map((m) => m.name).slice(0, 3).join(', ')}
                  {lowStock.length > 3 && ` +${lowStock.length - 3} more`}
                </span>
              </div>
            </div>
          )}

          {/* Active Filter Indicator */}
          {stockFilter !== 'ALL' && (
            <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center justify-between">
              <span>
                Showing <strong>{filteredMedicines.length}</strong> of <strong>{groupedMedicines.length}</strong> medicines ({allBatches.length} total batches) (Filtered by <strong>{stockFilter}</strong>).
              </span>
              <button
                type="button"
                onClick={() => setStockFilter('ALL')}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
              >
                Show All ({groupedMedicines.length})
              </button>
            </div>
          )}

          {/* Batches Stock List (Unified Desktop & Mobile with Steady Medicine Name & Sticky Header) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingStats && !stats?.expiryRadar ? (
              <div className="p-12 text-center text-slate-400 text-xs">Loading current stock...</div>
            ) : filteredMedicines.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-1">
                <p className="text-sm font-bold text-slate-600">No medicines found</p>
                <p className="text-[11px] text-slate-400">Try changing your search query or click "All" above.</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-135px)] min-h-[460px] relative">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-30 bg-slate-100 text-[10px] uppercase font-bold text-slate-600 border-b border-slate-200 shadow-xs">
                    <tr>
                      {/* 1. Medicine & Farm */}
                      <th className="sticky top-0 left-0 z-40 bg-slate-100 py-2.5 px-2.5 w-[155px] sm:w-[195px] min-w-[155px] sm:min-w-[195px] max-w-[170px] sm:max-w-[210px] border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] whitespace-nowrap">
                        Medicine & Farm
                      </th>
                      {/* 2. Packaging (Packs) */}
                      <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-center border-b border-slate-200 whitespace-nowrap min-w-[130px]">
                        Packaging (Packs)
                      </th>
                      {/* 3. Total In Stock */}
                      <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-right border-b border-slate-200 whitespace-nowrap min-w-[100px]">
                        Total In Stock
                      </th>
                      {/* 4. Batch No */}
                      <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-center border-b border-slate-200 whitespace-nowrap min-w-[90px]">
                        Batch No
                      </th>
                      {/* 5. Next Expiry */}
                      <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-center border-b border-slate-200 whitespace-nowrap min-w-[105px]">
                        Next Expiry
                      </th>
                      {/* 6. Shelf Status (FEFO) */}
                      <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-center border-b border-slate-200 whitespace-nowrap min-w-[100px]">
                        Shelf Status (FEFO)
                      </th>
                      {/* 7. Actions */}
                      <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-center min-w-[65px] border-b border-slate-200 whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredMedicines.map((m) => {
                      const isMultiBatch = m.batches.length > 1;
                      const isExpanded = isMultiBatch && Boolean(expandedMeds[m.key]);
                      const singleBatch = !isMultiBatch ? m.batches[0] : null;
                      const isExpired = m.urgency === 'EXPIRED';
                      const isCritical = m.urgency === 'CRITICAL';
                      const isCaution = m.urgency === 'CAUTION';
                      const isWarning = m.urgency === 'WARNING';

                      const rowBgClass = isExpanded
                        ? 'bg-blue-50/50'
                        : isExpired
                        ? 'bg-rose-50/40'
                        : isCritical
                        ? 'bg-rose-50/20'
                        : isCaution
                        ? 'bg-orange-50/20'
                        : isWarning
                        ? 'bg-amber-50/15'
                        : 'bg-white';

                      const stickyCellBgClass = isExpanded
                        ? 'bg-blue-50'
                        : isExpired
                        ? 'bg-rose-50'
                        : isCritical
                        ? 'bg-rose-50'
                        : isCaution
                        ? 'bg-orange-50'
                        : isWarning
                        ? 'bg-amber-50'
                        : 'bg-white';

                      return (
                        <React.Fragment key={m.key}>
                          {/* Parent Medicine Row */}
                          <tr
                            onClick={() => {
                              if (isMultiBatch) toggleExpand(m.key);
                            }}
                            className={`transition-colors select-none ${
                              isMultiBatch ? 'cursor-pointer' : ''
                            } ${rowBgClass} hover:bg-slate-50/80`}
                          >
                            {/* Column 1: Medicine Name & Farm Meta (STEADY / FROZEN STICKY LEFT) */}
                            <td
                              className={`sticky left-0 z-20 py-2 px-2.5 w-[155px] sm:w-[195px] min-w-[155px] sm:min-w-[195px] max-w-[170px] sm:max-w-[210px] border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] ${stickyCellBgClass}`}
                            >
                              <div className="flex items-center gap-1.5">
                                {isMultiBatch ? (
                                  <span
                                    className={`text-[10px] font-black transition-transform duration-200 shrink-0 ${
                                      isExpanded ? 'text-blue-600 rotate-90' : 'text-slate-400'
                                    }`}
                                  >
                                    ▶
                                  </span>
                                ) : (
                                  <span className="w-2 shrink-0 text-slate-300 text-center text-[10px]">•</span>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="font-bold text-slate-900 text-xs hover:text-blue-700 transition leading-snug break-words"
                                    title={m.medicineName + (m.medicineAlias ? ` (${m.medicineAlias})` : '')}
                                  >
                                    {m.medicineName}
                                    {m.medicineAlias && (
                                      <span className="font-normal text-slate-500 ml-1 text-[10.5px]">
                                        ({m.medicineAlias})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500 flex-wrap">
                                    {m.farm?.name && (
                                      <span
                                        className="font-bold text-[8.5px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border border-slate-200 shrink-0"
                                        title={m.farm.name}
                                      >
                                        🏢 {m.farm.name}
                                      </span>
                                    )}
                                    {m.medicineCode && (
                                      <span className="font-mono text-[8.5px] bg-slate-50 text-slate-500 px-1 py-0.2 rounded border border-slate-200 shrink-0">
                                        {m.medicineCode}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Column 2: Packaging & Physical Packs (Pack size) */}
                            <td className="py-2 px-3 text-center whitespace-nowrap min-w-[130px]">
                              {(() => {
                                const size = Number(m.packSize) || 1;
                                const type = m.packagingType || 'Bottle';
                                const pCount = size > 0 ? (m.totalStock / size) : m.totalStock;
                                const displayCount = Number.isInteger(pCount) ? pCount : Number(pCount.toFixed(2));
                                const typeLabel = getPackagingPlural(type, displayCount);

                                return (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="font-extrabold text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200/90 px-2 py-0.2 rounded-md shadow-2xs whitespace-nowrap">
                                      📦 {displayCount} {typeLabel}
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-semibold mt-0.5 whitespace-nowrap">
                                      1 {type} = {size} {formatUnit(m.unit)}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Column 3: Total In Stock (Total) */}
                            <td className="py-2 px-3 text-right whitespace-nowrap min-w-[100px]">
                              <div className="flex items-center justify-end gap-1">
                                {m.isLowStock && (
                                  <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-300">
                                    ⚠️ Low
                                  </span>
                                )}
                                <span
                                  className={`font-black text-xs ${
                                    m.isLowStock ? 'text-rose-700' : 'text-slate-900'
                                  }`}
                                >
                                  {m.totalStock}
                                </span>{' '}
                                <span className="text-[10px] text-slate-500 font-semibold">{formatUnit(m.unit)}</span>
                              </div>
                            </td>

                            {/* Column 4: Batch No (Batch no) */}
                            <td className="py-2 px-3 text-center whitespace-nowrap min-w-[90px]">
                              {isMultiBatch ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(m.key);
                                  }}
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 transition cursor-pointer ${
                                    isExpanded
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                  }`}
                                  title="Click to view all batches"
                                >
                                  <span>📦 {m.batches.length} Batches</span>
                                  <span className="text-[9px]">{isExpanded ? '▲' : '▼'}</span>
                                </button>
                              ) : (
                                <span className="font-mono font-bold text-[11px] text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                  #{singleBatch?.batchNumber || '—'}
                                </span>
                              )}
                            </td>

                            {/* Column 5: Earliest Expiry Date (DD-MM-YYYY) */}
                            <td className="py-2 px-3 text-center font-mono text-[11px] font-semibold text-slate-700 whitespace-nowrap min-w-[105px]">
                              {formatExpiryDDMMYYYY(m.earliestBatch?.expiryDate)}
                            </td>

                            {/* Column 6: Shelf Status (FEFO) */}
                            <td className="py-2 px-3 text-center whitespace-nowrap min-w-[100px]">
                              {renderShelfBadge(m.urgency, m.earliestBatch?.daysLeft)}
                            </td>

                            {/* Column 7: Actions */}
                            <td className="py-2 px-3 text-center whitespace-nowrap min-w-[65px]">
                              {isMultiBatch ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(m.key);
                                  }}
                                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer inline-flex items-center gap-1 ${
                                    isExpanded
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                                  }`}
                                >
                                  <span>{isExpanded ? '▲' : '▼'}</span>
                                  <span className="font-mono text-[10px]">({m.batches.length})</span>
                                </button>
                              ) : (
                                <div className="flex items-center justify-center">
                                  <BatchActionMenu
                                    batch={singleBatch}
                                    onTrace={handleTraceBatch}
                                    onEdit={handleOpenEditBatchModal}
                                    onDelete={handleOpenDeleteBatch}
                                    canEdit={canEditBatch}
                                    canDelete={isAdmin}
                                  />
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Nested Accordion Drawer for Batches */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-y border-blue-200/60">
                              <td colSpan={7} className="p-2 sm:p-3">
                                <div className="bg-white rounded-xl border border-blue-200 shadow-xs overflow-x-auto">
                                  <div className="bg-gradient-to-r from-blue-50 to-slate-50 px-3 py-2 border-b border-blue-100 flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm">📦</span>
                                      <span className="font-bold text-xs text-slate-800">
                                        Batches for <strong className="text-blue-900">{m.medicineName}</strong>
                                      </span>
                                      <span className="text-[9px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium">
                                        FEFO
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 font-semibold">
                                      Total: <strong className="text-slate-800">{m.totalStock}</strong> {formatUnit(m.unit)}{(() => {
                                        const size = Number(m.packSize) || 1;
                                        const type = m.packagingType || 'Bottle';
                                        const pCount = size > 0 ? (m.totalStock / size) : m.totalStock;
                                        const displayCount = Number.isInteger(pCount) ? pCount : Number(pCount.toFixed(2));
                                        return ` (📦 ${displayCount} ${getPackagingPlural(type, displayCount)})`;
                                      })()} across{' '}
                                      <strong className="text-blue-700">{m.batches.length}</strong> batches
                                    </span>
                                  </div>

                                  {/* Child Batches Table */}
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                                      <tr>
                                        <th className="py-2 px-3 whitespace-nowrap">Batch Number</th>
                                        <th className="py-2 px-3 whitespace-nowrap">Location / Farm</th>
                                        <th className="py-2 px-3 text-center whitespace-nowrap">Packaging (Packs)</th>
                                        <th className="py-2 px-3 text-right whitespace-nowrap">In Stock</th>
                                        <th className="py-2 px-3 text-center whitespace-nowrap">Expiry Date</th>
                                        <th className="py-2 px-3 text-center whitespace-nowrap">Shelf Status</th>
                                        {canAccessTraceAndAction && (
                                          <th className="py-2 px-3 text-center whitespace-nowrap min-w-[65px]">Actions</th>
                                        )}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                      {m.batches.map((b) => (
                                        <tr
                                          key={b._id}
                                          className="hover:bg-blue-50/30 transition-colors"
                                        >
                                          {/* Batch Number */}
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 inline-block shadow-2xs">
                                              {b.batchNumber}
                                            </span>
                                          </td>

                                          {/* Farm */}
                                          <td className="py-2 px-3 whitespace-nowrap">
                                            {b.farm?.name ? (
                                              <span className="font-semibold text-xs text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 inline-block">
                                                🏢 {b.farm.name}
                                              </span>
                                            ) : (
                                              <span className="text-slate-400 italic text-[11px]">All / Main</span>
                                            )}
                                          </td>

                                          {/* Packaging & Physical Packs */}
                                          <td className="py-2 px-3 text-center whitespace-nowrap">
                                            {(() => {
                                              const size = Number(b.packSize) || Number(m.packSize) || 1;
                                              const type = b.packagingType || m.packagingType || 'Bottle';
                                              const qty = Number(b.quantityAvailable) || 0;
                                              const pCount = size > 0 ? (qty / size) : qty;
                                              const displayCount = Number.isInteger(pCount) ? pCount : Number(pCount.toFixed(2));
                                              const typeLabel = getPackagingPlural(type, displayCount);

                                              return (
                                                <div className="inline-flex flex-col items-center">
                                                  <span className="font-extrabold text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200/90 px-2 py-0.2 rounded-md shadow-2xs whitespace-nowrap">
                                                    📦 {displayCount} {typeLabel}
                                                  </span>
                                                  <span className="text-[9px] text-slate-500 font-semibold mt-0.5 whitespace-nowrap">
                                                    1 {type} = {size} {formatUnit(b.unit || m.unit)}
                                                  </span>
                                                </div>
                                              );
                                            })()}
                                          </td>

                                          {/* Stock */}
                                          <td className="py-2 px-3 text-right whitespace-nowrap">
                                            <div className="flex items-center justify-end gap-1">
                                              {b.isLowStock && (
                                                <span className="px-1 py-0.2 rounded text-[9px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                                  ⚠️ Low
                                                </span>
                                              )}
                                              <span className="font-black text-xs text-slate-900">
                                                {b.quantityAvailable}
                                              </span>{' '}
                                              <span className="text-[10px] text-slate-500 font-semibold">
                                                {formatUnit(b.unit)}
                                              </span>
                                            </div>
                                          </td>

                                          {/* Expiry Date */}
                                          <td className="py-2 px-3 text-center font-mono text-xs text-slate-700 font-medium whitespace-nowrap">
                                            {formatExpiryDDMMYYYY(b.expiryDate)}
                                          </td>

                                          {/* Shelf Status */}
                                          <td className="py-2 px-3 text-center whitespace-nowrap">
                                            {renderShelfBadge(b.urgency, b.daysLeft)}
                                          </td>

                                          {/* Actions */}
                                          {canAccessTraceAndAction && (
                                            <td className="py-2 px-3 text-center whitespace-nowrap">
                                              <div className="flex items-center justify-center">
                                                <BatchActionMenu
                                                  batch={b}
                                                  onTrace={handleTraceBatch}
                                                  onEdit={handleOpenEditBatchModal}
                                                  onDelete={handleOpenDeleteBatch}
                                                  onDispose={disposeStock}
                                                  canDispose={canDispose}
                                                  canEdit={canEditBatch}
                                                  canDelete={isAdmin}
                                                />
                                              </div>
                                            </td>
                                          )}
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: Traceability History (The Audit & Doctor View) */}
      {canAccessTraceAndAction && activeTab === 'traceability' && (
        <div className="space-y-4">
          <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>🔍</span> Reverse Batch Investigation
            </h2>
            <p className="text-[11px] text-slate-500">
              Search by <strong className="text-slate-700">Medicine Name</strong> or <strong className="text-slate-700">Batch Number</strong> to trace arrival, supplier, and shed consumption.
            </p>

            <form onSubmit={handleTraceSearch} className="flex gap-1.5 pt-0.5">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={searchBatch}
                  onChange={(e) => setSearchBatch(e.target.value)}
                  placeholder="Medicine name (e.g. Paracetamol) or batch #..."
                  className="w-full h-8 pl-2.5 pr-8 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="absolute right-1 top-0.5 h-7 px-1.5 text-slate-500 hover:text-slate-800 text-xs rounded transition flex items-center justify-center cursor-pointer"
                  title="Scan Barcode / Label"
                >
                  📷
                </button>
              </div>
              <button
                type="submit"
                disabled={loadingTrace || !searchBatch.trim()}
                className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer"
              >
                {loadingTrace ? 'Searching...' : 'Trace'}
              </button>
            </form>
          </div>

          {traceError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
              ⚠ {traceError}
            </div>
          )}

          {traceData && (() => {
            const batch = traceData.batch || {};
            const availableQty = batch.quantityAvailable ?? 0;
            const issuedQty = batch.totalIssued ?? 0;
            const initialQty = batch.initialQuantity || (availableQty + issuedQty) || 0;
            const unit = batch.medicine?.unit || 'Units';

            const expiryDate = batch.expiryDate;
            let daysLeft = null;
            if (expiryDate) {
              const diffTime = new Date(expiryDate) - new Date();
              daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            const sheds = Object.entries(batch.shedBreakdown || {});

            return (
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden divide-y divide-slate-100 text-xs">
                {/* Related Batches Strip (Smart: Active pills + Clean Past Archive dropdown) */}
                {traceData.relatedBatches && traceData.relatedBatches.length > 1 && (() => {
                  const related = traceData.relatedBatches;
                  const activeBatches = related.filter((rb) => (rb.quantityAvailable ?? 0) > 0 && rb.status !== 'DEPLETED');
                  const depletedBatches = related.filter((rb) => (rb.quantityAvailable ?? 0) <= 0 || rb.status === 'DEPLETED');
                  const isCurrentDepleted = depletedBatches.some((rb) => rb.batchNumber === batch.batchNumber);

                  return (
                    <div className="px-3 py-1.5 bg-slate-100/90 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700">
                        <span>🏷️</span>
                        <span>Batches of {batch.medicine?.name}:</span>
                        <span className="text-[10px] font-normal text-slate-500">
                          ({activeBatches.length} active{depletedBatches.length > 0 ? `, ${depletedBatches.length} past` : ''})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full">
                        {/* 1. Active batches shown as clear pills */}
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
                              {rb.farm?.name && !selectedFarm && (
                                <span className={`text-[8px] font-bold opacity-80 ${isCurrent ? 'text-emerald-100' : 'text-slate-500'}`}>
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

                        {/* 2. If user is currently inspecting a depleted batch, show it as an active pill */}
                        {isCurrentDepleted && (
                          <div className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-700 text-white border border-slate-800 shadow-2xs flex items-center gap-1 shrink-0">
                            <span className="font-mono">{batch.batchNumber}</span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                              Depleted
                            </span>
                          </div>
                        )}

                        {/* 3. Dropdown for Depleted / Past batches to keep UI 100% clean even with 50+ batches */}
                        {depletedBatches.length > 0 && (
                          <select
                            value={isCurrentDepleted ? batch.batchNumber : ''}
                            onChange={(e) => {
                              const found = depletedBatches.find((b) => b.batchNumber === e.target.value);
                              if (found) handleSelectRelatedBatch(found);
                            }}
                            className="h-6 pl-2 pr-6 py-0 text-[11px] font-bold bg-white text-slate-700 border border-slate-300 hover:border-slate-400 rounded-md focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer shrink-0 shadow-2xs"
                            title="Select past depleted batch to inspect"
                          >
                            <option value="" disabled>
                              🗄️ Past Batches ({depletedBatches.length})...
                            </option>
                            {depletedBatches.map((db) => (
                              <option key={db._id || db.batchNumber} value={db.batchNumber}>
                                {db.batchNumber} {db.farm?.name && !selectedFarm ? `(${db.farm.name})` : ''} (0 left — {db.expiryDate || 'Depleted'})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 1. Ultra-Compact Header */}
                <div className="px-3 py-1.5 bg-slate-50/80 flex items-center justify-between gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">💊</span>
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

                  {/* Expiry Badge & Edit Button */}
                  <div className="flex items-center gap-2">
                    {daysLeft !== null ? (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-black ${
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
                        <span className="opacity-70 font-normal text-[9px]">({batch.expiryDate})</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-semibold">{batch.expiryDate}</span>
                    )}
                  </div>
                </div>

                {/* 2. Compact 4-Column Stats with Integrated Shed Details (No dead space) */}
                <div className="px-3 py-1.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Supplier</span>
                    <strong className="text-slate-900 text-xs block truncate leading-tight mt-0.5">{batch.supplier?.name || 'Direct Delivery'}</strong>
                    <span className="text-[10px] text-slate-400 block truncate">{batch.supplier?.mobile || 'Farm Store'}</span>
                  </div>

                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Received</span>
                    <strong className="text-slate-900 text-xs sm:text-sm block leading-tight mt-0.5">{initialQty} {unit}</strong>
                    <span className="text-[10px] text-slate-400 block">
                      {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' }) : 'Arrived'}
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

                {/* 3. Ultra-Slim Movement History */}
                <div className="px-3 py-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Movement History</span>
                    <span>{(traceData.timeline?.receipts?.length || 1) + (traceData.timeline?.issues?.length || 0) + (batch.disposals?.length || 0)} entries</span>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    {(traceData.timeline?.receipts?.length ? traceData.timeline.receipts : [{ _id: 'legacy', receivedQuantity: initialQty, createdAt: batch.createdAt }]).map((receipt) => (
                      <div key={receipt._id} className="flex justify-between gap-2 py-1 text-[11px]">
                        <div className="min-w-0">
                          <span className="font-bold text-emerald-700">IN</span> +{receipt.storeAcceptedQuantity || receipt.receivedQuantity} {unit} Received from {receipt.supplier?.name || batch.supplier?.name || 'Direct Farm Purchase'}
                          <div className="text-slate-700">Received by: <strong>{receipt.receiverName || receipt.receivedBy?.name || receipt.receivedBy?.username || 'Not recorded'}</strong></div>
                        </div>
                        <span className="shrink-0 text-slate-400">{receipt.createdAt ? new Date(receipt.createdAt).toLocaleDateString() : ''}</span>
                      </div>
                    ))}

                    {(batch.disposals || []).map((entry, index) => (
                      <div key={entry._id || index} className="py-1 text-xs text-rose-700">
                        <strong>DISPOSED</strong> -{entry.quantity} {unit} ? By {entry.performedByName || 'Admin'} ? {new Date(entry.createdAt).toLocaleDateString()}
                      </div>
                    ))}

                    {/* OUT events */}
                    {(traceData.timeline?.issues || []).map((iss) => (
                      <div key={iss._id} className="flex items-center justify-between py-0.5 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 shrink-0">
                            OUT
                          </span>
                          <div className="min-w-0 break-words">
                            <div className="font-semibold text-slate-800">-{iss.issuedQuantity} {unit} to {iss.shed || 'Shed'}</div>
                            <div className="text-[11px] text-slate-600">
                              Received by: <strong>{iss.issuedTo || 'Not recorded'}</strong>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Issued by: {iss.issuedByName || iss.issuedBy?.name || 'Not recorded'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                          {iss.issueDate ? new Date(iss.issueDate).toLocaleDateString([], { day: '2-digit', month: 'short' }) : (iss.createdAt ? new Date(iss.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' }) : '')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* VIEW 4: Monthly Medicine Consumption & Shed Issue Register */}
      {activeTab === 'consumption' && (
        <MedicineConsumptionRegister
          selectedFarm={selectedFarm}
          firms={firms}
          onBackToDaily={() => setActiveTab('daily')}
          onConsumedDeleted={loadStats}
        />
      )}

      {/* Delete Batch Confirmation Modal (Admin & Developer Only) */}
      {deletingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-rose-200 overflow-hidden animate-in zoom-in-95 duration-200">
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
                  <strong className="text-slate-900">{deletingBatch.medicineName || deletingBatch.medicine?.name || 'Medicine'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Batch Number:</span>
                  <span className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.2 rounded border border-slate-200">{deletingBatch.batchNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Stock Balance:</span>
                  <strong className="text-emerald-700">{deletingBatch.quantityAvailable} {deletingBatch.unit}</strong>
                </div>
                {deletingBatch.expiryDate && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expiry Date:</span>
                    <span className="font-mono text-slate-700">{deletingBatch.expiryDate}</span>
                  </div>
                )}
              </div>

              <p className="text-[11px] text-rose-600 font-medium">
                ⚠️ Warning: This will remove this batch from stock and clean up linked ledger records.
              </p>

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
                  {deleting ? 'Deleting...' : '🗑️ Delete Permanently'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Batch Modal (Admin & Developer Only) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in duration-200">
            <div className="px-5 py-4 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-lg">✏️</span>
                <div>
                  <h3 className="font-bold text-sm">Edit Batch Details</h3>
                  <p className="text-[11px] text-slate-300">
                    {editingBatch?.medicine?.name || editingBatch?.medicineName || 'Medicine Batch'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingBatch(null);
                }}
                className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
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

              {/* Medicine Selector (Allows changing medicine item if entered wrongly) */}
              {(() => {
                const selectedEditMed =
                  allMedicinesList.find((m) => String(m._id) === String(editMedicineId)) ||
                  editingBatch?.medicine ||
                  null;
                const editPackSize = Number(selectedEditMed?.packSize) || 1;
                const editPackaging = selectedEditMed?.packagingType || 'Packet';
                const editUnit = formatUnit(selectedEditMed?.unit) || 'Units';

                return (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Medicine Item <span className="text-rose-500">*</span>
                      </label>
                      <select
                        required
                        value={editMedicineId}
                        onChange={(e) => {
                          const newMedId = e.target.value;
                          setEditMedicineId(newMedId);
                          const m = allMedicinesList.find((x) => String(x._id) === String(newMedId));
                          const size = Number(m?.packSize) || 1;
                          if (size > 0 && size !== 1 && editQuantity !== '' && !isNaN(editQuantity)) {
                            setEditPacks(Number((Number(editQuantity) / size).toFixed(3)));
                          } else {
                            setEditPacks('');
                          }
                        }}
                        className="w-full h-10 px-3 text-xs font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                      >
                        <option value="">-- Select Medicine --</option>
                        {allMedicinesList.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} {m.aliasName ? `(${m.aliasName})` : ''} • {formatUnit(m.unit)}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Reassigns this batch to a different medicine catalog item.
                      </p>
                    </div>

                    {/* Batch Number */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Batch Number <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={editBatchNumber}
                        onChange={(e) => setEditBatchNumber(e.target.value.toUpperCase())}
                        placeholder="e.g. BATCH-01"
                        className="w-full h-10 px-3 font-mono font-bold text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 uppercase"
                      />
                    </div>

                    {/* Dual Linked Pack / Unit inputs when packSize is customized */}
                    {editPackSize > 0 && editPackSize !== 1 ? (
                      <div className="space-y-2 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                          <span>📦 1 {editPackaging} = {editPackSize} {editUnit}</span>
                          <span className="text-[10px] text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full font-semibold">
                            Auto-converted
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Packs ({editPackaging})
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={editPacks}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditPacks(val);
                                if (val !== '' && Number(val) >= 0) {
                                  setEditQuantity(Number((Number(val) * editPackSize).toFixed(3)));
                                } else if (val === '') {
                                  setEditQuantity('');
                                }
                              }}
                              placeholder="e.g. 3"
                              className="w-full h-10 px-3 font-bold text-xs border border-emerald-300 bg-white rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none text-emerald-900"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Total In Stock ({editUnit}) <span className="text-rose-500">*</span>
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              required
                              value={editQuantity}
                              onChange={(e) => {
                                const val = e.target.value;
                                setEditQuantity(val);
                                if (val !== '' && Number(val) >= 0) {
                                  setEditPacks(Number((Number(val) / editPackSize).toFixed(3)));
                                } else if (val === '') {
                                  setEditPacks('');
                                }
                              }}
                              placeholder={`e.g. ${3 * editPackSize}`}
                              className="w-full h-10 px-3 font-bold text-xs border border-slate-300 bg-white rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        {editPacks !== '' && editQuantity !== '' && (
                          <div className="text-[11px] font-bold text-emerald-800 text-center pt-1 border-t border-emerald-200/60">
                            Total: {editPacks} {getPackagingPlural(editPackaging, editPacks)} = {editQuantity} {editUnit}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                          In Stock Qty ({editUnit}) <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={editQuantity}
                          onChange={(e) => setEditQuantity(e.target.value)}
                          placeholder="e.g. 50"
                          className="w-full h-10 px-3 font-bold text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50"
                        />
                      </div>
                    )}
                  </>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Expiry Date <span className="text-rose-500">*</span>
                </label>
                <div className="relative w-full cursor-pointer">
                  <input
                    type="date"
                    required
                    value={editExpiryDate}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker();
                      } catch (err) {}
                    }}
                    onFocus={(e) => {
                      try {
                        e.currentTarget.showPicker();
                      } catch (err) {}
                    }}
                    onChange={(e) => setEditExpiryDate(e.target.value)}
                    className="w-full h-10 pl-3 pr-8 font-mono text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 cursor-pointer relative [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">
                    📅
                  </span>
                </div>
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

      {/* Barcode Scanner Modal for Traceability */}
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

      {/* Stock Transfer Request Modal */}
      {canTransferStock && (
        <MedicineTransferModal
          isOpen={isTransferModalOpen}
          onClose={() => setIsTransferModalOpen(false)}
          firms={firms}
          currentFarmId={selectedFarm}
          onSuccess={() => {
            loadStats();
            loadPendingTransfers();
          }}
        />
      )}

      {/* Pending Transfers Inbox Modal */}
      {canTransferStock && (
        <MedicineTransferInboxModal
          isOpen={isInboxModalOpen}
          onClose={() => setIsInboxModalOpen(false)}
          pendingTransfers={pendingTransfers}
          currentFarmId={selectedFarm}
          firms={firms}
          onActionComplete={() => {
            loadStats();
            loadPendingTransfers();
          }}
        />
      )}
    </div>
  );
}
