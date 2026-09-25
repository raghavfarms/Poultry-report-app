import React, { useState, useEffect, useRef } from 'react';
import {
  fetchDashboardStats,
  fetchBatchTraceability,
  fetchStockLedger,
  fetchFlockCosting,
} from '../api/reportApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import MedicineBarcodeScannerModal from '../components/MedicineBarcodeScannerModal.jsx';

export default function MedicineReportPage() {
  // Navigation sub-view
  const [subView, setSubView] = useState('radar'); // 'radar' | 'alerts' | 'traceability' | 'ledger' | 'flockCosting'

  // Dashboard Stats State
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [selectedFarm, setSelectedFarm] = useState('');

  // Traceability State
  const [searchBatch, setSearchBatch] = useState('');
  const [traceData, setTraceData] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceError, setTraceError] = useState('');
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Stock Ledger State
  const [medicines, setMedicines] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPages, setLedgerPages] = useState(1);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerFilters, setLedgerFilters] = useState({
    medicine: '',
    transactionType: '',
    startDate: '',
    endDate: '',
  });

  // Flock Costing State
  const [flockCostingData, setFlockCostingData] = useState(null);
  const [loadingCosting, setLoadingCosting] = useState(false);

  // WhatsApp Share State
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppText, setWhatsAppText] = useState('');
  const [whatsAppPhone, setWhatsAppPhone] = useState('');
  const [copied, setCopied] = useState(false);

  const printRef = useRef(null);

  // 1. Load Dashboard KPIs & Expiry Radar
  const loadStats = async () => {
    try {
      setLoadingStats(true);
      setStatsError('');
      const data = await fetchDashboardStats({ farm: selectedFarm });
      setStats(data);
    } catch (err) {
      setStatsError(err.message || 'Failed to load dashboard metrics');
    } finally {
      setLoadingStats(false);
    }
  };

  // 2. Load Medicines list for filter dropdowns
  const loadMedicinesList = async () => {
    try {
      const data = await fetchMedicines({ includeInactive: false });
      setMedicines(data.medicines || []);
    } catch (err) {
      console.error('Failed to load medicines:', err);
    }
  };

  // 3. Load Stock Movement Audit Ledger
  const loadLedger = async (page = 1) => {
    try {
      setLoadingLedger(true);
      const data = await fetchStockLedger({
        ...ledgerFilters,
        page,
        limit: 25,
      });
      setLedgerTransactions(data.transactions || []);
      setLedgerTotal(data.total || 0);
      setLedgerPage(data.page || 1);
      setLedgerPages(data.pages || 1);
    } catch (err) {
      console.error('Failed to load stock ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  };

  // 4. Load Flock Treatment Costing Report
  const loadFlockCosting = async () => {
    try {
      setLoadingCosting(true);
      const data = await fetchFlockCosting({ farm: selectedFarm });
      setFlockCostingData(data);
    } catch (err) {
      console.error('Failed to load flock costing:', err);
    } finally {
      setLoadingCosting(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadMedicinesList();
  }, [selectedFarm]);

  useEffect(() => {
    if (subView === 'ledger') {
      loadLedger(1);
    } else if (subView === 'flockCosting') {
      loadFlockCosting();
    }
  }, [subView, ledgerFilters, selectedFarm]);

  // Handle Reverse Batch Traceability Search
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

  // CSV Export for Ledger
  const handleExportCsv = () => {
    if (!ledgerTransactions || ledgerTransactions.length === 0) {
      alert('No ledger records to export');
      return;
    }

    const headers = ['Date', 'Medicine Code', 'Medicine Name', 'Batch', 'Type', 'Quantity', 'Balance After', 'Performed By', 'Remarks'];
    const rows = ledgerTransactions.map((tx) => [
      `"${new Date(tx.createdAt).toLocaleString('en-IN')}"`,
      `"${tx.medicine?.code || ''}"`,
      `"${tx.medicine?.name || ''}"`,
      `"${tx.batch?.batchNumber || ''}"`,
      `"${tx.transactionType}"`,
      tx.quantity,
      tx.balanceAfter,
      `"${tx.performedBy?.name || ''}"`,
      `"${(tx.remarks || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `medicine_stock_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Native Print / PDF Handler
  const handlePrint = () => {
    window.print();
  };

  const summary = stats?.summary || {};
  const radar = stats?.expiryRadar || {};
  const lowStock = stats?.lowStockAlerts || [];

  // Generate WhatsApp formatted text
  const generateWhatsAppReport = (reportType = subView) => {
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const farmLabel = selectedFarm ? `${selectedFarm} Farm` : 'All Stores / Central Inventory';

    let msg = '';

    if (reportType === 'radar') {
      msg = `🚨 *RAGHAV FARMS — MEDICINE EXPIRY ALERT* 🚨\n`;
      msg += `📅 *Date:* ${today}\n`;
      msg += `📍 *Store:* ${farmLabel}\n\n`;

      msg += `🔴 *Expired Batches:* ${radar.expiredCount || 0}\n`;
      if ((radar.expired || []).length > 0) {
        radar.expired.slice(0, 5).forEach((b) => {
          msg += `  • *${b.medicineName}* (Batch: ${b.batchNumber}) — ${b.quantityAvailable} ${b.unit} [Expired: ${b.expiryDate}]\n`;
        });
        if (radar.expired.length > 5) msg += `  • ...and ${radar.expired.length - 5} more expired batches\n`;
      }

      msg += `\n🟠 *Expiring in ≤ 30 Days (Urgent FEFO):* ${radar.critical30Count || 0}\n`;
      if ((radar.critical30 || []).length > 0) {
        radar.critical30.slice(0, 5).forEach((b) => {
          msg += `  • *${b.medicineName}* (Batch: ${b.batchNumber}) — ${b.quantityAvailable} ${b.unit} (Exp: ${b.expiryDate}, ${b.daysLeft}d left)\n`;
        });
        if (radar.critical30.length > 5) msg += `  • ...and ${radar.critical30.length - 5} more batches\n`;
      }

      msg += `\n🟡 *Caution (31–60 Days):* ${radar.caution60Count || 0} batches\n`;
      msg += `🟢 *Safe Stock (> 60 Days):* ${radar.safeCount || 0} batches\n\n`;
      msg += `⚠️ *Action:* Issue 30-day batches immediately under FEFO. Remove expired vials from circulation.`;
    } else if (reportType === 'alerts') {
      msg = `🚨 *RAGHAV FARMS — MEDICINE REORDER ALERTS* 🚨\n`;
      msg += `📅 *Date:* ${today}\n`;
      msg += `📍 *Store:* ${farmLabel}\n\n`;
      msg += `⚠️ *Medicines At or Below Reorder Level:* ${lowStock.length}\n\n`;
      lowStock.forEach((m) => {
        const deficit = Math.max(0, (m.reorderLevel || m.minimumStock || 0) - m.currentStock);
        msg += `• *${m.name}* (${m.code}):\n`;
        msg += `  Available: ${m.currentStock} ${m.unit} | Min Level: ${m.reorderLevel || m.minimumStock} ${m.unit}\n`;
        msg += `  *Shortfall:* +${deficit} ${m.unit} needed (${m.status.replace('_', ' ')})\n\n`;
      });
      msg += `📦 *Action:* Create Purchase Order (PO) to replenish stock.`;
    } else if (reportType === 'flockCosting' && flockCostingData) {
      const overall = flockCostingData.overall || {};
      msg = `💰 *RAGHAV FARMS — FLOCK MEDICINE COST & ROI REPORT* 💰\n`;
      msg += `📅 *Date:* ${today}\n`;
      msg += `📍 *Store:* ${farmLabel}\n\n`;
      msg += `📊 *Summary Overview:*\n`;
      msg += `• Total Flocks: ${overall.totalFlocks || 0}\n`;
      msg += `• Total Birds Treated: ${(overall.grandTotalBirds || 0).toLocaleString('en-IN')}\n`;
      msg += `• Total Medicine Spend: ₹${(overall.grandTotalCost || 0).toLocaleString('en-IN')}\n`;
      msg += `• *Average Cost Per Bird:* ₹${overall.overallCostPerBird || 0}\n\n`;

      msg += `🐔 *Flock Breakdown:*\n`;
      (flockCostingData.flocks || []).slice(0, 6).forEach((f) => {
        msg += `• *${f.flockNumber}* (${f.shed}): ${f.birdCount > 0 ? f.birdCount.toLocaleString('en-IN') : 0} birds | Spend: ₹${f.totalEstimatedCost.toLocaleString('en-IN')} | *₹${f.costPerBird}/bird*\n`;
      });
    } else {
      // General inventory status
      msg = `📋 *RAGHAV FARMS — DAILY MEDICINE INVENTORY REPORT* 📋\n`;
      msg += `📅 *Date:* ${today}\n`;
      msg += `📍 *Store:* ${farmLabel}\n\n`;
      msg += `📦 *Current Stock:*\n`;
      msg += `• Catalog Medicines: ${summary.totalMedicines || 0}\n`;
      msg += `• Total Units in Stock: ${(summary.totalAvailableUnits || 0).toLocaleString('en-IN')}\n`;
      msg += `• Active Batches: ${summary.totalBatches || 0}\n`;
      msg += `• Reorder Alerts: ${summary.lowStockCount || 0} items low\n\n`;
      msg += `⏳ *Expiry Radar:*\n`;
      msg += `• 🔴 Expired: ${radar.expiredCount || 0} batches\n`;
      msg += `• 🟠 ≤ 30 Days: ${radar.critical30Count || 0} batches\n`;
      msg += `• 🟡 31–60 Days: ${radar.caution60Count || 0} batches\n`;
      msg += `• 🟢 Safe: ${radar.safeCount || 0} batches\n`;
    }

    msg += `\n_Generated via Poultry Report Management System_`;
    return msg;
  };

  const handleOpenWhatsApp = (specificType) => {
    const text = generateWhatsAppReport(specificType || subView);
    setWhatsAppText(text);
    setCopied(false);
    setIsWhatsAppModalOpen(true);
  };

  const handleSendWhatsApp = () => {
    const encoded = encodeURIComponent(whatsAppText);
    const cleanPhone = whatsAppPhone.replace(/\D/g, '');
    let url = '';
    if (cleanPhone) {
      const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      url = `https://wa.me/${fullPhone}?text=${encoded}`;
    } else {
      url = `https://wa.me/?text=${encoded}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyWhatsApp = () => {
    navigator.clipboard.writeText(whatsAppText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div ref={printRef} className="space-y-4 sm:space-y-6">
      {/* 1. Header & Quick Controls */}
      <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className="text-base sm:text-xl font-bold text-slate-900">
              Medicine & Vaccine Intelligence Dashboard
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time stock valuation, proactive Expiry Radar, and reverse batch traceability
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Farm filter */}
          <select
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="flex-1 sm:flex-none h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Farms / Stores</option>
            <option value="Raghav">Raghav Farm</option>
            <option value="Sanjana">Sanjana Farm</option>
          </select>

          {/* Export PDF Button */}
          <button
            onClick={handlePrint}
            className="h-8 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0"
            title="Print or Save as PDF"
          >
            <span>🖨️</span> Print / PDF
          </button>

          {/* Share to WhatsApp Button */}
          <button
            type="button"
            onClick={() => handleOpenWhatsApp()}
            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer"
            title="Share Formatted Report via WhatsApp"
          >
            <span>💬</span> Share WhatsApp
          </button>

          {/* Refresh Button */}
          <button
            onClick={loadStats}
            className="h-8 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg transition shrink-0"
            title="Refresh Metrics"
          >
            ↻
          </button>
        </div>
      </div>

      {statsError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
          ⚠ {statsError}
        </div>
      )}

      {/* 2. Executive KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Card 1: Total Medicines */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Catalog Medicines</span>
            <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs">💊</span>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-slate-900">
            {loadingStats ? '—' : summary.totalMedicines || 0}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Active registered items</div>
        </div>

        {/* Card 2: Total Units Available */}
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Available Stock</span>
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs">📦</span>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-slate-900">
            {loadingStats ? '—' : (summary.totalAvailableUnits || 0).toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            Across {summary.totalBatches || 0} valid batches
          </div>
        </div>

        {/* Card 3: Low Stock Alerts */}
        <div
          onClick={() => setSubView('alerts')}
          className={`p-3.5 sm:p-4 rounded-xl border transition cursor-pointer ${
            (summary.lowStockCount || 0) > 0
              ? 'bg-amber-50/60 border-amber-300 hover:bg-amber-50'
              : 'bg-white border-slate-200 hover:bg-slate-50/50'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Low Stock Alerts</span>
            <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs">🚨</span>
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-black text-amber-900">
            {loadingStats ? '—' : summary.lowStockCount || 0}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5 font-medium flex items-center gap-1">
            <span>At or below reorder level</span>
            <span>➔</span>
          </div>
        </div>

        {/* Card 4: Expiry Radar Warning */}
        <div
          onClick={() => setSubView('radar')}
          className={`p-3.5 sm:p-4 rounded-xl border transition cursor-pointer ${
            (summary.expiredCount || 0) > 0 || (summary.critical30Count || 0) > 0
              ? 'bg-rose-50/60 border-rose-300 hover:bg-rose-50'
              : 'bg-white border-slate-200 hover:bg-slate-50/50'
          }`}
        >
          <div className="flex justify-between items-start">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider">Expiry Radar</span>
            <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg text-xs">⏳</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-black text-rose-900">
              {loadingStats ? '—' : (summary.expiredCount || 0) + (summary.critical30Count || 0)}
            </span>
            <span className="text-[10px] font-bold text-rose-600">
              ({summary.expiredCount || 0} expired)
            </span>
          </div>
          <div className="text-[10px] text-rose-700 mt-0.5 font-medium flex items-center gap-1">
            <span>Critical attention required</span>
            <span>➔</span>
          </div>
        </div>
      </div>

      {/* 3. Sub-View Selector (Touch-friendly Pill Navigation) */}
      <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setSubView('radar')}
          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subView === 'radar'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>⏳</span> Expiry Radar
          {(radar.expiredCount || 0) > 0 && (
            <span className="px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[9px]">
              {radar.expiredCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubView('alerts')}
          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subView === 'alerts'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🚨</span> Reorder Alerts
          {lowStock.length > 0 && (
            <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[9px]">
              {lowStock.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSubView('traceability')}
          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subView === 'traceability'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>🔍</span> Reverse Traceability
        </button>

        <button
          type="button"
          onClick={() => setSubView('ledger')}
          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subView === 'ledger'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>📜</span> Stock Movement Ledger
        </button>

        <button
          type="button"
          onClick={() => setSubView('flockCosting')}
          className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
            subView === 'flockCosting'
              ? 'bg-white text-slate-900 shadow-2xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <span>💰</span> Flock Costing & ROI
        </button>
      </div>

      {/* 4. SUB-VIEW: Expiry Radar */}
      {subView === 'radar' && (
        <div className="space-y-4">
          {/* Subview Header with Quick WhatsApp Share */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>⏳</span> Proactive Expiry Timeline (FEFO Distribution)
              </h2>
              <p className="text-[11px] text-slate-500">Action items sorted by shelf-life criticality for stock issuance</p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenWhatsApp('radar')}
              className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <span>💬</span> Share Expiry Radar
            </button>
          </div>

          {/* Expiry Overview Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
            <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-center">
              <div className="text-[10px] font-bold text-rose-600 uppercase">🔴 Expired</div>
              <div className="text-lg font-black text-rose-900 mt-0.5">{radar.expiredCount || 0} batches</div>
              <div className="text-[9px] text-rose-500 font-medium">Safe disposal required</div>
            </div>
            <div className="p-2 bg-orange-50 border border-orange-200 rounded-lg text-center">
              <div className="text-[10px] font-bold text-orange-600 uppercase">🟠 ≤ 30 Days</div>
              <div className="text-lg font-black text-orange-900 mt-0.5">{radar.critical30Count || 0} batches</div>
              <div className="text-[9px] text-orange-500 font-medium">Priority for FEFO issue</div>
            </div>
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-center">
              <div className="text-[10px] font-bold text-amber-600 uppercase">🟡 31–60 Days</div>
              <div className="text-lg font-black text-amber-900 mt-0.5">{radar.caution60Count || 0} batches</div>
              <div className="text-[9px] text-amber-500 font-medium">Approaching expiry</div>
            </div>
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
              <div className="text-[10px] font-bold text-emerald-600 uppercase">🟢 &gt; 60 Days</div>
              <div className="text-lg font-black text-emerald-900 mt-0.5">{radar.safeCount || 0} batches</div>
              <div className="text-[9px] text-emerald-500 font-medium">Safe inventory shelf</div>
            </div>
          </div>

          {/* Expired Batches Section */}
          {(radar.expired || []).length > 0 && (
            <div className="bg-white rounded-xl border border-rose-300 shadow-xs overflow-hidden">
              <div className="bg-rose-500 px-3.5 py-2 flex items-center justify-between text-white">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <span>⛔</span> Expired Batches — Immediate Safe Disposal Required ({radar.expired.length})
                </span>
                <span className="text-[10px] font-semibold bg-rose-600/70 px-2 py-0.5 rounded">
                  Do NOT issue to birds
                </span>
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-rose-50/50 text-[10px] uppercase font-bold text-rose-800 border-b border-rose-100">
                    <tr>
                      <th className="py-2.5 px-3">Batch Number</th>
                      <th className="py-2.5 px-3">Medicine</th>
                      <th className="py-2.5 px-3 text-right">Expired Quantity</th>
                      <th className="py-2.5 px-3">Expiry Date</th>
                      <th className="py-2.5 px-3 text-center">Days Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-100/60">
                    {radar.expired.map((b) => (
                      <tr key={b._id} className="hover:bg-rose-50/30 transition">
                        <td className="py-2 px-3 font-bold text-slate-900">{b.batchNumber}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800">
                          {b.medicineName} <span className="text-slate-400 font-normal">({b.medicineCode})</span>
                        </td>
                        <td className="py-2 px-3 text-right font-black text-rose-700">
                          {b.quantityAvailable} {b.unit}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{b.expiryDate}</td>
                        <td className="py-2 px-3 text-center font-bold text-rose-600">
                          {Math.abs(b.daysLeft)} days ago
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-rose-100">
                {radar.expired.map((b) => (
                  <div key={b._id} className="p-3 space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-slate-900">{b.batchNumber}</span>
                      <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                        Expired {Math.abs(b.daysLeft)}d ago
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-700">{b.medicineName}</div>
                    <div className="flex justify-between text-[11px] text-slate-500 pt-1">
                      <span>Stock: <strong className="text-rose-700">{b.quantityAvailable} {b.unit}</strong></span>
                      <span>Expiry: {b.expiryDate}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Critical (<= 30 Days) Section */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="bg-orange-50 px-3.5 py-2.5 border-b border-orange-200 flex items-center justify-between">
              <span className="text-xs font-bold text-orange-900 flex items-center gap-1.5">
                <span>🟠</span> Batches Expiring in ≤ 30 Days ({(radar.critical30 || []).length})
              </span>
              <span className="text-[10px] font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded">
                FEFO Priority
              </span>
            </div>

            {loadingStats ? (
              <div className="p-6 text-center text-slate-400 text-xs">Loading expiry metrics...</div>
            ) : (radar.critical30 || []).length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No batches expiring in the next 30 days. All active stocks are fresh!
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Batch Number</th>
                        <th className="py-2.5 px-3">Medicine</th>
                        <th className="py-2.5 px-3 text-right">Available Qty</th>
                        <th className="py-2.5 px-3">Expiry Date</th>
                        <th className="py-2.5 px-3 text-center">Days Remaining</th>
                        <th className="py-2.5 px-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {radar.critical30.map((b) => (
                        <tr key={b._id} className="hover:bg-slate-50/75 transition">
                          <td className="py-2 px-3 font-bold text-slate-900">{b.batchNumber}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {b.medicineName} <span className="text-slate-400 font-normal">({b.medicineCode})</span>
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-800">
                            {b.quantityAvailable} {b.unit}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{b.expiryDate}</td>
                          <td className="py-2 px-3 text-center">
                            <span className="inline-block px-2 py-0.5 bg-orange-100 text-orange-800 font-extrabold text-[10px] rounded-full">
                              {b.daysLeft} days left
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              onClick={() => {
                                setSearchBatch(b.batchNumber);
                                setSubView('traceability');
                                handleTraceSearch();
                              }}
                              className="text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded transition"
                            >
                              Trace Batch ➔
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {radar.critical30.map((b) => (
                    <div key={b._id} className="p-3 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-900">{b.batchNumber}</span>
                        <span className="px-2 py-0.5 bg-orange-100 text-orange-800 font-extrabold text-[10px] rounded-full">
                          {b.daysLeft}d left
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800">{b.medicineName}</div>
                      <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
                        <span>Stock: <strong className="text-slate-800">{b.quantityAvailable} {b.unit}</strong></span>
                        <button
                          onClick={() => {
                            setSearchBatch(b.batchNumber);
                            setSubView('traceability');
                            handleTraceSearch();
                          }}
                          className="text-[10px] font-bold text-emerald-700 underline"
                        >
                          Trace ➔
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 5. SUB-VIEW: Low Stock & Reorder Alerts */}
      {subView === 'alerts' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="bg-amber-50 px-3.5 py-3 border-b border-amber-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-amber-950 flex items-center gap-1.5">
                <span>🚨</span> Low Stock & Reorder Threshold Trigger ({lowStock.length})
              </h2>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Medicines where farm stock has fallen to or below the configured reorder level
              </p>
            </div>
            {lowStock.length > 0 && (
              <button
                type="button"
                onClick={() => handleOpenWhatsApp('alerts')}
                className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
              >
                <span>💬</span> Share Reorder Alerts
              </button>
            )}
          </div>

          {loadingStats ? (
            <div className="p-6 text-center text-slate-400 text-xs">Evaluating stock levels...</div>
          ) : lowStock.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs">
              All medicines are well above reorder levels. No stockout risk detected!
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Medicine Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3 text-right">Current Stock</th>
                      <th className="py-2.5 px-3 text-right">Reorder Level</th>
                      <th className="py-2.5 px-3 text-right">Deficit</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lowStock.map((m) => {
                      const deficit = Math.max(0, (m.reorderLevel || m.minimumStock || 0) - m.currentStock);
                      return (
                        <tr key={m._id} className="hover:bg-slate-50/75 transition">
                          <td className="py-2 px-3 font-bold text-slate-900">{m.code}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">{m.name}</td>
                          <td className="py-2 px-3 text-slate-500 text-[11px]">{m.category}</td>
                          <td className="py-2 px-3 text-right font-black text-rose-700">
                            {m.currentStock} {m.unit}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600 font-semibold">
                            {m.reorderLevel || m.minimumStock} {m.unit}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-amber-700">
                            +{deficit} {m.unit} needed
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.status === 'OUT_OF_STOCK'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : 'bg-amber-100 text-amber-800 border border-amber-300'
                              }`}
                            >
                              {m.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="sm:hidden divide-y divide-slate-100">
                {lowStock.map((m) => (
                  <div key={m._id} className="p-3 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-slate-900">{m.name}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          m.status === 'OUT_OF_STOCK'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">{m.code} • {m.category}</div>
                    <div className="flex justify-between items-center text-xs pt-1">
                      <span>Available: <strong className="text-rose-700">{m.currentStock} {m.unit}</strong></span>
                      <span className="text-slate-500">Reorder at: {m.reorderLevel || m.minimumStock}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 6. SUB-VIEW: Reverse Batch Traceability */}
      {subView === 'traceability' && (
        <div className="space-y-4">
          {/* Search Box */}
          <div className="bg-white p-3.5 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <span>🔍</span> Reverse Batch Investigation Engine
            </h2>
            <p className="text-xs text-slate-500">
              Enter any batch number to generate an end-to-end chronological timeline: Supplier ➔ PO ➔ GRN ➔ Store Verification ➔ Shed Consumption ➔ Remaining Stock.
            </p>

            <form onSubmit={handleTraceSearch} className="flex gap-2 pt-2">
              <input
                type="text"
                value={searchBatch}
                onChange={(e) => setSearchBatch(e.target.value)}
                placeholder="e.g. BATCH-2026-001 or AMX-101..."
                className="flex-1 h-9 px-3 border border-slate-300 rounded-lg text-xs font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none uppercase"
              />
              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                className="h-9 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition flex items-center gap-1.5 shrink-0"
                title="Scan Barcode / Label with Camera"
              >
                <span>📷</span> Scan
              </button>
              <button
                type="submit"
                disabled={loadingTrace || !searchBatch.trim()}
                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center gap-1.5 shrink-0"
              >
                {loadingTrace ? 'Searching...' : 'Trace Batch'}
              </button>
            </form>
          </div>

          {traceError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
              ⚠ {traceError}
            </div>
          )}

          {/* Trace Results */}
          {traceData && (
            <div className="space-y-4">
              {/* Batch Summary Header */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Batch Number</span>
                  <div className="text-sm font-black text-slate-900 mt-0.5">{traceData.batch?.batchNumber}</div>
                  <div className="text-[11px] text-slate-500">{traceData.batch?.medicine?.name}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Supplier</span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{traceData.batch?.supplier?.name || 'Direct'}</div>
                  <div className="text-[11px] text-slate-500">{traceData.batch?.supplier?.mobile || '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Received / Available</span>
                  <div className="text-sm font-black text-emerald-700 mt-0.5">
                    {traceData.batch?.quantityAvailable} / {traceData.batch?.quantityReceived} {traceData.batch?.medicine?.unit}
                  </div>
                  <div className="text-[11px] text-slate-500">Total Issued: {traceData.batch?.totalIssued || 0}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Expiry Status</span>
                  <div className="text-sm font-bold text-slate-900 mt-0.5">{traceData.batch?.expiryDate}</div>
                  <div className="text-[11px] text-slate-500">MFG: {traceData.batch?.mfgDate || '—'}</div>
                </div>
              </div>

              {/* Shed Consumption Breakdown */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Shed & Flock Consumption Distribution
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(traceData.batch?.shedBreakdown || {}).map(([shed, qty]) => (
                    <div key={shed} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <span className="font-semibold text-slate-700">{shed}:</span>{' '}
                      <strong className="text-emerald-700 font-extrabold">{qty} {traceData.batch?.medicine?.unit}</strong>
                    </div>
                  ))}
                  {Object.keys(traceData.batch?.shedBreakdown || {}).length === 0 && (
                    <div className="text-xs text-slate-400">No shed issues recorded yet. Batch is intact in store.</div>
                  )}
                </div>
              </div>

              {/* Chronological Milestone Timeline */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Chronological Movement Timeline
                </span>

                <div className="space-y-2.5">
                  {/* Step 1: Receipt */}
                  {traceData.timeline?.receipt && (
                    <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg text-xs flex justify-between items-start">
                      <div>
                        <div className="font-bold text-blue-900 flex items-center gap-1.5">
                          <span>📥</span> GRN Receipt & Store Acceptance
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          GRN #{traceData.timeline.receipt.receiptNumber} • Invoice #{traceData.timeline.receipt.invoiceNumber || '—'} • Challan #{traceData.timeline.receipt.challanNumber || '—'}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-slate-500 font-medium">
                        {traceData.timeline.receipt.receiptDate}
                      </div>
                    </div>
                  )}

                  {/* Step 2: Consumption Issues */}
                  {(traceData.timeline?.issues || []).map((iss) => (
                    <div key={iss._id} className="p-3 bg-purple-50/60 border border-purple-200 rounded-lg text-xs flex justify-between items-start">
                      <div>
                        <div className="font-bold text-purple-900 flex items-center gap-1.5">
                          <span>💉</span> Issued to {iss.shed || 'Shed'} (Flock: {iss.flockNumber || '—'})
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          Quantity: <strong className="text-purple-800">{iss.quantity} {traceData.batch?.medicine?.unit}</strong> • Birds: {iss.birdCount || '—'} ({iss.birdAgeDays || '—'}d old)
                        </div>
                        {iss.dosageInstructions && (
                          <div className="text-[10px] text-slate-400 mt-0.5">Dosage: {iss.dosageInstructions}</div>
                        )}
                      </div>
                      <div className="text-right text-[11px] text-slate-500 font-medium">
                        {iss.issueDate}
                        <div className="text-[10px] text-slate-400">By {iss.issuedBy?.name || 'Staff'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 7. SUB-VIEW: Stock Movement Audit Ledger */}
      {subView === 'ledger' && (
        <div className="space-y-3">
          {/* Ledger Filters */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap gap-2 items-center flex-1">
              {/* Medicine Filter */}
              <select
                value={ledgerFilters.medicine}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, medicine: e.target.value }))}
                className="h-8 px-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none"
              >
                <option value="">All Medicines</option>
                {medicines.map((m) => (
                  <option key={m._id} value={m._id}>{m.name} ({m.code})</option>
                ))}
              </select>

              {/* Transaction Type Filter */}
              <select
                value={ledgerFilters.transactionType}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, transactionType: e.target.value }))}
                className="h-8 px-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none"
              >
                <option value="">All Movement Types</option>
                <option value="RECEIPT">RECEIPT (GRN)</option>
                <option value="ISSUE">ISSUE (Consumption)</option>
                <option value="RETURN">RETURN (Shed Return)</option>
                <option value="ADJUSTMENT_IN">ADJUSTMENT_IN (Audit Surplus)</option>
                <option value="ADJUSTMENT_OUT">ADJUSTMENT_OUT (Audit Shortage)</option>
                <option value="DISPOSAL_EXPIRED">DISPOSAL_EXPIRED (Write-off)</option>
              </select>
            </div>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCsv}
              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition shadow-2xs flex items-center gap-1.5"
            >
              <span>📥</span> Export CSV
            </button>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {loadingLedger ? (
              <div className="p-6 text-center text-slate-400 text-xs">Loading stock ledger transactions...</div>
            ) : ledgerTransactions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No ledger transactions match the selected filters.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Date & Time</th>
                        <th className="py-2.5 px-3">Medicine</th>
                        <th className="py-2.5 px-3">Batch #</th>
                        <th className="py-2.5 px-3 text-center">Type</th>
                        <th className="py-2.5 px-3 text-right">Qty</th>
                        <th className="py-2.5 px-3 text-right">Balance After</th>
                        <th className="py-2.5 px-3">Performed By</th>
                        <th className="py-2.5 px-3">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ledgerTransactions.map((tx) => (
                        <tr key={tx._id} className="hover:bg-slate-50/75 transition">
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800">
                            {tx.medicine?.name || '—'} <span className="text-slate-400 font-normal">({tx.medicine?.code})</span>
                          </td>
                          <td className="py-2 px-3 font-bold text-slate-900">{tx.batch?.batchNumber || '—'}</td>
                          <td className="py-2 px-3 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                tx.transactionType === 'RECEIPT' || tx.transactionType === 'RETURN' || tx.transactionType === 'ADJUSTMENT_IN'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {tx.transactionType}
                            </span>
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-extrabold ${
                              tx.transactionType === 'RECEIPT' || tx.transactionType === 'RETURN' || tx.transactionType === 'ADJUSTMENT_IN'
                                ? 'text-emerald-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {tx.transactionType === 'RECEIPT' || tx.transactionType === 'RETURN' || tx.transactionType === 'ADJUSTMENT_IN'
                              ? `+${tx.quantity}`
                              : `-${tx.quantity}`}{' '}
                            {tx.medicine?.unit || ''}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">
                            {tx.balanceAfter} {tx.medicine?.unit || ''}
                          </td>
                          <td className="py-2 px-3 text-slate-600">{tx.performedBy?.name || 'System'}</td>
                          <td className="py-2 px-3 text-slate-400 max-w-[200px] truncate" title={tx.remarks}>
                            {tx.remarks || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {ledgerTransactions.map((tx) => (
                    <div key={tx._id} className="p-3 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-900">{tx.batch?.batchNumber || '—'}</span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            tx.transactionType === 'RECEIPT' || tx.transactionType === 'RETURN' || tx.transactionType === 'ADJUSTMENT_IN'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {tx.transactionType}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800">{tx.medicine?.name}</div>
                      <div className="flex justify-between items-center text-xs pt-1">
                        <span
                          className={`font-black ${
                            tx.transactionType === 'RECEIPT' || tx.transactionType === 'RETURN' || tx.transactionType === 'ADJUSTMENT_IN'
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {tx.transactionType === 'RECEIPT' || tx.transactionType === 'RETURN' || tx.transactionType === 'ADJUSTMENT_IN'
                            ? `+${tx.quantity}`
                            : `-${tx.quantity}`}{' '}
                          {tx.medicine?.unit || ''}
                        </span>
                        <span className="text-[11px] text-slate-500">Balance: <strong>{tx.balanceAfter}</strong></span>
                      </div>
                      <div className="text-[10px] text-slate-400 pt-0.5">
                        {new Date(tx.createdAt).toLocaleDateString('en-IN')} by {tx.performedBy?.name || 'Staff'}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {ledgerPages > 1 && (
                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
                    <span className="text-slate-500">
                      Page {ledgerPage} of {ledgerPages} ({ledgerTotal} total)
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => loadLedger(ledgerPage - 1)}
                        disabled={ledgerPage <= 1}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => loadLedger(ledgerPage + 1)}
                        disabled={ledgerPage >= ledgerPages}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded text-slate-700 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* 8. SUB-VIEW: Flock Treatment Costing & Cost Per Bird */}
      {subView === 'flockCosting' && (
        <div className="space-y-4">
          {/* Costing Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Flocks Tracked</span>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                {loadingCosting ? '—' : flockCostingData?.overall?.totalFlocks || 0}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Active bird populations</div>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Birds Treated</span>
              <div className="text-xl sm:text-2xl font-black text-blue-900 mt-1">
                {loadingCosting ? '—' : (flockCostingData?.overall?.grandTotalBirds || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Across all flock cycles</div>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Medicine Cost</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-800 mt-1">
                ₹{loadingCosting ? '—' : (flockCostingData?.overall?.grandTotalCost || 0).toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Cumulative farm spend</div>
            </div>

            <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-2xs bg-gradient-to-br from-emerald-50/50 to-teal-50/50">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Avg Cost / Bird</span>
              <div className="text-xl sm:text-2xl font-black text-emerald-900 mt-1">
                ₹{loadingCosting ? '—' : flockCostingData?.overall?.overallCostPerBird || 0}
              </div>
              <div className="text-[10px] text-emerald-700 mt-0.5 font-semibold">Per bird treatment average</div>
            </div>
          </div>

          {/* Flock Details Table & Cards */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <span>💰</span> Flock-by-Flock Treatment Expenditure & Cost per Bird
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Detailed health investment analysis per flock lifecycle
                </p>
              </div>
              {flockCostingData && (
                <button
                  type="button"
                  onClick={() => handleOpenWhatsApp('flockCosting')}
                  className="h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                >
                  <span>💬</span> Share Costing
                </button>
              )}
            </div>

            {loadingCosting ? (
              <div className="p-6 text-center text-slate-400 text-xs">Computing flock cost metrics...</div>
            ) : (flockCostingData?.flocks || []).length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                No flock consumption records found for the selected farm.
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Flock #</th>
                        <th className="py-2.5 px-3">Farm & Shed</th>
                        <th className="py-2.5 px-3 text-right">Birds Count</th>
                        <th className="py-2.5 px-3 text-center">Avg Bird Age</th>
                        <th className="py-2.5 px-3">Medicines Administered</th>
                        <th className="py-2.5 px-3 text-right">Total Cost (₹)</th>
                        <th className="py-2.5 px-3 text-right">Cost / Bird</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {flockCostingData.flocks.map((f, i) => (
                        <tr key={i} className="hover:bg-slate-50/75 transition">
                          <td className="py-2 px-3 font-bold text-slate-900">{f.flockNumber}</td>
                          <td className="py-2 px-3 text-slate-600">
                            <span className="font-semibold text-slate-800">{f.farmName}</span> • {f.shed}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-800">
                            {f.birdCount > 0 ? f.birdCount.toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="py-2 px-3 text-center font-medium text-slate-600">
                            {f.averageAgeDays > 0 ? `${f.averageAgeDays} days` : '—'}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1 max-w-[280px]">
                              {f.medicinesList.map((m, mi) => (
                                <span key={mi} className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-[10px] font-semibold text-slate-700">
                                  {m.name}: {m.quantity} {m.unit}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-extrabold text-slate-900">
                            ₹{f.totalEstimatedCost.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-800 font-black text-xs rounded-lg">
                              ₹{f.costPerBird} / bird
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {flockCostingData.flocks.map((f, i) => (
                    <div key={i} className="p-3.5 space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-xs text-slate-900">{f.flockNumber}</span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-black text-xs rounded-lg">
                          ₹{f.costPerBird} / bird
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium">{f.farmName} • {f.shed}</div>
                      <div className="flex justify-between items-center text-xs pt-1">
                        <span>Birds: <strong className="text-slate-800">{f.birdCount > 0 ? f.birdCount.toLocaleString() : '—'}</strong></span>
                        <span>Total: <strong className="text-emerald-800">₹{f.totalEstimatedCost.toLocaleString('en-IN')}</strong></span>
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {f.medicinesList.map((m, mi) => (
                          <span key={mi} className="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[9px] font-semibold">
                            {m.name}: {m.quantity} {m.unit}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Barcode / QR Scanner Modal */}
      <MedicineBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onDetected={(scanned) => {
          if (scanned.batchNumber) {
            setSearchBatch(scanned.batchNumber);
          }
        }}
      />

      {/* WhatsApp Share Modal */}
      {isWhatsAppModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            {/* Modal Header */}
            <div className="bg-emerald-600 text-white px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💬</span>
                <div>
                  <h3 className="font-bold text-sm">Share Report on WhatsApp</h3>
                  <p className="text-[10px] text-emerald-100">Send formatted farm updates & alerts instantly</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWhatsAppModalOpen(false)}
                className="text-white/80 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-emerald-700/50 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3.5">
              {/* Quick Format Switcher */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1.5">
                  Select Report Format:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'summary', label: '📋 Summary' },
                    { id: 'radar', label: '⏳ Expiry Radar' },
                    { id: 'alerts', label: '🚨 Reorders' },
                    { id: 'flockCosting', label: '💰 Costing & ROI' },
                  ].map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setWhatsAppText(generateWhatsAppReport(fmt.id))}
                      className="px-2 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 text-slate-700 hover:text-emerald-800 transition text-center cursor-pointer"
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient Phone (Optional) */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide block mb-1">
                  Recipient Phone Number (Optional):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    +91
                  </span>
                  <input
                    type="tel"
                    placeholder="Enter 10-digit number or leave blank to choose in WhatsApp"
                    value={whatsAppPhone}
                    onChange={(e) => setWhatsAppPhone(e.target.value)}
                    maxLength={10}
                    className="w-full pl-11 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-slate-50 focus:bg-white"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Leave blank to pick any contact or farm group inside WhatsApp.
                </p>
              </div>

              {/* WhatsApp Chat Speech Bubble Preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    Message Preview:
                  </label>
                  <button
                    type="button"
                    onClick={handleCopyWhatsApp}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? '✓ Copied!' : '📋 Copy Text'}
                  </button>
                </div>
                <div className="relative bg-[#efeae2] p-3 rounded-xl border border-slate-300">
                  <div className="bg-[#e7ffdb] rounded-lg p-2.5 shadow-2xs border border-emerald-200 max-h-52 overflow-y-auto font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
                    {whatsAppText}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCopyWhatsApp}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{copied ? '✓' : '📋'}</span>
                {copied ? 'Copied to Clipboard' : 'Copy Text'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWhatsAppModalOpen(false)}
                  className="px-3 py-2 text-slate-500 hover:text-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🚀</span> Open in WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
