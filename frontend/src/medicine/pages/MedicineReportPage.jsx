import React, { useState, useEffect } from 'react';
import { fetchDashboardStats, fetchBatchTraceability, updateBatchApi } from '../api/reportApi.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DailyMedicineActionPage from './DailyMedicineActionPage.jsx';
import MedicineConsumptionRegister from '../components/MedicineConsumptionRegister.jsx';
import MedicineBarcodeScannerModal from '../components/MedicineBarcodeScannerModal.jsx';
import MedicineTransferModal from '../components/MedicineTransferModal.jsx';
import MedicineTransferInboxModal from '../components/MedicineTransferInboxModal.jsx';
import { fetchPendingTransfers } from '../api/transferApi.js';

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
  const [editBatchNumber, setEditBatchNumber] = useState('');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [savingBatch, setSavingBatch] = useState(false);
  const [editBatchError, setEditBatchError] = useState('');

  const handleOpenEditBatchModal = (batch) => {
    if (!batch) return;
    setEditingBatch(batch);
    setEditBatchNumber(batch.batchNumber || '');
    setEditExpiryDate(batch.expiryDate || '');
    setEditBatchError('');
    setIsEditModalOpen(true);
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

  // Load Stock & Expiry stats
  const loadStats = async () => {
    try {
      setLoadingStats(true);
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
  }, []);

  useEffect(() => {
    if (firms.length === 1 && selectedFarm !== firms[0]._id) {
      setSelectedFarm(firms[0]._id);
    }
  }, [firms, selectedFarm]);

  useEffect(() => {
    if (activeTab === 'stock') {
      setStockFilter('ALL');
      loadStats();
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
        batchNumber: trimmedBatch,
        expiryDate: editExpiryDate,
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
  const allBatches = [
    ...(radar.expired || []).map((b) => ({ ...b, urgency: 'EXPIRED' })),
    ...(radar.critical30 || []).map((b) => ({ ...b, urgency: 'CRITICAL' })),
    ...(radar.caution60 || []).map((b) => ({ ...b, urgency: 'CAUTION' })),
    ...(radar.warning90 || []).map((b) => ({ ...b, urgency: 'WARNING' })),
    ...(radar.safe || []).map((b) => ({ ...b, urgency: 'SAFE' })),
  ].sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  // Filtered stock list
  const isStockSearchPureNumber = /^\d+$/.test(stockSearch.trim());
  const filteredBatches = allBatches.filter((b) => {
    const matchesSearch =
      b.medicineName?.toLowerCase().includes(stockSearch.toLowerCase()) ||
      b.batchNumber?.toLowerCase().includes(stockSearch.toLowerCase()) ||
      (!isStockSearchPureNumber && b.medicineCode?.toLowerCase().includes(stockSearch.toLowerCase())) ||
      b.medicineAlias?.toLowerCase().includes(stockSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (stockFilter === 'SAFE') return b.urgency === 'SAFE';
    if (stockFilter === 'SOON') return b.urgency === 'CRITICAL' || b.urgency === 'CAUTION' || b.urgency === 'WARNING';
    if (stockFilter === 'EXPIRED') return b.urgency === 'EXPIRED';
    if (stockFilter === 'LOW') return Boolean(b.isLowStock);
    return true;
  });

  const isAdmin = ['admin', 'developer', 'office', 'supervisor', 'farm_incharge'].includes(user?.role);

  return (
    <div className="space-y-1.5 sm:space-y-3 w-full max-w-5xl mx-auto px-0 sm:px-2 pb-8">
      {/* 1. Header & Navigation Tabs */}
      <div className="bg-white p-2 sm:p-3 rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs space-y-1.5 sm:space-y-2">
        <div className="flex flex-row items-center justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg">💊</span>
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                Farm Medicines
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

            {/* Filter Pills */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setStockFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 border ${
                  stockFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                All ({allBatches.length})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('SAFE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                  stockFilter === 'SAFE'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <span>🟢</span> Safe ({radar.safeCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('SOON')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                  stockFilter === 'SOON'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-xs'
                    : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>🟡</span> Soon ({(radar.critical30Count || 0) + (radar.caution60Count || 0) + (radar.warning90Count || 0)})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('EXPIRED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                  stockFilter === 'EXPIRED'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <span>🔴</span> Expired ({radar.expiredCount || 0})
              </button>
              {lowStock.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStockFilter('LOW')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                    stockFilter === 'LOW'
                      ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                      : 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                  }`}
                >
                  <span>⚠️</span> Low Stock ({lowStock.length})
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
                Showing <strong>{filteredBatches.length}</strong> of <strong>{allBatches.length}</strong> batches (Filtered by <strong>{stockFilter}</strong>).
              </span>
              <button
                type="button"
                onClick={() => setStockFilter('ALL')}
                className="text-xs font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
              >
                Show All ({allBatches.length})
              </button>
            </div>
          )}

          {/* Batches Stock List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingStats ? (
              <div className="p-12 text-center text-slate-400 text-xs">Loading current stock...</div>
            ) : filteredBatches.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs space-y-1">
                <p className="text-sm font-bold text-slate-600">No medicine batches found</p>
                <p className="text-[11px] text-slate-400">Try changing your search query or click "All" above.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4 min-w-[220px]">Medicine Name</th>
                        <th className="py-3 px-4">Batch Number</th>
                        <th className="py-3 px-4 text-right">In Stock</th>
                        <th className="py-3 px-4 text-center">Expiry Date</th>
                        <th className="py-3 px-4 text-center">Shelf Status</th>
                        {canAccessTraceAndAction && (
                          <th className="py-3 px-4 text-center">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredBatches.map((b) => {
                        const isExpired = b.urgency === 'EXPIRED';
                        const isCritical = b.urgency === 'CRITICAL'; // <= 30d (1 Month)
                        const isCaution = b.urgency === 'CAUTION';   // <= 60d (2 Months)
                        const isWarning = b.urgency === 'WARNING';   // <= 90d (3 Months)
                        return (
                          <tr
                            key={b._id}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              isExpired
                                ? 'bg-rose-50/40'
                                : isCritical
                                ? 'bg-rose-50/25'
                                : isCaution
                                ? 'bg-orange-50/25'
                                : isWarning
                                ? 'bg-amber-50/20'
                                : ''
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 text-sm">{b.medicineName}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500 flex-wrap">
                                {b.farm?.name && (
                                  <span className="font-bold text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                    🏢 {b.farm.name}
                                  </span>
                                )}
                                {b.medicineAlias && (
                                  <span className="font-medium text-slate-600">({b.medicineAlias})</span>
                                )}
                                {b.medicineCode && (
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200">
                                    {b.medicineCode}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 px-2 py-1 rounded border border-slate-200 inline-block">
                                {b.batchNumber}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {b.isLowStock && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-300">
                                    ⚠️ Low {b.reorderLevel ? `(< ${b.reorderLevel})` : ''}
                                  </span>
                                )}
                                <span className={`font-black text-sm ${b.isLowStock ? 'text-rose-700' : 'text-slate-900'}`}>
                                  {b.quantityAvailable}
                                </span>{' '}
                                <span className="text-[11px] text-slate-500 font-semibold">{b.unit}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-xs font-medium text-slate-600">
                              {b.expiryDate}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isExpired ? (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                                  🔴 Expired ({Math.abs(b.daysLeft)}d ago)
                                </span>
                              ) : isCritical ? (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-900 border border-red-200 inline-flex items-center gap-1" title="Expires within 1 month">
                                  🔴 Use Soon ({b.daysLeft}d left)
                                </span>
                              ) : isCaution ? (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-100 text-orange-900 border border-orange-200 inline-flex items-center gap-1" title="Expires within 2 months">
                                  🟠 Use Soon ({b.daysLeft}d left)
                                </span>
                              ) : isWarning ? (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200 inline-flex items-center gap-1" title="Expires within 3 months">
                                  🟡 Use Soon ({b.daysLeft}d left)
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200 inline-flex items-center gap-1" title="Safe (> 3 months)">
                                  🟢 Safe ({b.daysLeft}d left)
                                </span>
                              )}
                            </td>
                            {canAccessTraceAndAction && (
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {isExpired && canDispose ? (
                                    <button
                                      type="button"
                                      disabled={Boolean(disposing)}
                                      onClick={() => disposeStock(b)}
                                      className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2.5 py-1 transition cursor-pointer"
                                    >
                                      {disposing === b._id ? 'Disposing...' : 'Dispose'}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('traceability');
                                        setSearchBatch(b.batchNumber);
                                        handleTraceSearch(null, b.batchNumber, b._id);
                                      }}
                                      className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 transition cursor-pointer inline-flex items-center gap-1"
                                      title="Trace full batch journey"
                                    >
                                      <span>🔍</span> Trace
                                    </button>
                                  )}
                                  {canEditBatch && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditBatchModal(b)}
                                      className="text-xs font-bold text-slate-700 hover:text-amber-800 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-lg px-2 py-1 transition cursor-pointer inline-flex items-center"
                                      title="Edit Batch Number or Expiry Date (Admin/Developer)"
                                    >
                                      ✏️
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Responsive Cards View */}
                <div className="md:hidden divide-y divide-slate-100 bg-white">
                  {filteredBatches.map((b) => {
                    const isExpired = b.urgency === 'EXPIRED';
                    const isCritical = b.urgency === 'CRITICAL'; // <= 30d (1 Month)
                    const isCaution = b.urgency === 'CAUTION';   // <= 60d (2 Months)
                    const isWarning = b.urgency === 'WARNING';   // <= 90d (3 Months)
                    return (
                      <div
                        key={b._id}
                        className={`p-3.5 space-y-2 ${
                          isExpired
                            ? 'bg-rose-50/40'
                            : isCritical
                            ? 'bg-rose-50/25'
                            : isCaution
                            ? 'bg-orange-50/20'
                            : isWarning
                            ? 'bg-amber-50/15'
                            : ''
                        }`}
                      >
                        {/* Header: Medicine Name & Expiry Badge */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="font-bold text-sm text-slate-900 truncate">
                              {b.medicineName}
                            </h3>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                              {b.farm?.name && (
                                <span className="font-bold text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                  🏢 {b.farm.name}
                                </span>
                              )}
                              {b.medicineAlias && <span>({b.medicineAlias})</span>}
                              {b.medicineCode && (
                                <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 text-[10px]">
                                  {b.medicineCode}
                                </span>
                              )}
                            </div>
                          </div>
                          <div>
                            {isExpired ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                                🔴 Expired
                              </span>
                            ) : isCritical ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-200">
                                🔴 {b.daysLeft}d left
                              </span>
                            ) : isCaution ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 border border-orange-200">
                                🟠 {b.daysLeft}d left
                              </span>
                            ) : isWarning ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                                🟡 {b.daysLeft}d left
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                                🟢 Safe ({b.daysLeft}d left)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Batch & Stock Bar */}
                        <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 text-xs">
                          <div>
                            <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">
                              Batch #
                            </span>
                            <span className="font-mono font-bold text-slate-800 text-xs">
                              {b.batchNumber}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">
                              Stock Available
                            </span>
                            <div className="flex items-center justify-end gap-1">
                              {b.isLowStock && (
                                <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-rose-100 text-rose-700">
                                  ⚠️ Low
                                </span>
                              )}
                              <span className={`font-black text-sm ${b.isLowStock ? 'text-rose-700' : 'text-slate-900'}`}>
                                {b.quantityAvailable}
                              </span>
                              <span className="text-[11px] text-slate-500 font-semibold">{b.unit}</span>
                            </div>
                          </div>
                        </div>

                        {/* Footer: Expiry Date & Action */}
                        <div className="flex justify-between items-center text-xs pt-1">
                          <span className="text-[11px] text-slate-500 font-mono">
                            Expires: <strong className="text-slate-700">{b.expiryDate}</strong>
                          </span>
                          {canAccessTraceAndAction && (
                            <div className="flex items-center gap-1.5">
                              {isExpired && canDispose ? (
                                <button
                                  type="button"
                                  disabled={Boolean(disposing)}
                                  onClick={() => disposeStock(b)}
                                  className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2.5 py-1 cursor-pointer"
                                >
                                  {disposing === b._id ? 'Disposing...' : 'Dispose'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveTab('traceability');
                                    setSearchBatch(b.batchNumber);
                                    handleTraceSearch(null, b.batchNumber, b._id);
                                  }}
                                  className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 cursor-pointer inline-flex items-center gap-1"
                                >
                                  <span>🔍</span> Trace
                                </button>
                              )}
                              {canEditBatch && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditBatchModal(b)}
                                  className="text-xs font-bold text-slate-700 hover:text-amber-800 bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 rounded-lg px-2 py-1 cursor-pointer"
                                  title="Edit Batch"
                                >
                                  ✏️
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
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
        />
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

            <form onSubmit={handleSaveBatchEdit} className="p-5 space-y-4">
              {editBatchError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
                  ⚠️ {editBatchError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Batch Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editBatchNumber}
                  onChange={(e) => setEditBatchNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. ENR-01, LAS-02"
                  className="w-full h-10 px-3 font-mono font-bold text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 uppercase"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Renaming updates all linked purchase receipts, shed issues, and ledger transactions.
                </p>
              </div>

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
