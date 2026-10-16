import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../../api/client.js';
import { fetchTemperatureReport } from '../api/temperatureApi.js';
import { exportReportToPdf } from '../../utils/exportPdf.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function TemperatureReportPage({ compact = false, onSwitchToEntry = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);

  // 1. Data States
  const [firms, setFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [selectedShed, setSelectedShed] = useState('All sheds');

  const [reportData, setReportData] = useState({
    rows: [],
    kpis: {
      totalReadings: 0,
      roundsDone: '0 of 12',
      avgTemp: '—',
      lowest: '—',
      lowestInfo: '',
      highest: '—',
      highestInfo: '',
      alertsCount: 0,
      missedRoundsCount: 0,
    },
  });

  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState('');

  const reportContainerRef = useRef(null);

  // Load farms on mount
  useEffect(() => {
    let isMounted = true;
    api('/firms')
      .then((data) => {
        if (!isMounted) return;
        const list = data.firms || data || [];
        setFirms(list);
        if (list.length > 0 && !selectedFirm) {
          setSelectedFirm(list[0]._id);
        }
      })
      .catch((err) => {
        console.error('Error fetching farms:', err);
        setError('Failed to load farms list');
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch report when farm, date, or shed change
  const loadReport = async () => {
    if (!selectedFirm) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchTemperatureReport(selectedFirm, selectedDate, selectedShed);
      if (res && res.success) {
        setReportData({
          rows: res.rows || [],
          kpis: res.kpis || {},
        });
      } else {
        setReportData({
          rows: [],
          kpis: {},
        });
      }
    } catch (err) {
      console.error('Error fetching temperature report:', err);
      setError('Could not load temperature report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [selectedFirm, selectedDate, selectedShed]);

  // Extract distinct sheds for filter dropdown
  const availableSheds = useMemo(() => {
    const set = new Set();
    if (reportData.rows) {
      reportData.rows.forEach((r) => {
        if (r.shed) set.add(r.shed);
      });
    }
    return ['All sheds', ...Array.from(set).sort()];
  }, [reportData.rows]);

  // Formatted date string for subtitle (e.g., "14 Oct 2026")
  const formattedDisplayDate = useMemo(() => {
    if (!selectedDate) return '';
    try {
      const parts = selectedDate.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return selectedDate;
    }
  }, [selectedDate]);

  // Farm display name
  const currentFarmName = useMemo(() => {
    const f = firms.find((item) => String(item._id) === String(selectedFirm));
    return f?.name || 'Selected Farm';
  }, [firms, selectedFirm]);

  // PDF Export
  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setExportingPdf(true);
    try {
      await exportReportToPdf(reportContainerRef.current, {
        filename: `Temperature_Report_${currentFarmName.replace(/\s+/g, '_')}_${selectedDate}.pdf`,
        orientation: 'landscape',
        format: 'a4',
      });
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setExportingPdf(false);
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    try {
      const exportRows = reportData.rows.map((row) => {
        if (row.missed) {
          return {
            Time: row.time,
            'Shed · Line': row.shedLine,
            Pad: 'No round saved for this hour',
            Mid: 'No round saved for this hour',
            Fan: 'No round saved for this hour',
            Average: '—',
            Status: 'Missed',
          };
        }
          return {
            Time: row.time,
            'Shed · Line': row.shedLine,
            Pad: row.pad !== null && row.pad !== undefined ? `${row.pad}°C` : '—',
            Mid: row.mid !== null && row.mid !== undefined ? `${row.mid}°C` : '—',
            Fan: row.fan !== null && row.fan !== undefined ? `${row.fan}°C` : '—',
            Status: 'On time',
          };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Night Rounds');
      XLSX.writeFile(
        workbook,
        `Temperature_Report_${currentFarmName.replace(/\s+/g, '_')}_${selectedDate}.xlsx`
      );
    } catch (err) {
      console.error('Excel Export Error:', err);
      alert('Failed to export Excel spreadsheet.');
    }
  };

  // Helper for temp cell styling
  const renderTempCell = (val, isVerified) => {
    if (val === null || val === undefined) {
      return <span className="text-slate-400 font-light">—</span>;
    }
    const num = Number(val);

    return (
      <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
        <span>{num.toFixed(1)}°C</span>
        {isVerified && (
          <span title="QR Verified" className="text-[10px] text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded font-bold">
            ✓
          </span>
        )}
      </span>
    );
  };

  return (
    <div className={`space-y-3 ${compact ? '' : 'max-w-7xl mx-auto pb-12'}`}>
      {/* 1. Header (Compact & shifted upwards) */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg text-emerald-800">
            🌡️
          </span>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              Temperature report
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
              Daily rounds · {formattedDisplayDate}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Filter Bar (Farm, Date, Shed) - Clean 2-column mobile grid */}
      <div className="max-w-xl">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
          {/* Farm selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              Farm
            </label>
            <select
              value={selectedFirm}
              onChange={(e) => setSelectedFirm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
            >
              {firms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Shed filter (spans 2 columns on mobile if alone, or neat fit) */}
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
              Shed
            </label>
            <select
              value={selectedShed}
              onChange={(e) => setSelectedShed(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
            >
              {availableSheds.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          ⚠️ {error}
        </div>
      )}

      {/* Printable Report Wrapper */}
      <div ref={reportContainerRef} className="space-y-3 bg-white p-2 rounded-2xl">
        {/* Cards Row: Highest Card, Lowest Card, and Stacked PDF / Excel Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Highest Card */}
          <div className="w-[125px] sm:w-[135px] rounded-xl border border-rose-100 bg-linear-to-br from-rose-50/80 to-white px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-xs shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-rose-500">
                Highest
              </span>
              <span className="text-[11px]">🔥</span>
            </div>
            <div className="mt-0.5">
              <span className="text-base sm:text-lg font-black text-rose-600 tracking-tight leading-none">
                {reportData.kpis.highest || '—'}
              </span>
            </div>
            {reportData.kpis.highestInfo && (
              <p className="mt-0.5 truncate text-[9px] sm:text-[10px] font-medium text-rose-600/80">
                {reportData.kpis.highestInfo}
              </p>
            )}
          </div>

          {/* Lowest Card */}
          <div className="w-[125px] sm:w-[135px] rounded-xl border border-sky-100 bg-linear-to-br from-sky-50/80 to-white px-2.5 py-1.5 sm:px-3 sm:py-2 shadow-xs shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-sky-500">
                Lowest
              </span>
              <span className="text-[11px]">❄️</span>
            </div>
            <div className="mt-0.5">
              <span className="text-base sm:text-lg font-black text-sky-600 tracking-tight leading-none">
                {reportData.kpis.lowest || '—'}
              </span>
            </div>
            {reportData.kpis.lowestInfo && (
              <p className="mt-0.5 truncate text-[9px] sm:text-[10px] font-medium text-sky-600/80">
                {reportData.kpis.lowestInfo}
              </p>
            )}
          </div>

          {/* Stacked Export Buttons: Upper half PDF, Lower half Excel */}
          <div className="flex flex-col gap-1.5 justify-center shrink-0">
            {/* Upper: PDF Button */}
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={exportingPdf || loading || reportData.rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 cursor-pointer"
            >
              <span>📄</span>
              <span>{exportingPdf ? '...' : 'PDF'}</span>
            </button>

            {/* Lower: Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || reportData.rows.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 cursor-pointer"
            >
              <span>📊</span>
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* 4. Main 6-Column Data Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Temperature Readings
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                {reportData.rows.length} rows
              </span>
            </div>
            <button
              type="button"
              onClick={loadReport}
              disabled={loading}
              className="text-xs font-semibold text-slate-500 hover:text-emerald-700 transition cursor-pointer"
            >
              {loading ? 'Refreshing...' : '↻ Refresh'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-32">Time</th>
                  <th className="py-3 px-4 w-44">Shed · Line</th>
                  <th className="py-3 px-4 text-center">Pad</th>
                  <th className="py-3 px-4 text-center">Mid</th>
                  <th className="py-3 px-4 text-center">Fan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      <p className="mt-2 text-xs font-medium">Loading temperature report...</p>
                    </td>
                  </tr>
                ) : reportData.rows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400">
                      <p className="text-2xl mb-1">🌙</p>
                      <p className="font-bold text-slate-700">No temperature records found</p>
                      <p className="text-xs mt-1 text-slate-500">
                        No night rounds were captured for {currentFarmName} on {formattedDisplayDate}.
                      </p>
                      <div className="mt-4">
                        <NavLink
                          to="/temperature/entry"
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"
                        >
                          Capture first reading →
                        </NavLink>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportData.rows.map((row, idx) => {
                    if (row.missed) {
                      return (
                        <tr
                          key={`missed-${row.time}-${row.shedLine}-${idx}`}
                          className="bg-rose-50/40 hover:bg-rose-50/70 transition"
                        >
                          <td className="py-3 px-4 font-bold text-slate-700 whitespace-nowrap">
                            {row.time}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                            {row.shedLine}
                          </td>
                          <td colSpan="3" className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 italic">
                              <span>⚠️</span>
                              <span>No round saved for this hour (Missed)</span>
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr
                        key={`row-${row.time}-${row.shedLine}-${idx}`}
                        className="hover:bg-slate-50/70 transition"
                      >
                        {/* 1. Time (Exact when 1 reading, Average round time when multiple) */}
                        <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap" title={row.timeSpan ? `Round span: ${row.timeSpan}` : undefined}>
                          <div>{row.time}</div>
                          {row.timeSpan && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              {row.timeSpan}
                            </div>
                          )}
                        </td>

                        {/* 2. Shed · Line */}
                        <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                          {row.shedLine}
                        </td>

                        {/* 3. Pad */}
                        <td className="py-3 px-4 text-center">
                          {renderTempCell(row.pad, row.padVerified)}
                        </td>

                        {/* 4. Mid */}
                        <td className="py-3 px-4 text-center">
                          {renderTempCell(row.mid, row.midVerified)}
                        </td>

                        {/* 5. Fan */}
                        <td className="py-3 px-4 text-center">
                          {renderTempCell(row.fan, row.fanVerified)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer with Summary */}
          {reportData.rows.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500">
              <span className="text-[11px] font-semibold text-slate-600">
                Total Rounds: {reportData.rows.length}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                {currentFarmName} · Daily Temperature Log
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
