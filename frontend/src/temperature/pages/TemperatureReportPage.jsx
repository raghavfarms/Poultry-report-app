import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { api } from '../../api/client.js';
import { fetchTemperatureReport, deleteTemperatureLogs, fetchSpots } from '../api/temperatureApi.js';
import { exportReportToPdf } from '../../utils/exportPdf.js';
import { useAuth } from '../../context/AuthContext.jsx';

export default function TemperatureReportPage({ compact = false, onSwitchToEntry = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);
  const [deletingId, setDeletingId] = useState(null);

  // 1. Data States
  const [firms, setFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState('');
  const [configuredSheds, setConfiguredSheds] = useState([]);
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
    availableSheds: [],
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

  // Load farms on mount (strictly respecting user module permissions)
  useEffect(() => {
    let isMounted = true;
    api('/firms?module=temperature')
      .then((data) => {
        if (!isMounted) return;
        const list = data.firms || data || [];
        setFirms(list);
        if (list.length > 0 && !selectedFirm) {
          if (list.length > 1) {
            setSelectedFirm('all');
          } else {
            setSelectedFirm(list[0]._id);
          }
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

  // Proactively fetch all active configured spots/sheds for selected farm so dropdown always has Shed 1, 2, 3, 4
  useEffect(() => {
    if (!selectedFirm) return;
    const firmParam = selectedFirm === 'all' ? 'all' : selectedFirm;
    fetchSpots(firmParam)
      .then((res) => {
        const spotsList = res.data || [];
        const set = new Set();
        spotsList.forEach((s) => {
          if (s.shed && s.active !== false) set.add(s.shed);
        });
        setConfiguredSheds(Array.from(set).sort());
      })
      .catch((err) => console.error('Failed to load sheds for filter:', err));
  }, [selectedFirm]);

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
          availableSheds: res.availableSheds || [],
          kpis: res.kpis || {},
        });
      } else {
        setReportData({
          rows: [],
          availableSheds: [],
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

  // Extract distinct sheds for filter dropdown (combining spots, report API response, and historical rows)
  const availableSheds = useMemo(() => {
    const set = new Set();
    configuredSheds.forEach((s) => set.add(s));
    if (reportData?.availableSheds) {
      reportData.availableSheds.forEach((s) => {
        if (s && s !== 'All sheds' && s !== 'All Sheds') set.add(s);
      });
    }
    if (reportData?.rows) {
      reportData.rows.forEach((r) => {
        if (r.shed) set.add(r.shed);
      });
    }
    return ['All sheds', ...Array.from(set).sort()];
  }, [configuredSheds, reportData?.availableSheds, reportData?.rows]);

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
    if (selectedFirm === 'all') return 'All Farms';
    const f = firms.find((item) => String(item._id) === String(selectedFirm));
    return f?.name || 'Selected Farm';
  }, [firms, selectedFirm]);

  // Group rows by farm when 'all' is selected so Raghav comes first, then Sanjana
  const groupedFirmsData = useMemo(() => {
    if (selectedFirm !== 'all') {
      return [
        {
          firmId: selectedFirm,
          firmName: currentFarmName,
          rows: reportData.rows || [],
        },
      ];
    }

    // Group rows by firmId
    const map = new Map();
    // First preserve order of all permitted firms (e.g. Raghav first, then Sanjana)
    firms.forEach((f) => {
      map.set(String(f._id), {
        firmId: String(f._id),
        firmName: f.name,
        rows: [],
      });
    });

    (reportData.rows || []).forEach((row) => {
      const fId = String(row.firmId || '');
      if (!map.has(fId)) {
        map.set(fId, {
          firmId: fId,
          firmName: row.firmName || 'Farm',
          rows: [],
        });
      }
      map.get(fId).rows.push(row);
    });

    // Return all permitted farms in order (so both Raghav and Sanjana appear)
    return Array.from(map.values());
  }, [reportData.rows, selectedFirm, firms, currentFarmName]);

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
            Pad: row.pad !== null && row.pad !== undefined ? `${Math.round(Number(row.pad))}°C` : '—',
            Mid: row.mid !== null && row.mid !== undefined ? `${Math.round(Number(row.mid))}°C` : '—',
            Fan: row.fan !== null && row.fan !== undefined ? `${Math.round(Number(row.fan))}°C` : '—',
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

  // Delete reading row (Admin only)
  const handleDeleteRow = async (row) => {
    const ids = row.logIds || [row.padLogId, row.midLogId, row.fanLogId].filter(Boolean);
    if (!ids || ids.length === 0) {
      alert('No reading records found to delete for this slot.');
      return;
    }

    const confirmMsg = `Are you sure you want to delete this temperature reading?\nTime: ${row.time}\nShed: ${row.shed} · ${row.line}`;
    if (!window.confirm(confirmMsg)) return;

    const rowKey = `${row.time}-${row.shedLine}`;
    setDeletingId(rowKey);
    try {
      const res = await deleteTemperatureLogs(ids);
      if (res && res.success) {
        await loadReport();
      } else {
        alert(res?.message || 'Failed to delete temperature reading');
      }
    } catch (err) {
      console.error('Error deleting reading:', err);
      alert(err.message || 'Failed to delete temperature reading');
    } finally {
      setDeletingId(null);
    }
  };

  // Helper for temp cell styling
  const renderTempCell = (val, isVerified, captureTime, spotLabel) => {
    if (val === null || val === undefined) {
      return <span className="text-slate-400 font-light">—</span>;
    }
    const num = Math.round(Number(val));

    return (
      <span
        className="inline-flex items-center font-semibold text-slate-800"
        title={captureTime ? `${spotLabel}: ${num}°C recorded at ${captureTime}` : undefined}
      >
        <span>{num}°C</span>
      </span>
    );
  };

  return (
    <div className={`space-y-3 ${compact ? '' : 'max-w-7xl mx-auto pb-12'}`}>
      {/* 1. Header (Compact & shifted upwards, with PDF/Excel exports on right) */}
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

        {/* Export Buttons in Top Header */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf || loading || reportData.rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 cursor-pointer"
          >
            <span>📄</span>
            <span>{exportingPdf ? 'Exporting...' : 'PDF'}</span>
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || reportData.rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50 cursor-pointer"
          >
            <span>📊</span>
            <span>Excel</span>
          </button>
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
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none cursor-pointer"
            >
              {firms.length > 1 && (
                <option value="all">All Farms</option>
              )}
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
        {/* 4. Data Tables (Separated by Farm so Raghav is first, then Sanjana) */}
        {loading ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 shadow-xs">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-2 text-xs font-medium">Loading temperature report...</p>
          </div>
        ) : groupedFirmsData.length === 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 shadow-xs">
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
          </div>
        ) : (
          <div className="space-y-4">
            {groupedFirmsData.map((group) => {
              const recordedCount = group.rows.filter((r) => !r.missed).length;
              return (
                <div
                  key={group.firmId || group.firmName}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                >
                  {/* Farm Header Banner */}
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs text-emerald-800 font-bold">
                        🏡
                      </span>
                      <h2 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">
                        {group.firmName}
                      </h2>
                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                        {group.rows.length} rounds ({recordedCount} recorded)
                      </span>
                    </div>
                    {selectedFirm !== 'all' && (
                      <button
                        type="button"
                        onClick={loadReport}
                        disabled={loading}
                        className="text-xs font-semibold text-slate-500 hover:text-emerald-700 transition cursor-pointer"
                      >
                        ↻ Refresh
                      </button>
                    )}
                  </div>

                  {/* 5-Column Clean Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4 w-32">Time</th>
                          <th className="py-2.5 px-4 w-44">Shed · Line</th>
                          <th className="py-2.5 px-4 text-center">Pad</th>
                          <th className="py-2.5 px-4 text-center">Mid</th>
                          <th className="py-2.5 px-4 text-center">Fan</th>
                          {isAdminOrDev && (
                            <th className="py-2.5 px-3 text-center w-16">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.rows.length === 0 ? (
                          <tr>
                            <td colSpan={isAdminOrDev ? 6 : 5} className="py-6 text-center text-slate-400">
                              <p className="text-sm font-medium text-slate-500">
                                No temperature records found for {group.firmName} on {formattedDisplayDate}
                              </p>
                            </td>
                          </tr>
                        ) : (
                          group.rows.map((row, idx) => {
                            if (row.missed) {
                              return (
                                <tr
                                  key={`missed-${row.time}-${row.shedLine}-${idx}`}
                                  className="bg-rose-50/40 hover:bg-rose-50/70 transition"
                                >
                                  <td className="py-2.5 px-4 font-bold text-slate-700 whitespace-nowrap">
                                    {row.time}
                                  </td>
                                  <td className="py-2.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                                    {row.shed} · {row.line}
                                  </td>
                                  <td colSpan={isAdminOrDev ? 4 : 3} className="py-2.5 px-4 text-center">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 italic">
                                      <span>⚠️</span>
                                      <span>No round saved for this hour (Missed)</span>
                                    </span>
                                  </td>
                                </tr>
                              );
                            }

                            const isDeletingThis = deletingId === `${row.time}-${row.shedLine}`;

                            return (
                              <tr
                                key={`row-${row.time}-${row.shedLine}-${idx}`}
                                className="hover:bg-slate-50/70 transition"
                              >
                                {/* 1. Time (Average of readings if 2 or 3, or exact time if 1) */}
                                <td
                                  className="py-2.5 px-4 font-bold text-slate-800 whitespace-nowrap"
                                  title={row.timeSpan ? `Round span: ${row.timeSpan}` : undefined}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span>{row.time}</span>
                                    {row.readingsCount > 1 && (
                                      <span
                                        className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1 py-0.2 rounded"
                                        title={`Average time of ${row.readingsCount} readings (${row.timeSpan})`}
                                      >
                                        Avg
                                      </span>
                                    )}
                                  </div>
                                  {row.timeSpan && row.readingsCount > 1 && (
                                    <div className="text-[10px] text-slate-400 font-normal">
                                      {row.timeSpan}
                                    </div>
                                  )}
                                </td>

                                {/* 2. Shed · Line */}
                                <td className="py-2.5 px-4 font-semibold text-slate-700 whitespace-nowrap">
                                  {row.shed} · {row.line}
                                </td>

                                {/* 3. Pad */}
                                <td className="py-2.5 px-4 text-center">
                                  {renderTempCell(row.pad, row.padVerified, row.padTime, 'Pad Side')}
                                </td>

                                {/* 4. Mid */}
                                <td className="py-2.5 px-4 text-center">
                                  {renderTempCell(row.mid, row.midVerified, row.midTime, 'Middle')}
                                </td>

                                {/* 5. Fan */}
                                <td className="py-2.5 px-4 text-center">
                                  {renderTempCell(row.fan, row.fanVerified, row.fanTime, 'Fan Side')}
                                </td>

                                {/* 6. Action (Admin only) */}
                                {isAdminOrDev && (
                                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRow(row)}
                                      disabled={isDeletingThis}
                                      className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition disabled:opacity-50 cursor-pointer"
                                      title="Delete reading"
                                    >
                                      {isDeletingThis ? (
                                        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-rose-600 border-t-transparent" />
                                      ) : (
                                        <svg
                                          className="h-4 w-4"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          />
                                        </svg>
                                      )}
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Table Footer */}
                  <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    <span className="text-[11px] font-semibold text-slate-600">
                      {group.firmName} · {group.rows.length} Rounds
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">
                      Daily Temperature Log
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
