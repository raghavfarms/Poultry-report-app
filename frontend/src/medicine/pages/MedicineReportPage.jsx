import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchDashboardStats, fetchBatchTraceability } from '../api/reportApi.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DailyMedicineActionPage from './DailyMedicineActionPage.jsx';
import MedicineBarcodeScannerModal from '../components/MedicineBarcodeScannerModal.jsx';

export default function MedicineReportPage() {
  const { user } = useAuth();

  // Active Tab: 1. Daily In/Out (Default) | 2. Current Stock | 3. Traceability
  const [activeTab, setActiveTab] = useState('daily');

  // Farm Store Filter
  const [selectedFarm, setSelectedFarm] = useState('');
  const [firms, setFirms] = useState([]);

  // Live Stock State
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('ALL'); // 'ALL' | 'SAFE' | 'SOON' | 'EXPIRED' | 'LOW'

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
      setFirms(data.firms || []);
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
    if (activeTab === 'stock') {
      loadStats();
    }
  }, [activeTab, selectedFarm]);

  // Handle Traceability Search
  const handleTraceSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchBatch.trim()) return;

    try {
      setLoadingTrace(true);
      setTraceError('');
      setTraceData(null);
      const data = await fetchBatchTraceability(searchBatch.trim());
      setTraceData(data);
    } catch (err) {
      setTraceError(err.message || `No history found for batch '${searchBatch}'`);
    } finally {
      setLoadingTrace(false);
    }
  };

  const radar = stats?.expiryRadar || {};
  const lowStock = stats?.lowStockAlerts || [];

  // Flatten all available batches for live stock view
  const allBatches = [
    ...(radar.expired || []).map((b) => ({ ...b, urgency: 'EXPIRED' })),
    ...(radar.critical30 || []).map((b) => ({ ...b, urgency: 'CRITICAL' })),
    ...(radar.caution60 || []).map((b) => ({ ...b, urgency: 'CAUTION' })),
    ...(radar.safe || []).map((b) => ({ ...b, urgency: 'SAFE' })),
  ];

  // Filtered stock list
  const filteredBatches = allBatches.filter((b) => {
    const matchesSearch =
      b.medicineName?.toLowerCase().includes(stockSearch.toLowerCase()) ||
      b.batchNumber?.toLowerCase().includes(stockSearch.toLowerCase()) ||
      b.medicineCode?.toLowerCase().includes(stockSearch.toLowerCase()) ||
      b.medicineAlias?.toLowerCase().includes(stockSearch.toLowerCase());

    if (!matchesSearch) return false;

    if (stockFilter === 'SAFE') return b.urgency === 'SAFE';
    if (stockFilter === 'SOON') return b.urgency === 'CRITICAL' || b.urgency === 'CAUTION';
    if (stockFilter === 'EXPIRED') return b.urgency === 'EXPIRED';
    if (stockFilter === 'LOW') return Boolean(b.isLowStock);
    return true;
  });

  const isAdmin = ['admin', 'developer', 'office', 'supervisor', 'farm_incharge'].includes(user?.role);

  return (
    <div className="space-y-3 w-full max-w-5xl mx-auto px-0 sm:px-2 pb-8">
      {/* 1. Header & Navigation Tabs */}
      <div className="bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base sm:text-lg">💊</span>
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                Farm Medicines
              </h1>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-500">
              Daily fast In/Out, live stock & batch trace
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
            {/* Farm filter */}
            {firms.length > 0 && (
              <select
                value={selectedFarm}
                onChange={(e) => setSelectedFarm(e.target.value)}
                className="h-7 sm:h-8 px-2 border border-slate-300 rounded-lg text-[11px] font-semibold text-slate-700 bg-white focus:outline-none"
              >
                <option value="">All Farms</option>
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}

            {/* Quick Link to Medicine Master for Admin / Supervisor */}
            {isAdmin && (
              <Link
                to="/admin/medicine/master"
                className="h-7 sm:h-8 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-lg transition flex items-center gap-1 shrink-0"
                title="Manage Catalog, Add New Medicine or Change Units"
              >
                <span>⚙</span> Master
              </Link>
            )}
          </div>
        </div>

        {/* The 3 Clean Farm Views Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl text-center">
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
        </div>
      </div>

      {/* VIEW 1: Daily Quick Action (The Worker's Best Friend) */}
      {activeTab === 'daily' && (
        <DailyMedicineActionPage
          hideHeader={true}
          selectedFarm={selectedFarm}
          firms={firms}
          onActivityUpdated={() => {
            loadStats();
          }}
        />
      )}

      {/* VIEW 2: Current Stock & Expiry (Simple Visual List) */}
      {activeTab === 'stock' && (
        <div className="space-y-3">
          {/* Quick Filter Strip */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row justify-between gap-2.5 items-stretch sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                placeholder="Search medicine name, code, or batch..."
                className="w-full h-9 pl-8 pr-3 border border-slate-300 rounded-lg text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
            </div>

            {/* Filter Pills */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setStockFilter('ALL')}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition cursor-pointer shrink-0 border ${
                  stockFilter === 'ALL'
                    ? 'bg-slate-200 text-slate-900 border-slate-400 shadow-2xs font-extrabold'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                }`}
              >
                All ({allBatches.length})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('SAFE')}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                  stockFilter === 'SAFE'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-400 shadow-2xs font-extrabold'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                <span>🟢</span> Safe ({radar.safeCount || 0})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('SOON')}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                  stockFilter === 'SOON'
                    ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs font-extrabold'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <span>🟡</span> Soon ({(radar.critical30Count || 0) + (radar.caution60Count || 0)})
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('EXPIRED')}
                className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                  stockFilter === 'EXPIRED'
                    ? 'bg-rose-100 text-rose-900 border-rose-400 shadow-2xs font-extrabold'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <span>🔴</span> Expired ({radar.expiredCount || 0})
              </button>
              {lowStock.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStockFilter('LOW')}
                  className={`px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 border ${
                    stockFilter === 'LOW'
                      ? 'bg-rose-600 text-white border-rose-700 shadow-2xs font-extrabold'
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

          {/* Batches Stock List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {loadingStats ? (
              <div className="p-8 text-center text-slate-400 text-xs">Loading current stock...</div>
            ) : filteredBatches.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No medicine batches match your search / filter.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Medicine Name</th>
                        <th className="py-2.5 px-3">Batch Number</th>
                        <th className="py-2.5 px-3 text-right">Available in Cupboard</th>
                        <th className="py-2.5 px-3">Expiry Date</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredBatches.map((b) => {
                        const isExpired = b.urgency === 'EXPIRED';
                        const isCritical = b.urgency === 'CRITICAL';
                        const isCaution = b.urgency === 'CAUTION';
                        return (
                          <tr
                            key={b._id}
                            className={`hover:bg-slate-50/80 transition ${
                              isExpired ? 'bg-rose-50/40' : isCritical ? 'bg-orange-50/30' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900">{b.medicineName}</span>
                              {b.medicineAlias && (
                                <span className="ml-1 text-[11px] text-slate-400 font-normal">
                                  ({b.medicineAlias})
                                </span>
                              )}
                              <span className="text-slate-400 text-[10px] ml-1">[{b.medicineCode}]</span>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800">{b.batchNumber}</td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {b.isLowStock && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-300">
                                    ⚠️ Low Stock {b.reorderLevel ? `(< ${b.reorderLevel})` : ''}
                                  </span>
                                )}
                                <span className={`font-black text-sm ${b.isLowStock ? 'text-rose-700' : 'text-slate-900'}`}>
                                  {b.quantityAvailable}
                                </span>{' '}
                                <span className="text-[10px] text-slate-500 font-medium">{b.unit}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-600">{b.expiryDate}</td>
                            <td className="py-2.5 px-3 text-center">
                              {isExpired ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                  🔴 Expired ({Math.abs(b.daysLeft)}d ago)
                                </span>
                              ) : isCritical ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                                  🟠 Use Soon ({b.daysLeft}d left)
                                </span>
                              ) : isCaution ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  🟡 In 60 Days ({b.daysLeft}d)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  🟢 Safe ({b.daysLeft}d left)
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {filteredBatches.map((b) => {
                    const isExpired = b.urgency === 'EXPIRED';
                    const isCritical = b.urgency === 'CRITICAL';
                    return (
                      <div
                        key={b._id}
                        className={`px-3 py-2 space-y-1 ${
                          isExpired ? 'bg-rose-50/40' : isCritical ? 'bg-orange-50/30' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center gap-1">
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {b.medicineName}
                            {b.medicineAlias && (
                              <span className="text-[10px] text-slate-400 font-normal ml-1">({b.medicineAlias})</span>
                            )}
                          </span>
                          {isExpired ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 shrink-0">
                              🔴 Expired
                            </span>
                          ) : isCritical ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-orange-800 shrink-0">
                              🟠 {b.daysLeft}d left
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 shrink-0">
                              🟢 Safe
                            </span>
                          )}
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-500 text-[11px] truncate">
                            Batch: <strong className="text-slate-800 font-mono">{b.batchNumber}</strong>
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {b.isLowStock && (
                              <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-300">
                                ⚠️ Low Stock {b.reorderLevel ? `(< ${b.reorderLevel})` : ''}
                              </span>
                            )}
                            <span className={`font-black text-xs shrink-0 ${b.isLowStock ? 'text-rose-700' : 'text-slate-900'}`}>
                              {b.quantityAvailable} {b.unit}
                            </span>
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400">
                          Expires: {b.expiryDate} ({b.daysLeft > 0 ? `${b.daysLeft}d left` : `${Math.abs(b.daysLeft)}d ago`})
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
      {activeTab === 'traceability' && (
        <div className="space-y-4">
          <div className="bg-white p-2.5 sm:p-3 rounded-xl border border-slate-200 shadow-2xs space-y-1.5">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>🔍</span> Reverse Batch Investigation
            </h2>
            <p className="text-[11px] text-slate-500">
              Type or scan any batch number to see when it arrived, supplier, and which sheds consumed it.
            </p>

            <form onSubmit={handleTraceSearch} className="flex gap-1.5 pt-0.5">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={searchBatch}
                  onChange={(e) => setSearchBatch(e.target.value)}
                  placeholder="Batch # or scan..."
                  className="w-full h-8 pl-2.5 pr-8 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none uppercase"
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
                  </div>

                  {/* Expiry Badge */}
                  <div>
                    {daysLeft !== null ? (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-black ${
                        daysLeft <= 0
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : daysLeft <= 30
                          ? 'bg-orange-100 text-orange-800 border border-orange-200'
                          : daysLeft <= 60
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}>
                        <span>{daysLeft <= 0 ? '🔴' : daysLeft <= 30 ? '🟠' : daysLeft <= 60 ? '🟡' : '🟢'}</span>
                        <span>{daysLeft <= 0 ? `Expired (${Math.abs(daysLeft)}d ago)` : `${daysLeft}d Safe`}</span>
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
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Left in Cupboard</span>
                    <strong className="text-emerald-700 text-xs sm:text-sm block leading-tight mt-0.5">{availableQty} {unit}</strong>
                    <span className="text-[10px] text-emerald-600 font-semibold block">Available</span>
                  </div>
                </div>

                {/* 3. Ultra-Slim Movement History */}
                <div className="px-3 py-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Movement History</span>
                    <span>{1 + (traceData.timeline?.issues?.length || 0)} entries</span>
                  </div>
                  <div className="space-y-0.5 text-xs">
                    {/* IN event */}
                    <div className="flex items-center justify-between py-0.5 text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 shrink-0">
                          IN
                        </span>
                        <span className="font-semibold text-slate-800 truncate">
                          +{initialQty} {unit} Received from {batch.supplier?.name || 'Supplier'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium shrink-0 ml-2">
                        {batch.createdAt ? new Date(batch.createdAt).toLocaleDateString([], { day: '2-digit', month: 'short' }) : ''}
                      </span>
                    </div>

                    {/* OUT events */}
                    {(traceData.timeline?.issues || []).map((iss) => (
                      <div key={iss._id} className="flex items-center justify-between py-0.5 text-[11px]">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="px-1 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 shrink-0">
                            OUT
                          </span>
                          <span className="font-semibold text-slate-800 truncate">
                            -{iss.issuedQuantity} {unit} to {iss.shed || 'Shed'}
                          </span>
                          {iss.issuedBy?.name && (
                            <span className="text-[10px] text-slate-400 hidden sm:inline">• {iss.issuedBy.name}</span>
                          )}
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

      {/* Barcode Scanner Modal for Traceability */}
      <MedicineBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={({ batchNumber }) => {
          if (batchNumber) {
            setSearchBatch(batchNumber);
            handleTraceSearch();
          }
        }}
      />
    </div>
  );
}
