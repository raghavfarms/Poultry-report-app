import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { bulkImportMedicinesApi } from '../api/medicineApi.js';

export default function MedicineExcelImportModal({
  isOpen,
  onClose,
  existingMedicines = [],
  onSuccess,
}) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [filterView, setFilterView] = useState('ALL'); // 'ALL' | 'VALID' | 'DUPLICATE' | 'INVALID'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);

  if (!isOpen) return null;

  // Build a lookup set of existing medicine names (case-insensitive & trimmed)
  const existingSet = new Set(
    (existingMedicines || [])
      .map((m) => (m.name || '').trim().toLowerCase())
      .filter(Boolean)
  );

  // 1. Download sample Excel template (.xlsx)
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Medicine Name': 'Paracetamol Vet',
        'Category': 'General',
        'Packaging': 'Bottle',
        'Pack Size': 1,
        'Unit': 'Litre (L)',
        'Alias Name': 'Dolo Vet',
        'Stock Available': 10,
        'Batch No': 'BATCH-01',
        'Expiry': '2027-12-31',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 24 }, // Medicine Name
      { wch: 16 }, // Category
      { wch: 14 }, // Packaging
      { wch: 12 }, // Pack Size
      { wch: 16 }, // Unit
      { wch: 14 }, // Alias Name
      { wch: 16 }, // Stock Available
      { wch: 14 }, // Batch No
      { wch: 14 }, // Expiry
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Medicines');
    XLSX.writeFile(wb, 'Medicine_Import_Template.xlsx');
  };

  // Helper to normalize keys across messy header spelling
  const getFieldValue = (row, candidates, fallback = '') => {
    const keys = Object.keys(row);
    for (const cand of candidates) {
      const match = keys.find((k) => k.trim().toLowerCase() === cand.toLowerCase());
      if (match && row[match] !== undefined && row[match] !== '') {
        return row[match];
      }
    }
    return fallback;
  };

  // 2. Parse uploaded Excel file
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setError('');
    setImportResult(null);
    setFileName(selectedFile.name);
    setFile(selectedFile);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (!rawJson || rawJson.length === 0) {
        setError('The selected file has no data rows. Please use the sample template.');
        setParsedRows([]);
        return;
      }

      const inBatchSeen = new Set();
      const processed = rawJson.map((row, idx) => {
        const name = String(getFieldValue(row, ['Medicine Name', 'Medicine', 'Name', 'Item Name', 'Item'])).trim();
        const normName = name.toLowerCase();

        const category = String(getFieldValue(row, ['Category', 'Category Name', 'Cat', 'Group'], 'General')).trim() || 'General';
        const packaging = String(getFieldValue(row, ['Packaging', 'Packaging Type', 'Packaging Container', 'Container'], 'Bottle')).trim() || 'Bottle';
        const packSizeRaw = Number(getFieldValue(row, ['Pack Size', 'PackSize', 'Pack_Size', 'Size', 'Qty/Pack'], 1));
        const packSize = Number.isFinite(packSizeRaw) && packSizeRaw > 0 ? packSizeRaw : 1;
        const unit = String(getFieldValue(row, ['Unit', 'Unit of Measurement', 'Unit (Measure)', 'Measure'], 'Nos')).trim() || 'Nos';
        const aliasName = String(getFieldValue(row, ['Alias Name', 'Alias', 'Brand Alias'], '')).trim();

        // Stock available, batch number, expiry date (for unified template compatibility)
        const stockAvailable = Number(getFieldValue(row, ['Stock Available', 'Stock', 'Available Stock', 'Qty', 'Quantity'], 0)) || 0;
        const batchNo = String(getFieldValue(row, ['Batch No', 'Batch', 'Batch Number', 'BatchNo'], '')).trim();

        const expiryRaw = getFieldValue(row, ['Expiry', 'Expiry Date', 'Exp Date', 'Exp'], '');
        let expiry = '';
        if (typeof expiryRaw === 'number') {
          try {
            const dateObj = XLSX.SSF.parse_date_code(expiryRaw);
            if (dateObj) {
              const y = String(dateObj.y).padStart(4, '0');
              const m = String(dateObj.m).padStart(2, '0');
              const d = String(dateObj.d).padStart(2, '0');
              expiry = `${y}-${m}-${d}`;
            }
          } catch {
            expiry = String(expiryRaw);
          }
        } else if (expiryRaw instanceof Date) {
          expiry = expiryRaw.toISOString().split('T')[0];
        } else {
          expiry = String(expiryRaw || '').trim();
        }

        let status = 'VALID'; // 'VALID' | 'DUPLICATE' | 'INVALID'
        let reason = 'Ready to add';

        if (!name) {
          status = 'INVALID';
          reason = 'Missing medicine name';
        } else if (existingSet.has(normName)) {
          status = 'DUPLICATE';
          reason = 'Already exists in catalog';
        } else if (inBatchSeen.has(normName)) {
          status = 'DUPLICATE';
          reason = 'Duplicate in this sheet';
        } else {
          inBatchSeen.add(normName);
        }

        return {
          rowNumber: idx + 2, // Excel 1-based header is row 1
          name,
          category,
          packagingType: packaging,
          packSize,
          unit,
          aliasName,
          stockAvailable,
          batchNo,
          expiry,
          status,
          reason,
        };
      });

      setParsedRows(processed);
    } catch (err) {
      console.error('Failed to read Excel file:', err);
      setError('Failed to parse Excel file. Please ensure it is a valid .xlsx, .xls, or .csv file.');
      setParsedRows([]);
    }
  };

  const validRows = parsedRows.filter((r) => r.status === 'VALID');
  const duplicateRows = parsedRows.filter((r) => r.status === 'DUPLICATE');
  const invalidRows = parsedRows.filter((r) => r.status === 'INVALID');

  const displayedRows = parsedRows.filter((r) => {
    if (filterView === 'VALID') return r.status === 'VALID';
    if (filterView === 'DUPLICATE') return r.status === 'DUPLICATE';
    if (filterView === 'INVALID') return r.status === 'INVALID';
    return true;
  });

  // 3. Submit bulk import to backend
  const handleImportSubmit = async () => {
    if (validRows.length === 0) return;

    try {
      setLoading(true);
      setError('');
      // Only register master catalog fields (Stock is farm-specific and applied on Stock tab)
      const payload = validRows.map((r) => ({
        name: r.name,
        category: r.category,
        packagingType: r.packagingType,
        packSize: r.packSize,
        unit: r.unit,
        aliasName: r.aliasName,
      }));

      const res = await bulkImportMedicinesApi(payload);
      setImportResult(res);
      if (onSuccess) {
        onSuccess(res);
      }
    } catch (err) {
      setError(err.message || 'Failed to import medicines');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto cursor-pointer"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[490px] max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 py-3 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <h2 className="text-sm sm:text-base font-bold">Bulk Upload Medicines via Excel</h2>
              <p className="text-[11px] text-emerald-100">
                Upload a spreadsheet to register multiple medicines in 1-click
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3 flex-1 text-slate-800">
          {/* Top Actions: Template Download & File Picker */}
          <div className="flex flex-col gap-2.5 bg-slate-50 p-2.5 sm:p-3 rounded-xl border border-slate-200">
            {/* Step 1: Download Template */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-slate-200">
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[11px] font-black shrink-0">
                    1
                  </span>
                  <span className="truncate">Download Official Format</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  Ready template with correct columns
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="shrink-0 py-1.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>📥</span>
                <span>Template (.xlsx)</span>
              </button>
            </div>

            {/* Step 2: Upload File */}
            <div className="flex items-center justify-between gap-2 p-2.5 bg-white rounded-lg border border-slate-200">
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                  <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[11px] font-black shrink-0">
                    2
                  </span>
                  <span className="truncate">Select Filled Spreadsheet</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  Supports .xlsx, .xls, .csv
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                >
                  <span>📂</span>
                  <span>{fileName ? 'Change' : 'Browse File'}</span>
                </button>
                {fileName && (
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setFileName('');
                      setParsedRows([]);
                      setError('');
                      setImportResult(null);
                    }}
                    className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg font-bold"
                    title="Remove file"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {fileName && (
              <div className="text-[11px] font-mono font-bold text-slate-600 truncate px-1">
                📄 {fileName}
              </div>
            )}

            <div className="text-[11px] text-slate-500 bg-amber-50/70 border border-amber-200/60 rounded-lg p-2 flex items-start gap-1.5">
              <span className="shrink-0 text-amber-600 text-xs">💡</span>
              <span className="leading-tight">
                <strong>Master Catalog:</strong> Registers medicine definitions. Stock, Batch No & Expiry will apply to farm on the Stock tab.
              </span>
            </div>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Success Result Banner */}
          {importResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-xl space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <span>🎉</span>
                <span>{importResult.message}</span>
              </div>
              <div className="text-xs text-emerald-800 flex flex-wrap gap-4 pt-1">
                <span>✅ Added: <strong>{importResult.createdCount}</strong></span>
                {importResult.skippedCount > 0 && (
                  <span>⚠️ Skipped Duplicates: <strong>{importResult.skippedCount}</strong></span>
                )}
                {importResult.errorCount > 0 && (
                  <span>❌ Errors: <strong>{importResult.errorCount}</strong></span>
                )}
              </div>
            </div>
          )}

          {/* Preview Section */}
          {parsedRows.length > 0 && !importResult && (
            <div className="space-y-2">
              {/* Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-700">Preview:</span>
                  <button
                    type="button"
                    onClick={() => setFilterView('ALL')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer border ${
                      filterView === 'ALL'
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    All ({parsedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterView('VALID')}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer border ${
                      filterView === 'VALID'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    Ready to Add ({validRows.length})
                  </button>
                  {duplicateRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterView('DUPLICATE')}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer border ${
                        filterView === 'DUPLICATE'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                      }`}
                    >
                      Duplicates ({duplicateRows.length})
                    </button>
                  )}
                  {invalidRows.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterView('INVALID')}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer border ${
                        filterView === 'INVALID'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-rose-700 border-rose-300 hover:bg-rose-50'
                      }`}
                    >
                      Invalid ({invalidRows.length})
                    </button>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 font-medium">
                  Showing {displayedRows.length} of {parsedRows.length} rows
                </div>
              </div>

              {/* Table */}
              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[620px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-2 text-center w-10">#</th>
                      <th className="py-2 px-2">Medicine Name</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2">Packaging</th>
                      <th className="py-2 px-2">Pack Size</th>
                      <th className="py-2 px-2">Unit</th>
                      <th className="py-2 px-2 text-right">Stock</th>
                      <th className="py-2 px-2">Batch No</th>
                      <th className="py-2 px-2">Expiry</th>
                      <th className="py-2 px-2 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayedRows.map((r, idx) => {
                      const isDup = r.status === 'DUPLICATE';
                      const isInv = r.status === 'INVALID';
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 transition ${
                            isDup ? 'bg-amber-50/40 text-slate-600' : isInv ? 'bg-rose-50/40' : ''
                          }`}
                        >
                          <td className="py-1.5 px-2 text-center font-mono text-[11px] text-slate-400">
                            {r.rowNumber}
                          </td>
                          <td className="py-1.5 px-2 font-bold text-slate-900">
                            {r.name || <span className="text-rose-500 italic">Empty</span>}
                            {r.aliasName && (
                              <span className="text-[10px] text-slate-500 font-normal ml-1">
                                ({r.aliasName})
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {r.category}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-slate-600">{r.packagingType}</td>
                          <td className="py-1.5 px-2 font-mono text-slate-700">{r.packSize}</td>
                          <td className="py-1.5 px-2 text-slate-700 font-medium">{r.unit}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-slate-700">
                            {r.stockAvailable || 0}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600">
                            {r.batchNo || '-'}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-[11px] text-slate-600">
                            {r.expiry || '-'}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {r.status === 'VALID' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ✓ Ready
                              </span>
                            ) : isDup ? (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"
                                title={r.reason}
                              >
                                ⚠️ Duplicate
                              </span>
                            ) : (
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800"
                                title={r.reason}
                              >
                                ✕ Invalid
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-500">
            {validRows.length > 0 && !importResult && (
              <span>
                <strong>{validRows.length}</strong> new medicine(s) ready to import
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              {importResult ? 'Close' : 'Cancel'}
            </button>

            {!importResult && (
              <button
                type="button"
                disabled={loading || validRows.length === 0}
                onClick={handleImportSubmit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="animate-spin text-sm">⏳</span>
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Import {validRows.length} Medicines</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
