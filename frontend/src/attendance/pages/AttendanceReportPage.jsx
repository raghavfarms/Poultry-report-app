import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import DailyRegisterView from '../components/DailyRegisterView.jsx';
import MonthlySummaryView from '../components/MonthlySummaryView.jsx';
import { inputClass, Spinner } from '../../components/Ui.jsx';
import { api } from '../../api/client.js';
import { attendancePath } from '../services/adminApi.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getCurrentMonthString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
}

export default function AttendanceReportPage() {
  const [activeTab, setActiveTab] = useState('daily');
  const [firms, setFirms] = useState([]);
  const [firmId, setFirmId] = useState('all');
  const [loadingFirms, setLoadingFirms] = useState(true);
  const [date, setDate] = useState(getTodayString());
  const [month, setMonth] = useState(getCurrentMonthString());

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
        {/* Row 1: Title + Tabs */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <h1 className="text-xs sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-1">
              <span className="text-cyan-700">📋</span>
              <span>Attendance</span>
            </h1>

            {/* Inline Segmented Tabs */}
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'daily'}
                onClick={() => setActiveTab('daily')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold transition cursor-pointer ${
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
                onClick={() => setActiveTab('monthly')}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold transition cursor-pointer ${
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
        </div>

        {/* Row 2: Firm & Date (Half-Width Stacked on Mobile) + Take Attendance Button Adjacent */}
        <div className="pt-2 border-t border-slate-100">
          <div className="grid grid-cols-[1.15fr_0.85fr] sm:flex sm:flex-wrap sm:items-end gap-2 sm:gap-3">
            {/* Left Column on Mobile (Half-Width): Firm UP, Date/Month DOWN */}
            <div className="col-span-1 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
              {/* Firm Selector */}
              <div className="w-full sm:w-52">
                <label className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">
                  Firm
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
                    <option value="all">All firms</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Date Selector (Daily) or Month Selector (Monthly) */}
              <div className="w-full sm:w-56">
                {activeTab === 'daily' ? (
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <label className="block text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Attendance Date
                      </label>
                      {!isToday && (
                        <button
                          type="button"
                          onClick={() => setDate(getTodayString())}
                          className="text-[9px] font-bold text-cyan-700 hover:text-cyan-800 underline cursor-pointer"
                        >
                          Today
                        </button>
                      )}
                    </div>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => changeDate(-1)}
                        title="Previous Day"
                        aria-label="Previous Day"
                        className="!h-7 !min-h-7 w-5 min-w-5 max-w-5 p-0 flex items-center justify-center rounded-l-lg border border-r-0 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] sm:text-xs shrink-0 cursor-pointer"
                      >
                        ◀
                      </button>
                      <input
                        type="date"
                        aria-label="Attendance Date"
                        className={`${inputClass} !min-h-7 !h-7 !py-0 !px-0.5 text-[10px] sm:text-xs font-semibold rounded-none border-x-0 w-full text-center cursor-pointer tracking-tight sm:tracking-normal [&::-webkit-calendar-picker-indicator]:p-0 [&::-webkit-calendar-picker-indicator]:scale-75 [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
                        value={date}
                        onClick={(e) => e.currentTarget.showPicker?.()}
                        onChange={(e) => setDate(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => changeDate(1)}
                        title="Next Day"
                        aria-label="Next Day"
                        className="!h-7 !min-h-7 w-5 min-w-5 max-w-5 p-0 flex items-center justify-center rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold text-[10px] sm:text-xs shrink-0 cursor-pointer"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>

            {/* Right Column on Mobile (Half-Width Vacant Space): Take Attendance Button */}
            <div className="col-span-1 flex flex-col pt-3.5 sm:pt-0 sm:justify-end sm:w-auto">
              <Link
                to={`/attendance/scan${firmId && firmId !== 'all' ? `?firmId=${firmId}&date=${date}` : `?date=${date}`}`}
                className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 w-full flex-1 sm:flex-none sm:min-h-7 sm:h-7 sm:w-auto rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-2 sm:px-3 py-1.5 sm:py-0 font-bold transition shadow-xs cursor-pointer text-center border border-emerald-600"
                title="Open camera face scanner to take attendance"
              >
                <span className="text-base sm:text-xs">📷</span>
                <span className="text-xs sm:text-xs font-bold tracking-wide leading-tight">Take Attendance</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'daily' && (
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

