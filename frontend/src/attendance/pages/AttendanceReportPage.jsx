import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import DailyRegisterView from '../components/DailyRegisterView.jsx';
import MonthlySummaryView from '../components/MonthlySummaryView.jsx';
import { inputClass, Spinner } from '../../components/Ui.jsx';
import { api } from '../../api/client.js';
import { attendancePath } from '../services/adminApi.js';
import LiveDashboardView from '../components/LiveDashboardView.jsx';
import { exportReportToPdf } from '../../utils/exportPdf.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

function getCurrentMonthString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
}

export default function AttendanceReportPage() {
  const [activeTab, setActiveTab] = useState('live');
  const [firms, setFirms] = useState([]);
  const [firmId, setFirmId] = useState('all');
  const [loadingFirms, setLoadingFirms] = useState(true);
  const [date, setDate] = useState(getTodayString());
  const [month, setMonth] = useState(getCurrentMonthString());
  const [liveAutoRefresh, setLiveAutoRefresh] = useState(true);
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const dailyReportRef = useRef(null);

  const handleExportPdf = async () => {
    if (!dailyReportRef.current || exportingPdf) return;
    setExportingPdf(true);
    try {
      const activeFirm = firms.find((f) => String(f._id) === String(firmId));
      const firmName = activeFirm
        ? (activeFirm.code || activeFirm.name).replace(/[^a-zA-Z0-9_-]/g, '_')
        : (firmId === 'all' ? 'All_Firms' : 'Firm');
      await exportReportToPdf(dailyReportRef.current, {
        filename: `daily-shed-report-${firmName}-${date}.pdf`,
        orientation: 'portrait',
        format: 'a4',
        margin: 6,
      });
    } catch (err) {
      console.error('Failed to export daily report PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    if (newTab === 'daily') {
      setDate(getYesterdayString());
    } else if (newTab === 'live') {
      setDate(getTodayString());
    }
  };

  // Load accessible firms once at the report page level
  useEffect(() => {
    setLoadingFirms(true);
    api(attendancePath('firms'))
      .then(({ firms: list = [] }) => {
        setFirms(list);
      })
      .catch(() => {})
      .finally(() => setLoadingFirms(false));
  }, []);

  const visibleFirms = useMemo(() => {
    if (!firmId || firmId === 'all') return firms;
    return firms.filter((f) => String(f._id) === String(firmId));
  }, [firms, firmId]);

  const changeDate = (days) => {
    const parts = (date || getTodayString()).split('-');
    const d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };

  const isToday = date === getTodayString();

  return (
    <div className="attendance-page space-y-1.5 sm:space-y-2">
      {/* Consolidated Header with Responsive Layout */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:p-2.5 shadow-2xs space-y-2 no-print">
        {/* Row 1: Title + Segmented Tabs (Directly Adjacent on Desktop, Cleanly Stacked on Mobile) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-start gap-2 sm:gap-3.5">
          <div className="flex items-center">
            <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-cyan-700">📋</span>
              <span>Attendance Register</span>
            </h1>
          </div>

          {/* Segmented Tabs: 3 equal buttons across width on mobile, inline on desktop */}
          <div className="grid grid-cols-3 sm:inline-flex rounded-lg bg-slate-100 p-0.5 w-full sm:w-auto" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'live'}
              onClick={() => handleTabChange('live')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 sm:py-1 px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'live'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Live</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'daily'}
              onClick={() => handleTabChange('daily')}
              className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 sm:py-1 px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'daily'
                  ? 'bg-white text-cyan-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>📋</span>
              <span>Daily</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'monthly'}
              onClick={() => handleTabChange('monthly')}
              className={`inline-flex items-center justify-center gap-1 rounded-md py-1.5 sm:py-1 px-3 text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                activeTab === 'monthly'
                  ? 'bg-white text-cyan-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>📅</span>
              <span>Monthly</span>
            </button>
          </div>
        </div>

        {/* Row 2: Left Half (Firm & Date/Month) | Right Half (Take Attendance & Just Below Refresh) */}
        <div className="pt-2 border-t border-slate-100">
          <div className="grid grid-cols-[1.05fr_0.95fr] sm:flex sm:flex-wrap sm:items-end gap-2 sm:gap-3">
            {/* Left Half on Mobile: Firm on top, Date/Month below */}
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3 w-full sm:w-auto">
              {/* Firm Selector */}
              <div className="w-full sm:w-52">
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  Firm / Farm
                </label>
                {loadingFirms ? (
                  <div className="h-7 animate-pulse rounded bg-slate-100" />
                ) : (
                  <select
                    aria-label="Select Firm"
                    className={`${inputClass} !min-h-7 !h-7 !py-0 !px-1.5 text-xs font-semibold rounded-lg w-full truncate cursor-pointer`}
                    value={firmId}
                    onChange={(e) => setFirmId(e.target.value)}
                  >
                    <option value="all">
                      All Firms
                    </option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Date Selector (for Daily & Live) or Month Selector (for Monthly) */}
              <div className="w-full sm:w-56">
                {activeTab === 'monthly' ? (
                  <div>
                    <label className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      Attendance Month
                    </label>
                    <input
                      type="month"
                      aria-label="Attendance Month"
                      className={`${inputClass} !min-h-7 !h-7 !py-0 !px-1.5 text-xs font-semibold rounded-lg w-full cursor-pointer`}
                      value={month}
                      onClick={(e) => e.currentTarget.showPicker?.()}
                      onChange={(e) => setMonth(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                      {activeTab === 'daily' ? 'Report Date' : 'Attendance Date'}
                    </label>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => changeDate(-1)}
                        title="Previous Day"
                        aria-label="Previous Day"
                        className="!h-7 !min-h-7 w-6 min-w-6 max-w-6 p-0 flex items-center justify-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs shrink-0 cursor-pointer"
                      >
                        ◀
                      </button>
                      <input
                        type="date"
                        aria-label="Attendance Date"
                        className={`${inputClass} !min-h-7 !h-7 !py-0 !px-0.5 text-[11px] sm:text-xs font-semibold rounded-none border-x-0 w-full text-center cursor-pointer tracking-tight sm:tracking-normal [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:scale-75 [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
                        value={date}
                        onClick={(e) => e.currentTarget.showPicker?.()}
                        onChange={(e) => setDate(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => changeDate(1)}
                        title="Next Day"
                        aria-label="Next Day"
                        className="!h-7 !min-h-7 w-6 min-w-6 max-w-6 p-0 flex items-center justify-center rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-xs shrink-0 cursor-pointer"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Half on Mobile: Take Attendance on top, and just below show Refresh */}
            <div className="flex flex-col justify-between sm:flex-row sm:items-end gap-1.5 sm:gap-2 w-full sm:w-auto">
              {/* Take Attendance Button */}
              <div>
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-transparent mb-0.5 select-none pointer-events-none">
                  &nbsp;
                </label>
                <Link
                  to={`/attendance/scan${firmId && firmId !== 'all' ? `?firmId=${firmId}&date=${date}` : `?date=${date}`}`}
                  className={`flex ${
                    activeTab === 'monthly'
                      ? 'flex-col justify-center min-h-[76px] h-[76px] gap-1'
                      : 'flex-row min-h-[45px] h-[45px]'
                  } sm:flex-row sm:min-h-9 sm:h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-2.5 sm:px-3 font-bold transition shadow-xs cursor-pointer text-center border border-emerald-600 text-xs tracking-tight sm:tracking-normal w-full max-w-[146px] sm:w-auto sm:max-w-none whitespace-nowrap`}
                  title="Open camera face scanner to take attendance"
                >
                  <span className={activeTab === 'monthly' ? 'text-base sm:text-xs' : ''}>📷</span>
                  <span>Take Attendance</span>
                </Link>
              </div>

              {/* Just Below / Adjacent: Daily Actions (Export PDF & Print) */}
              {activeTab === 'daily' && (
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:items-center sm:gap-1.5 pt-1 sm:pt-0 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={exportingPdf}
                    title="Export Daily Report to PDF"
                    className="inline-flex items-center justify-center gap-1.5 !h-8 !min-h-8 sm:!h-9 sm:!min-h-9 px-2 sm:px-3 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 active:scale-95 disabled:opacity-50 rounded-lg cursor-pointer shadow-2xs transition whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5 text-rose-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                    <span>{exportingPdf ? 'Exporting…' : 'PDF'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    title="Print Daily Report"
                    className="inline-flex items-center justify-center gap-1.5 !h-8 !min-h-8 sm:!h-9 sm:!min-h-9 px-2 sm:px-3 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 active:scale-95 cursor-pointer shadow-2xs transition whitespace-nowrap"
                  >
                    <svg className="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Print</span>
                  </button>
                </div>
              )}

              {/* Just Below / Adjacent: Live Controls (Auto-refresh & Refresh) */}
              {activeTab === 'live' && (
                <div className="flex items-center justify-start gap-2 sm:gap-2 pt-1 sm:pt-0">
                  <label className="flex cursor-pointer items-center gap-1 text-[10px] sm:text-xs font-semibold text-slate-600 select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={liveAutoRefresh}
                      onChange={(e) => setLiveAutoRefresh(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span className="flex items-center gap-1">
                      {liveAutoRefresh && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                      <span className="hidden sm:inline">Auto-refresh (30s)</span>
                      <span className="sm:hidden text-[10px]">Auto 30s</span>
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setLiveRefreshKey((k) => k + 1)}
                    className="!h-7 !min-h-7 px-2 flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer shadow-2xs transition active:scale-95 shrink-0"
                    title="Refresh Live Data"
                  >
                    <span>↻</span>
                    <span className="hidden sm:inline">Refresh</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {/* 1. Live Tab: Real-Time Worker Attendance Register */}
      {activeTab === 'live' && (
        <div className="space-y-4 sm:space-y-6">
          {loadingFirms ? (
            <div className="rounded-2xl bg-white p-6 shadow-xs border border-slate-100">
              <Spinner label="Loading firms…" />
            </div>
          ) : visibleFirms.length ? (
            visibleFirms.map((f, index) => (
              <section key={f._id} className="space-y-2">
                <div className="flex items-center gap-2 pt-1 pb-0.5 border-b border-slate-200">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md">
                    {visibleFirms.length > 1 ? `${index + 1}. Firm` : 'Firm'}
                  </span>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
                    {f.name}
                  </h2>
                </div>
                <DailyRegisterView
                  firmId={f._id}
                  firms={firms}
                  date={date}
                  setDate={setDate}
                />
              </section>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No accessible firm was found.
            </div>
          )}
        </div>
      )}

      {/* 2. Daily Tab: Daily Excel Shed Matrix Report */}
      {activeTab === 'daily' && (
        <div ref={dailyReportRef} className="report-export-content space-y-3">
          {/* Printable / PDF Header */}
          <div className="pdf-print-header hidden print:block border-b border-slate-300 pb-2 mb-3">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-base font-black uppercase tracking-wider text-slate-900">
                  Daily Shed Attendance Matrix
                </h2>
                <p className="text-xs text-slate-600 font-bold mt-0.5">
                  Firm: {firmId !== 'all' && firms.find((f) => String(f._id) === String(firmId)) ? firms.find((f) => String(f._id) === String(firmId)).name : 'All Accessible Farms'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-700">Report Date: {date}</p>
              </div>
            </div>
          </div>
          <LiveDashboardView
            firmId={firmId}
            date={date}
            firms={firms}
            autoRefresh={false}
          />
        </div>
      )}

      {activeTab === 'monthly' && (
        <div className="space-y-4 sm:space-y-6">
          {loadingFirms ? (
            <div className="rounded-2xl bg-white p-6 shadow-xs border border-slate-100">
              <Spinner label="Loading firms…" />
            </div>
          ) : visibleFirms.length ? (
            visibleFirms.map((f, index) => (
              <section key={f._id} className="space-y-2">
                <div className="flex items-center gap-2 pt-1 pb-0.5 border-b border-slate-200">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-cyan-800 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md">
                    {visibleFirms.length > 1 ? `${index + 1}. Firm` : 'Firm'}
                  </span>
                  <h2 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
                    {f.name}
                  </h2>
                </div>
                <MonthlySummaryView
                  firmId={f._id}
                  firms={firms}
                  month={month}
                  setMonth={setMonth}
                />
              </section>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              No accessible firm was found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

