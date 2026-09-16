import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import { Alert, Spinner } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function formatCount(val) {
  if (val === undefined || val === null || val === 0) return '—';
  return Number.isInteger(val) ? val : Number(val.toFixed(1));
}

function formatTotal(val) {
  if (val === undefined || val === null || val === 0) return 0;
  return Number.isInteger(val) ? val : Number(val.toFixed(1));
}

export default function LiveDashboardView({
  firmId = 'all',
  date = getTodayString(),
  firms = [],
  autoRefresh = true,
  refreshTrigger = 0,
}) {
  const [internalFirms, setInternalFirms] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [firmReports, setFirmReports] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  // 1. Fallback load accessible firms if not passed in as props
  useEffect(() => {
    if (firms && firms.length > 0) return;
    api(attendancePath('firms'))
      .then(({ firms: list = [] }) => {
        setInternalFirms(list);
      })
      .catch((err) => setError(err.message || 'Failed to load firms.'));
  }, [firms]);

  const activeFirms = firms && firms.length > 0 ? firms : internalFirms;

  // 2. Fetch live dashboard data for selected firm or ALL accessible firms in parallel
  const loadDashboard = useCallback(() => {
    if (!activeFirms.length) return;
    setLoadingData(true);

    const targetFirms =
      firmId === 'all'
        ? activeFirms
        : activeFirms.filter((f) => String(f._id) === String(firmId));

    if (!targetFirms.length) {
      setLoadingData(false);
      return;
    }

    Promise.all(
      targetFirms.map((f) =>
        api(attendancePath('dashboard/live', { firmId: f._id, date }))
          .then((res) => ({ ...res, firm: res.firm || f }))
          .catch((err) => {
            console.warn(`Failed to fetch live data for firm ${f.name}:`, err);
            return null;
          })
      )
    )
      .then((results) => {
        const valid = results.filter(Boolean);
        setFirmReports(valid);
        setLastUpdated(new Date());
        setError('');
      })
      .catch((err) => setError(err.message || 'Failed to load dashboard data.'))
      .finally(() => setLoadingData(false));
  }, [activeFirms, firmId, date]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, refreshTrigger]);

  // 3. Auto-refresh polling every 30 seconds
  useEffect(() => {
    if (!autoRefresh || !activeFirms.length) return;
    const interval = setInterval(loadDashboard, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeFirms.length, loadDashboard]);

  return (
    <div className="space-y-4">

      {error && <Alert type="error">{error}</Alert>}

      {/* 📊 Client Executive Poultry Attendance Details Sheet (Left-Aligned from Left Corner) */}
      <div className="w-full max-w-3xl space-y-5">
        {loadingData && firmReports.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-xl border-2 border-slate-400 shadow-sm">
            <Spinner label="Loading live attendance matrix…" />
          </div>
        ) : firmReports.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400 bg-white rounded-xl border-2 border-slate-400 shadow-sm">
            No report data available for the selected firm.
          </div>
        ) : (
          <div className="space-y-5">
            {firmReports.map((rep) => {
              const sheds = rep.sheds || [];
              const summary = rep.summary || {};
              const totalLabour = sheds.reduce((acc, s) => acc + (s.labourCount || 0), 0);
              const totalLadiesLabour = sheds.reduce((acc, s) => acc + (s.ladiesLabourCount || 0), 0);
              const totalSupervisors = sheds.reduce((acc, s) => acc + (s.supervisorCount || 0), 0);
              const totalShedWorkers = totalLabour + totalLadiesLabour + totalSupervisors;
              const securityCount = summary.securityCount || 0;
              const otherSupervisorsList = summary.otherSupervisors || [];
              const otherSupervisorsCount = summary.otherSupervisorsCount !== undefined
                ? summary.otherSupervisorsCount
                : otherSupervisorsList.length;
              const grandSubtotal = totalShedWorkers + securityCount + otherSupervisorsCount;

              return (
                <div
                  key={rep.firm?._id}
                  className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white shadow-sm"
                >
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-xs text-center">
                      <colgroup>
                        <col className="w-[43%]" />
                        <col className="w-[14%]" />
                        <col className="w-[15%]" />
                        <col className="w-[14%]" />
                        <col className="w-[14%]" />
                      </colgroup>
                      <thead>
                        {/* Yellow Farm Header Bar (Matching Excel Sheet) */}
                        <tr className="bg-amber-300 text-slate-900 border-b-2 border-slate-400 font-black">
                          <th className="py-1.5 px-2 text-left uppercase tracking-wider border-r border-slate-400 font-black text-[11px] sm:text-xs leading-tight">
                            {rep.firm?.name || 'Farm'}
                          </th>
                          <th className="py-1.5 px-0.5 border-r border-slate-400 text-center font-bold text-[10px] sm:text-xs">
                            Labour
                          </th>
                          <th className="py-1 px-0.5 border-r border-slate-400 text-center font-bold text-[9.5px] sm:text-xs leading-tight">
                            <span className="block">Ladies</span>
                            <span className="block">Labour</span>
                          </th>
                          <th className="py-1.5 px-0.5 border-r border-slate-400 text-center font-bold text-[9.5px] sm:text-xs leading-tight">
                            Supervisor
                          </th>
                          <th className="sticky right-0 z-10 py-1.5 px-0.5 text-slate-950 font-bold bg-amber-400 text-center text-[10px] sm:text-xs border-l border-amber-500 shadow-[-1px_0_2px_rgba(0,0,0,0.06)]">
                            Total
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {/* Shed Rows */}
                        {sheds.length === 0 ? (
                          <tr className="border-b border-slate-200">
                            <td colSpan={5} className="py-3 text-center text-xs text-slate-400">
                              No sheds registered for {rep.firm?.name}.
                            </td>
                          </tr>
                        ) : (
                          sheds.map((shed, idx) => (
                            <tr
                              key={shed._id}
                              className={`hover:bg-amber-50/50 transition-colors border-b border-slate-300 ${
                                idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                              }`}
                            >
                              <td className="py-1.5 px-2 text-left font-bold text-slate-800 border-r border-slate-300 text-[11px] sm:text-xs leading-tight break-words">
                                {shed.name}
                              </td>
                              <td className="py-1.5 px-1 font-semibold text-slate-700 border-r border-slate-300 text-xs">
                                {formatCount(shed.labourCount)}
                              </td>
                              <td className="py-1.5 px-1 font-semibold text-slate-700 border-r border-slate-300 text-xs">
                                {formatCount(shed.ladiesLabourCount)}
                              </td>
                              <td className="py-1.5 px-1 font-semibold text-slate-700 border-r border-slate-300 text-xs">
                                {formatCount(shed.supervisorCount)}
                              </td>
                              <td className="sticky right-0 z-10 py-1.5 px-1 font-bold text-slate-900 bg-slate-100 border-l border-slate-200 text-xs shadow-[-1px_0_2px_rgba(0,0,0,0.06)]">
                                {formatCount(shed.totalAttended)}
                              </td>
                            </tr>
                          ))
                        )}

                        {/* Total Row (Cyan Highlight - Matching Client Sheet) */}
                        <tr className="bg-cyan-200 text-cyan-950 font-bold border-t-2 border-b border-slate-400 text-xs">
                          <td className="py-1.5 px-1.5 text-left uppercase border-r border-cyan-300 text-[9.5px] sm:text-xs font-bold leading-tight break-words">
                            Total (Sheds & Units)
                          </td>
                          <td className="py-1.5 px-1 border-r border-cyan-300 font-bold text-xs">{formatTotal(totalLabour)}</td>
                          <td className="py-1.5 px-1 border-r border-cyan-300 font-bold text-xs">{formatTotal(totalLadiesLabour)}</td>
                          <td className="py-1.5 px-1 border-r border-cyan-300 font-bold text-xs">{formatTotal(totalSupervisors)}</td>
                          <td className="sticky right-0 z-10 py-1.5 px-1 bg-cyan-300 text-cyan-950 font-bold text-xs border-l border-cyan-400 shadow-[-1px_0_2px_rgba(0,0,0,0.06)]">{formatTotal(totalShedWorkers)}</td>
                        </tr>

                        {/* Security Row (Orange Highlight - Matching Client Sheet) */}
                        <tr className="bg-amber-200 text-amber-950 font-bold border-b border-slate-300 text-xs">
                          <td className="py-1.5 px-2 text-left uppercase border-r border-amber-300 text-amber-950 font-bold text-[10px] sm:text-xs">
                            SECURITY
                          </td>
                          <td className="py-1.5 px-1 border-r border-amber-300 text-slate-400">—</td>
                          <td className="py-1.5 px-1 border-r border-amber-300 text-slate-400">—</td>
                          <td className="py-1.5 px-1 border-r border-amber-300 text-slate-400">—</td>
                          <td className="sticky right-0 z-10 py-1.5 px-1 bg-amber-300 text-amber-950 font-bold text-xs border-l border-amber-400 shadow-[-1px_0_2px_rgba(0,0,0,0.06)]">{formatTotal(securityCount)}</td>
                        </tr>

                        {/* Other Supervisors Row (Slate Highlight) */}
                        <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 text-xs">
                          <td className="py-1.5 px-1.5 text-left font-bold uppercase text-slate-700 border-r border-slate-300 text-[9.5px] sm:text-xs leading-tight break-words">
                            OTHER SUPERVISORS
                          </td>
                          <td colSpan={3} className="py-1.5 px-2 text-left font-semibold text-slate-700 border-r border-slate-300 text-xs break-words">
                            {otherSupervisorsList.length > 0 ? otherSupervisorsList.join(', ') : 'None'}
                          </td>
                          <td className="sticky right-0 z-10 py-1.5 px-1 font-bold text-slate-900 bg-slate-200 text-xs border-l border-slate-300 shadow-[-1px_0_2px_rgba(0,0,0,0.06)]">
                            {formatTotal(otherSupervisorsCount)}
                          </td>
                        </tr>

                        {/* Grand Subtotal Row (Sky Blue Highlight - Matching Client Sheet) */}
                        <tr className="bg-sky-400 text-slate-950 font-bold border-t-2 border-slate-500 text-xs">
                          <td colSpan={4} className="py-1.5 px-2 text-left uppercase border-r border-sky-500 font-bold text-[11px] sm:text-xs leading-tight break-words">
                            SUBTOTAL ({rep.firm?.name || 'FARM'})
                          </td>
                          <td className="sticky right-0 z-10 py-1.5 px-1 bg-sky-500 text-white font-bold text-xs border-l border-sky-600 shadow-[-1px_0_2px_rgba(0,0,0,0.06)]">
                            {formatTotal(grandSubtotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
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
