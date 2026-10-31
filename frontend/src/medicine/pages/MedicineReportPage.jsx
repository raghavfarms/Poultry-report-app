import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { exportReportToPdf } from '../../utils/exportPdf.js';
import { formatStockDisplay, formatUnit, getPackagingPlural, formatPackAndLoose } from '../utils/packagingHelper.js';
import { fetchDashboardStats, fetchBatchTraceability, updateBatchApi, deleteBatchApi } from '../api/reportApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import DailyMedicineActionPage from './DailyMedicineActionPage.jsx';
import MedicineConsumptionRegister from '../components/MedicineConsumptionRegister.jsx';
import MedicineStockRegister from '../components/MedicineStockRegister.jsx';
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
  const navigate = useNavigate();
  const { user } = useAuth();

  // Active Tab: 1. Daily In/Out (Default) | 2. Current Stock | 3. Consumption Register | 4. Traceability
  const isAdminUser = ['admin', 'developer'].includes(user?.role);
  const [activeTab, setActiveTab] = useState(() => (isAdminUser ? 'register' : 'daily'));
  const initialTabSetRef = useRef(false);

  useEffect(() => {
    if (!initialTabSetRef.current && user?.role) {
      initialTabSetRef.current = true;
      if (['admin', 'developer'].includes(user.role)) {
        setActiveTab('register');
      }
    }
  }, [user?.role]);

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
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const stockTableRef = useRef(null);
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
    const pSize = Number(batch.packSize) || Number(batch.medicine?.packSize) || 1;
    if (pSize > 0 && qty !== '' && !isNaN(qty)) {
      setEditPacks(Number((Number(qty) / pSize).toFixed(3)));
    } else {
      setEditPacks('');
    }
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

  // Export Current Live Stock to Excel (.xlsx)
  const handleExportExcel = async () => {
    if (exportingExcel || filteredMedicines.length === 0) return;
    try {
      setExportingExcel(true);

      const excelRows = [];
      let sNo = 1;

      filteredMedicines.forEach((m) => {
        const packaging = formatPackAndLoose(m.totalStock, m.packSize, m.packagingType, m.unit);
        const packagingStr = packaging.excelStr;

        const batchNumbers = m.batches.map((b) => b.batchNumber).join(', ');
        const earliestExpiry = formatExpiryDDMMYYYY(m.earliestBatch?.expiryDate);
        const daysLeft = m.earliestBatch?.daysLeft;
        let shelfStatusText = 'Safe';
        if (m.urgency === 'EXPIRED') shelfStatusText = `Expired (${Math.abs(daysLeft ?? 0)}d ago)`;
        else if (['CRITICAL', 'CAUTION', 'WARNING'].includes(m.urgency)) shelfStatusText = `Soon (${daysLeft ?? 0}d left)`;
        else if (daysLeft !== null && daysLeft !== undefined) shelfStatusText = `Safe (${daysLeft}d left)`;

        excelRows.push({
          'S.No': sNo++,
          'Medicine Name': m.medicineName || 'Medicine',
          'Alias': m.medicineAlias || '—',
          'Code': m.medicineCode || '—',
          'Farm': m.farm?.name || firms.find((f) => f._id === selectedFarm)?.name || 'Raghav',
          'Packaging': packagingStr,
          'Total In Stock': m.totalStock,
          'Unit': formatUnit(m.unit),
          'Batch Count': m.batches.length,
          'Batch No(s)': batchNumbers || '—',
          'Next Expiry': earliestExpiry,
          'Days Left': daysLeft ?? '—',
          'Shelf Status': shelfStatusText,
          'Stock Status': m.isLowStock ? 'Low Stock' : 'Normal',
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      worksheet['!cols'] = [
        { wch: 6 },   // S.No
        { wch: 24 },  // Medicine Name
        { wch: 14 },  // Alias
        { wch: 12 },  // Code
        { wch: 14 },  // Farm
        { wch: 26 },  // Packaging
        { wch: 14 },  // Total Stock
        { wch: 10 },  // Unit
        { wch: 12 },  // Batch Count
        { wch: 22 },  // Batch No(s)
        { wch: 14 },  // Next Expiry
        { wch: 12 },  // Days Left
        { wch: 20 },  // Shelf Status
        { wch: 14 },  // Stock Status
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Live Stock');

      const farmObj = firms.find((f) => f._id === selectedFarm);
      const farmName = (farmObj?.name || 'All_Farms').replace(/\s+/g, '_');
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
      const filename = `Medicine_Stock_Report_${farmName}_${dateStr}.xlsx`;

      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Excel export failed:', err);
      alert('Failed to generate Excel file. Please try again.');
    } finally {
      setExportingExcel(false);
    }
  };

  // Export Current Live Stock to PDF (.pdf)
  const handleExportPdf = async () => {
    if (exportingPdf || !stockTableRef.current || filteredMedicines.length === 0) return;
    try {
      setExportingPdf(true);
      const farmObj = firms.find((f) => f._id === selectedFarm);
      const farmName = (farmObj?.name || 'All_Farms').replace(/\s+/g, '_');
      const today = new Date();
      const dateStr = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
      const filename = `Medicine_Stock_Report_${farmName}_${dateStr}.pdf`;

      await exportReportToPdf(stockTableRef.current, {
        filename,
        orientation: 'landscape',
        format: 'a4',
        margin: 6,
      });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleTraceBatch = (batch) => {
    if (!batch) return;
    navigate(`/admin/medicine/master?tab=trace&batch=${encodeURIComponent(batch.batchNumber)}`);
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

  // Load farms list (strictly Raghav and Sanjana)
  const loadFirms = async () => {
    try {
      const data = await api('/firms?module=medicine');
      const loadedFirms = (data.firms || []).filter((f) => {
        const name = (f.name || '').toLowerCase();
        return name.includes('raghav') || name.includes('sanjana');
      });
      loadedFirms.sort((a, b) => {
        if (a.name.toLowerCase().includes('raghav')) return -1;
        if (b.name.toLowerCase().includes('raghav')) return 1;
        return 0;
      });
      setFirms(loadedFirms);
      if (loadedFirms.length > 0) {
        setSelectedFarm((prev) => {
          const exists = loadedFirms.some((f) => f._id === prev);
          return exists ? prev : loadedFirms[0]._id;
        });
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
    if (firms.length > 0 && (!selectedFarm || !firms.some((f) => f._id === selectedFarm))) {
      const defaultFarm = firms.find((f) => f.name.toLowerCase().includes('raghav')) || firms[0];
      setSelectedFarm(defaultFarm._id);
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
                General Med Movement
              </h1>
            </div>
            <p className="hidden sm:block text-[10px] sm:text-[11px] text-slate-500">
              Daily fast In/Out & live stock
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

        {/* Clean 4-Column Responsive Grid on Mobile & Desktop */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100/90 rounded-xl">
          {(isAdminUser
            ? ['register', 'consumption', 'stock', 'daily']
            : ['daily', 'stock', 'consumption', 'register']
          ).map((tabKey) => {
            if (tabKey === 'register') {
              return (
                <button
                  key="register"
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[9px] sm:text-xs font-bold transition flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer text-center leading-tight ${
                    activeTab === 'register'
                      ? 'bg-emerald-600 !text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">📑</span>
                  <span className={`${activeTab === 'register' ? '!text-white' : ''}`}>
                    <span className="sm:hidden">Movement</span>
                    <span className="hidden sm:inline">Stock Movement Report</span>
                  </span>
                </button>
              );
            }
            if (tabKey === 'consumption') {
              return (
                <button
                  key="consumption"
                  type="button"
                  onClick={() => setActiveTab('consumption')}
                  className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[9px] sm:text-xs font-bold transition flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer text-center leading-tight ${
                    activeTab === 'consumption'
                      ? 'bg-emerald-600 !text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">📋</span>
                  <span className={`${activeTab === 'consumption' ? '!text-white' : ''}`}>
                    <span className="sm:hidden">Consumption</span>
                    <span className="hidden sm:inline">Consumption Report</span>
                  </span>
                </button>
              );
            }
            if (tabKey === 'stock') {
              return (
                <button
                  key="stock"
                  type="button"
                  onClick={() => setActiveTab('stock')}
                  className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[9px] sm:text-xs font-bold transition flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer text-center leading-tight relative ${
                    activeTab === 'stock'
                      ? 'bg-emerald-600 !text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">📦</span>
                  <span className={`${activeTab === 'stock' ? '!text-white' : ''}`}>
                    <span className="sm:hidden">Stock</span>
                    <span className="hidden sm:inline">Stock Report</span>
                  </span>
                  {(radar.expiredCount || 0) > 0 && (
                    <span className="px-1 py-0.2 bg-rose-500 !text-white rounded-full text-[8px] sm:text-[9px] font-black leading-tight sm:ml-1">
                      {radar.expiredCount}
                    </span>
                  )}
                </button>
              );
            }
            if (tabKey === 'daily') {
              return (
                <button
                  key="daily"
                  type="button"
                  onClick={() => setActiveTab('daily')}
                  className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-lg text-[9px] sm:text-xs font-bold transition flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer text-center leading-tight ${
                    activeTab === 'daily'
                      ? 'bg-emerald-600 !text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  <span className="text-xs sm:text-sm">⚡</span>
                  <span className={`${activeTab === 'daily' ? '!text-white' : ''}`}>
                    <span className="sm:hidden">IN / OUT</span>
                    <span className="hidden sm:inline">Medicine IN/OUT</span>
                  </span>
                </button>
              );
            }
            return null;
          })}
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

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={exportingExcel || filteredMedicines.length === 0}
                  onClick={handleExportExcel}
                  className="text-[10px] sm:text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition cursor-pointer inline-flex items-center gap-1 shadow-2xs disabled:opacity-50 whitespace-nowrap"
                  title="Download Excel Sheet (.xlsx)"
                >
                  <span>📊</span>
                  <span>{exportingExcel ? 'Exporting...' : 'Excel'}</span>
                </button>

                <button
                  type="button"
                  disabled={exportingPdf || filteredMedicines.length === 0}
                  onClick={handleExportPdf}
                  className="text-[10px] sm:text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-300 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg transition cursor-pointer inline-flex items-center gap-1 shadow-2xs disabled:opacity-50 whitespace-nowrap"
                  title="Download PDF Document (.pdf)"
                >
                  <span>📄</span>
                  <span>{exportingPdf ? 'Exporting...' : 'PDF'}</span>
                </button>
              </div>
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
          <div ref={stockTableRef} className="report-export-content bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Header visible in PDF export */}
            <div className="hidden pdf-print-header p-3 bg-slate-50 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    Medicine Live Stock Report — {firms.find((f) => f._id === selectedFarm)?.name || 'Raghav'}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Total: {filteredMedicines.length} medicines | Generated on: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>
            </div>
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
                      {/* 7. Actions (Admin & Developer Only) */}
                      {canAccessTraceAndAction && (
                        <th className="sticky top-0 z-30 bg-slate-100 py-2.5 px-3 text-center min-w-[65px] border-b border-slate-200 whitespace-nowrap">
                          Actions
                        </th>
                      )}
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

                      const isSoon = isCritical || isCaution || isWarning;

                      const rowBgClass = isExpanded
                        ? 'bg-blue-50 hover:bg-blue-100/70'
                        : isExpired
                        ? 'bg-rose-50 hover:bg-rose-100/80'
                        : isSoon
                        ? 'bg-amber-50 hover:bg-amber-100/80'
                        : 'bg-white hover:bg-slate-50';

                      const stickyCellBgClass = isExpanded
                        ? 'bg-blue-50 group-hover:bg-blue-100/70'
                        : isExpired
                        ? 'bg-rose-50 group-hover:bg-rose-100/80'
                        : isSoon
                        ? 'bg-amber-50 group-hover:bg-amber-100/80'
                        : 'bg-white group-hover:bg-slate-50';

                      return (
                        <React.Fragment key={m.key}>
                          {/* Parent Medicine Row */}
                          <tr
                            onClick={() => {
                              if (isMultiBatch) toggleExpand(m.key);
                            }}
                            className={`group transition-colors select-none ${
                              isMultiBatch ? 'cursor-pointer' : ''
                            } ${rowBgClass}`}
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
                                const packaging = formatPackAndLoose(m.totalStock, m.packSize, m.packagingType, m.unit);
                                return (
                                  <div className="inline-flex flex-col items-center">
                                    <span className="font-extrabold text-[11px] text-emerald-900 bg-emerald-50 border border-emerald-200/90 px-2 py-0.2 rounded-md shadow-2xs whitespace-nowrap">
                                      {packaging.main}
                                    </span>
                                    {packaging.sub && (
                                      <span className="text-[9px] text-slate-500 font-semibold mt-0.5 whitespace-nowrap">
                                        {packaging.sub}
                                      </span>
                                    )}
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

                            {/* Column 7: Actions (Admin & Developer Only) */}
                            {canAccessTraceAndAction && (
                              <td className="no-print py-2 px-3 text-center whitespace-nowrap min-w-[65px]">
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
                            )}
                          </tr>

                          {/* Nested Accordion Drawer for Batches */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70 border-y border-blue-200/60">
                              <td colSpan={canAccessTraceAndAction ? 7 : 6} className="p-2 sm:p-3">
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
                                      {m.batches.map((b) => {
                                        const bIsSoon = b.urgency === 'CRITICAL' || b.urgency === 'CAUTION' || b.urgency === 'WARNING';
                                        const bRowBgClass = b.urgency === 'EXPIRED'
                                          ? 'bg-rose-50/70 hover:bg-rose-100/60'
                                          : bIsSoon
                                          ? 'bg-amber-50/70 hover:bg-amber-100/60'
                                          : 'hover:bg-blue-50/30';

                                        return (
                                          <tr
                                            key={b._id}
                                            className={`${bRowBgClass} transition-colors`}
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
                                      );
                                    })}
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

      {/* VIEW 3: Monthly Medicine Consumption & Shed Issue Register */}
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

      {/* VIEW 5: Daily Stock Register (Excel Format + Physical Audit) */}
      {activeTab === 'register' && (
        <MedicineStockRegister
          selectedFarm={selectedFarm}
          firms={firms}
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
                    {editPackSize > 0 && (editPackSize !== 1 || (editPackaging && editPackaging.toLowerCase() !== editUnit.toLowerCase() && !['unit', 'units', 'item', 'items'].includes(editPackaging.toLowerCase()))) ? (
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
