import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';
import { fetchWeeklyTemperatureReport, fetchSpots } from '../api/temperatureApi.js';
import { exportReportToPdf } from '../../utils/exportPdf.js';
import * as XLSX from 'xlsx';

export default function TemperatureWeeklyPage({ compact = false }) {
  const { user } = useAuth();
  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);

  // Today in IST (YYYY-MM-DD)
  const todayIST = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  }, []);

  // Default to 1 week (6 days before todayIST to todayIST)
  const defaultStartIST = useMemo(() => {
    const [y, m, d] = todayIST.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - 6)).toISOString().slice(0, 10);
  }, [todayIST]);

  // Filter States
  const [firms, setFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState('');
  const [startDate, setStartDate] = useState(defaultStartIST);
  const [endDate, setEndDate] = useState(todayIST);
  const [selectedShed, setSelectedShed] = useState('All sheds');
  const [selectedSpot, setSelectedSpot] = useState('Middle'); // 'Pad Side' | 'Middle' | 'Fan Side'
  const [configuredSheds, setConfiguredSheds] = useState([]);

  // Data & Loading States
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState({ days: [], firms: [] });
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const reportContainerRef = useRef(null);

  // 1. Load accessible poultry farms (only actual production farms: Raghav, Sanjana)
  useEffect(() => {
    let isMounted = true;
    api('/firms?module=temperature')
      .then((data) => {
        if (!isMounted) return;
        const rawList = data.firms || (Array.isArray(data) ? data : data?.data || []);
        // Strictly filter out Head Office, keeping only actual poultry farms (Raghav, Sanjana)
        const list = rawList.filter((f) => f.code !== 'OFFICE' && !/office/i.test(f.name));
        setFirms(list);
        if (list.length > 0) {
          setSelectedFirm(String(list[0]._id));
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

  // 2. Load configured sheds for the selected farm
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

  // 3. Fetch Weekly / Date Range Report Data
  const loadWeeklyReport = async () => {
    if (!selectedFirm) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchWeeklyTemperatureReport(selectedFirm, startDate, endDate, selectedShed);
      if (res && res.success) {
        setReportData({
          startDate: res.startDate,
          endDate: res.endDate,
          days: res.days || [],
          firms: res.firms || [],
        });
      } else {
        setReportData({ days: [], firms: [] });
        if (res?.message) setError(res.message);
      }
    } catch (err) {
      console.error('Failed to load weekly report:', err);
      setError('Failed to load weekly temperature records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFirm) {
      loadWeeklyReport();
    }
  }, [selectedFirm, startDate, endDate, selectedShed]);

  // Formatted display date for the date range
  const formattedWeekRange = useMemo(() => {
    if (!reportData.days || reportData.days.length === 0) return `${startDate} to ${endDate}`;
    const start = reportData.days[0];
    const end = reportData.days[reportData.days.length - 1];
    return `${start.dayNum}-${start.monthName}-${start.date.slice(0, 4)} to ${end.dayNum}-${end.monthName}-${end.date.slice(0, 4)}`;
  }, [reportData.days, startDate, endDate]);

  // Available sheds list for dropdown
  const availableSheds = useMemo(() => {
    const shedSet = new Set(configuredSheds);
    (reportData.firms || []).forEach((f) => {
      (f.sheds || []).forEach((s) => {
        if (s.shedName) shedSet.add(s.shedName);
      });
    });
    return Array.from(shedSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [configuredSheds, reportData.firms]);

  // Active farm display name
  const currentFarmName = useMemo(() => {
    const found = firms.find((f) => String(f._id) === String(selectedFirm));
    return found ? found.name : 'Farm';
  }, [selectedFirm, firms]);

  // 4. Excel Export
  const handleExportExcel = () => {
    if (!reportData.days || reportData.days.length === 0) return;
    try {
      const exportRows = [];

      (reportData.firms || []).forEach((firm) => {
        (firm.sheds || []).forEach((shed) => {
          (shed.rounds || []).forEach((round) => {
            const rowObj = {
              Farm: firm.firmName,
              Shed: shed.shedName,
              Line: shed.line,
              Time: round.slot,
              Spot: selectedSpot,
            };

            reportData.days.forEach((day) => {
              const r = round.readings ? round.readings[day.date] : null;
              let val = null;
              if (r) {
                if (selectedSpot === 'Middle') val = r.mid;
                else if (selectedSpot === 'Pad Side') val = r.pad;
                else val = r.fan;
              }
              rowObj[day.label] = val !== null && val !== undefined ? `${val}°C` : '—';
            });

            exportRows.push(rowObj);
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(exportRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Weekly Temperature');
      XLSX.writeFile(
        workbook,
        `Weekly_Temperature_${selectedSpot.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`
      );
    } catch (err) {
      console.error('Excel Export Error:', err);
      alert('Failed to export Excel spreadsheet.');
    }
  };

  // 5. PDF Export
  const handleExportPdf = async () => {
    if (!reportContainerRef.current) return;
    setExportingPdf(true);
    try {
      await exportReportToPdf(reportContainerRef.current, {
        filename: `Weekly_Temperature_${selectedSpot.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.pdf`,
        orientation: 'landscape',
        format: 'a4',
      });
    } catch (err) {
      console.error('PDF Export Error:', err);
      alert('Failed to export PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className={`space-y-3 ${compact ? '' : 'max-w-7xl mx-auto pb-12'}`}>
      {/* 1. Top Header */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg text-emerald-800">
            📅
          </span>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-tight">
              Weekly Temperature report
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
              Reading Matrix · {formattedWeekRange}
            </p>
          </div>
        </div>

        {/* Action Buttons: PDF & Excel */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            disabled={exportingPdf || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-200 transition disabled:opacity-50 cursor-pointer"
            title="Export Weekly PDF Report"
          >
            {exportingPdf ? (
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border border-emerald-600 border-t-transparent" />
            ) : (
              <svg className="h-3.5 w-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            )}
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-200 transition disabled:opacity-50 cursor-pointer"
            title="Export Weekly Excel Spreadsheet"
          >
            <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Excel</span>
          </button>
        </div>
      </div>

      {/* 2. Top Controls & Filter Bar (Farm, From Date, To Date, Shed, Spot Filter) */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3 sm:p-3.5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 items-end">
          {/* Farm Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Farm
            </label>
            <select
              value={selectedFirm}
              onChange={(e) => setSelectedFirm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none cursor-pointer"
            >
              {firms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate || todayIST}
              onChange={(e) => e.target.value && setStartDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none cursor-pointer"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={todayIST}
              onChange={(e) => e.target.value && setEndDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none cursor-pointer"
            />
          </div>

          {/* Shed Dropdown */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Shed
            </label>
            <select
              value={selectedShed}
              onChange={(e) => setSelectedShed(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="All sheds">All sheds</option>
              {availableSheds.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Spot Filter Selector (Pad Side / Middle / Fan Side) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Spot Filter
            </label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
              {['Pad Side', 'Middle', 'Fan Side'].map((spotName) => {
                const isActive = selectedSpot === spotName;
                return (
                  <button
                    key={spotName}
                    type="button"
                    onClick={() => setSelectedSpot(spotName)}
                    className={`py-1 px-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition text-center truncate cursor-pointer ${
                      isActive
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                    title={`Show ${spotName} readings`}
                  >
                    {spotName === 'Pad Side' ? 'Pad' : spotName === 'Fan Side' ? 'Fan' : 'Middle'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Data Table Container */}
      <div ref={reportContainerRef} className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-xs">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <p className="mt-2 text-xs font-semibold text-slate-600">
              Loading weekly temperature readings…
            </p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center text-xs text-rose-700 shadow-xs">
            <p className="font-bold">{error}</p>
            <button
              type="button"
              onClick={loadWeeklyReport}
              className="mt-2 text-xs font-bold text-rose-700 underline hover:text-rose-900 cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : reportData.firms.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400 shadow-xs">
            No temperature records found for this period.
          </div>
        ) : (
          reportData.firms.map((firmGroup) => {
            const hasSheds = firmGroup.sheds && firmGroup.sheds.length > 0;

            return (
              <div
                key={firmGroup.firmId}
                className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden"
              >
                {/* Farm Card Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/30">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-xs text-emerald-800 font-bold">
                      🏠
                    </span>
                    <h2 className="text-xs sm:text-sm font-black text-slate-900 tracking-wider uppercase">
                      {firmGroup.firmName}
                    </h2>
                    <span className="ml-2 text-[11px] font-semibold text-slate-500">
                      (Viewing: <span className="font-bold text-emerald-700">{selectedSpot}</span>)
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={loadWeeklyReport}
                    className="text-xs font-semibold text-slate-500 hover:text-emerald-700 transition cursor-pointer flex items-center gap-1"
                    title="Refresh readings"
                  >
                    <span>↻</span>
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Date Matrix Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-bold text-slate-700">
                        <th className="py-2.5 px-3 w-36 font-bold text-slate-800 border-r border-slate-200 text-center">
                          Shed
                        </th>
                        <th className="py-2.5 px-3 w-28 font-bold text-slate-800 text-center border-r border-slate-200">
                          Time
                        </th>
                        {reportData.days.map((day) => {
                          return (
                            <th
                              key={day.date}
                              className={`py-2.5 px-3 text-center font-bold text-slate-800 ${
                                day.isToday ? 'bg-emerald-50/60 text-emerald-900' : ''
                              }`}
                            >
                              <div>{day.label}</div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!hasSheds ? (
                        <tr>
                          <td
                            colSpan={2 + reportData.days.length}
                            className="py-8 text-center text-slate-400"
                          >
                            <p className="text-sm font-medium text-slate-500">
                              No temperature records found for {firmGroup.firmName} during this period.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        firmGroup.sheds.map((shed) => {
                          const totalRounds = shed.rounds.length;

                          return shed.rounds.map((round, rIdx) => {
                            const isFirstRoundOfShed = rIdx === 0;
                            const isLastRoundOfShed = rIdx === totalRounds - 1;

                            return (
                              <tr
                                key={`row-${shed.shedName}-${round.slot}-${rIdx}`}
                                className={`hover:bg-slate-50/50 transition ${
                                  isLastRoundOfShed ? 'border-b-2 border-slate-200' : 'border-b border-slate-100'
                                }`}
                              >
                                {/* 1. Grouped Left Shed Column (Bold plain text) */}
                                {isFirstRoundOfShed && (
                                  <td
                                    rowSpan={totalRounds}
                                    className="py-2.5 px-3 align-middle text-center bg-slate-50/40 border-r border-slate-200 select-none whitespace-nowrap w-36"
                                  >
                                    <b className="font-bold text-slate-900 text-xs">
                                      {shed.shedName} · {shed.line || 'Line 1'}
                                    </b>
                                  </td>
                                )}

                                {/* 2. Time Slot Column */}
                                <td className="py-2.5 px-3 text-center font-semibold text-slate-500 text-xs whitespace-nowrap border-r border-slate-100">
                                  {round.slot}
                                </td>

                                {/* 3. Day Readings */}
                                {reportData.days.map((day) => {
                                  const r = round.readings ? round.readings[day.date] : null;
                                  let val = null;
                                  let exactTime = null;

                                  if (r) {
                                    if (selectedSpot === 'Middle') {
                                      val = r.mid;
                                      exactTime = r.exactTimes?.mid;
                                    } else if (selectedSpot === 'Pad Side') {
                                      val = r.pad;
                                      exactTime = r.exactTimes?.pad;
                                    } else {
                                      val = r.fan;
                                      exactTime = r.exactTimes?.fan;
                                    }
                                  }

                                  return (
                                    <td
                                      key={`cell-${day.date}-${round.slot}`}
                                      className={`py-2.5 px-3 text-center text-xs ${
                                        day.isToday ? 'bg-emerald-50/20' : ''
                                      }`}
                                    >
                                      {val !== null && val !== undefined ? (
                                        <span
                                          className="text-xs text-slate-800 font-normal"
                                          title={
                                            exactTime
                                              ? `${selectedSpot}: ${val}°C recorded at ${exactTime} on ${day.fullLabel}`
                                              : `${selectedSpot}: ${val}°C on ${day.fullLabel}`
                                          }
                                        >
                                          {val}°C
                                        </span>
                                      ) : (
                                        <span className="text-slate-300 font-light text-xs">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
