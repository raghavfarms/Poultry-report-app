import { useState, useEffect, useMemo } from 'react';
import { Dialog } from './AdminUi.jsx';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton, primaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

export default function BulkAttendanceModal({ firmId, initialDate, onClose, onSuccess }) {
  const [date, setDate] = useState(initialDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  const [workers, setWorkers] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({}); // workerId -> 'P' | 'HD' | 'A'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState(null); // 'save' | 'next' | null
  const isSaving = Boolean(savingAction);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 1. Fetch active workers and existing saved attendance for the selected date
  useEffect(() => {
    if (!firmId || !date) return;
    let isMounted = true;
    setLoading(true);
    setError('');

    Promise.all([
      api(attendancePath('workers', { firmId, active: true, limit: 300 })),
      api(attendancePath('sessions', { firmId, date, limit: 500 })),
    ])
      .then(([workersRes, sessionsRes]) => {
        if (!isMounted) return;
        const workerList = workersRes.items || [];
        setWorkers(workerList);

        const savedSessions = sessionsRes.items || [];
        const sessionMap = new Map();
        for (const s of savedSessions) {
          const wId = String(s.worker?._id || s.worker);
          sessionMap.set(wId, s);
        }

        const map = {};
        workerList.forEach((w) => {
          const s = sessionMap.get(String(w._id));
          if (s) {
            if (s.status === 'ABSENT') {
              map[w._id] = 'A';
            } else if (s.status === 'DUTY_COMPLETED' && s.workedMinutes >= 240 && s.workedMinutes < 475) {
              map[w._id] = 'HD';
            } else {
              map[w._id] = 'P';
            }
          } else {
            // Not recorded yet for this date: default to P
            map[w._id] = 'P';
          }
        });
        setAttendanceMap(map);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Failed to load attendance data.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [firmId, date]);

  // Quick Action: Batch mark all workers
  const markAll = (status) => {
    if (isSaving) return;
    setAttendanceMap((prev) => {
      const next = { ...prev };
      workers.forEach((w) => {
        next[w._id] = status;
      });
      return next;
    });
  };

  // Toggle single worker status
  const setWorkerStatus = (id, status) => {
    if (isSaving) return;
    setAttendanceMap((prev) => ({ ...prev, [id]: status }));
  };

  // Summary counts for current selection
  const counts = useMemo(() => {
    let p = 0;
    let hd = 0;
    let a = 0;
    Object.values(attendanceMap).forEach((st) => {
      if (st === 'P') p++;
      else if (st === 'HD') hd++;
      else if (st === 'A') a++;
    });
    return { p, hd, a, total: workers.length };
  }, [attendanceMap, workers.length]);

  // Filtered list for search
  const filteredWorkers = useMemo(() => {
    if (!search.trim()) return workers;
    const term = search.trim().toLowerCase();
    return workers.filter((w) =>
      (w.fullName || '').toLowerCase().includes(term) ||
      (w.workerCode || '').toLowerCase().includes(term)
    );
  }, [workers, search]);

  // Save attendance
  const handleSave = async (advanceNextDay = false) => {
    if (!date) {
      setError('Please choose a valid date.');
      return;
    }

    setSavingAction(advanceNextDay ? 'next' : 'save');
    setError('');
    setNotice('');

    const records = workers.map((w) => ({
      workerId: w._id,
      status: attendanceMap[w._id] || 'P',
    }));

    try {
      await api(attendancePath('sessions/bulk-day'), {
        method: 'POST',
        body: JSON.stringify({
          firmId,
          date,
          records,
          defaultDutyIn: '08:00',
          defaultDutyOut: '17:00',
          reason: 'Bulk paper muster roll entry',
        }),
      });

      const successMsg = `✅ Saved ${date}: ${counts.p} P, ${counts.hd} HD, ${counts.a} A.`;
      if (onSuccess) onSuccess(successMsg);

      if (advanceNextDay) {
        const currentParts = date.split('-').map(Number);
        const nextDateObj = new Date(currentParts[0], currentParts[1] - 1, currentParts[2] + 1, 12, 0, 0);
        const nextDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(nextDateObj);
        setDate(nextDateStr);
        setNotice(successMsg + ` Now on ${nextDateStr}.`);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to save bulk attendance.');
    } finally {
      setSavingAction(null);
    }
  };

  return (
    <Dialog title="⚡ Bulk Daily Muster Entry" onClose={onClose} busy={isSaving} maxWidth="max-w-2xl">
      <div className="space-y-2">
        {error && <Alert type="error">{error}</Alert>}
        {notice && <Alert type="success">{notice}</Alert>}

        {/* Top Controls: Compact & Mobile Optimized */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2 space-y-2 shadow-2xs">
          {/* Row 1: Date + Quick Batch Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Date:</label>
              <input
                type="date"
                value={date}
                disabled={isSaving}
                onChange={(e) => setDate(e.target.value)}
                className={`${inputClass} !min-h-7.5 !h-7.5 !py-0 !px-2 text-xs font-bold text-slate-900 bg-white rounded-lg w-full sm:w-auto`}
              />
            </div>

            {/* Quick Set Pills */}
            <div className="flex items-center justify-start sm:justify-end gap-1 overflow-x-auto py-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap mr-0.5">
                Set All:
              </span>
              <button
                type="button"
                onClick={() => markAll('P')}
                disabled={isSaving}
                className="whitespace-nowrap px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                All P
              </button>
              <button
                type="button"
                onClick={() => markAll('HD')}
                disabled={isSaving}
                className="whitespace-nowrap px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                All HD
              </button>
              <button
                type="button"
                onClick={() => markAll('A')}
                disabled={isSaving}
                className="whitespace-nowrap px-2.5 py-1 text-xs font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 rounded-md transition-colors cursor-pointer disabled:opacity-50"
              >
                All A
              </button>
            </div>
          </div>

          {/* Row 2: Search Input + Live Badge Counts */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pt-1.5 border-t border-slate-200/70">
            <input
              type="text"
              placeholder="Search worker…"
              value={search}
              disabled={isSaving}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} !min-h-7 !h-7 !py-0 !px-2 text-xs rounded-md bg-white w-full sm:w-48`}
            />

            <div className="flex items-center gap-1.5 text-[11px] font-bold overflow-x-auto whitespace-nowrap">
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/80">
                {counts.p} P
              </span>
              <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80">
                {counts.hd} HD
              </span>
              <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/80">
                {counts.a} A
              </span>
              <span className="text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                Total: {counts.total}
              </span>
            </div>
          </div>
        </div>

        {/* Worker Cards / Row List (Perfect on Mobile & Desktop) */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          {loading ? (
            <div className="py-10 text-center">
              <Spinner label="Loading workers list…" />
            </div>
          ) : filteredWorkers.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-xs font-semibold">
              No workers found.
            </div>
          ) : (
            <div className="max-h-[50dvh] sm:max-h-[380px] overflow-y-auto divide-y divide-slate-100">
              {filteredWorkers.map((w) => {
                const currentStatus = attendanceMap[w._id] || 'P';
                return (
                  <div
                    key={w._id}
                    className="flex items-center justify-between p-2 sm:px-3 sm:py-2.5 gap-2 hover:bg-slate-50/80 transition-colors"
                  >
                    {/* Worker Info */}
                    <div className="min-w-0 flex-1 pr-1">
                      <p className="font-bold text-xs text-slate-900 truncate leading-tight">
                        {w.fullName}
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate mt-0.5">
                        <span className="font-semibold text-slate-500">{w.workerCode}</span>
                        {w.designation?.name ? ` · ${w.designation.name}` : ''}
                      </p>
                    </div>

                    {/* Quick P | HD | A Buttons with Generous Touch Targets */}
                    <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 shadow-2xs">
                      {/* P (Present) */}
                      <button
                        type="button"
                        onClick={() => setWorkerStatus(w._id, 'P')}
                        disabled={isSaving}
                        title="Present (Full Day)"
                        className={`min-w-10 sm:min-w-14 h-7.5 sm:h-7 px-2 text-xs font-black rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          currentStatus === 'P'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-emerald-800 hover:bg-emerald-50'
                        } disabled:opacity-50`}
                      >
                        P
                      </button>

                      {/* HD (Half Day) */}
                      <button
                        type="button"
                        onClick={() => setWorkerStatus(w._id, 'HD')}
                        disabled={isSaving}
                        title="Half-Day (4 Hours)"
                        className={`min-w-10 sm:min-w-14 h-7.5 sm:h-7 px-2 text-xs font-black rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          currentStatus === 'HD'
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'text-slate-600 hover:text-amber-800 hover:bg-amber-50'
                        } disabled:opacity-50`}
                      >
                        HD
                      </button>

                      {/* A (Absent) */}
                      <button
                        type="button"
                        onClick={() => setWorkerStatus(w._id, 'A')}
                        disabled={isSaving}
                        title="Absent"
                        className={`min-w-10 sm:min-w-14 h-7.5 sm:h-7 px-2 text-xs font-black rounded-md transition-all cursor-pointer whitespace-nowrap ${
                          currentStatus === 'A'
                            ? 'bg-rose-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-rose-800 hover:bg-rose-50'
                        } disabled:opacity-50`}
                      >
                        A
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer: Mobile-first Stacked / Flex Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <p className="text-[10px] sm:text-[11px] text-slate-400 order-2 sm:order-1 text-center sm:text-left">
            Tip: Click <strong className="text-slate-600 font-bold">Save & Next ➡️</strong> to rapidly advance dates.
          </p>

          <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5 order-1 sm:order-2">
            <button
              type="button"
              className={`${secondaryButton} !min-h-8 !h-8 !px-2.5 text-xs font-bold whitespace-nowrap text-center justify-center`}
              onClick={onClose}
              disabled={isSaving}
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving || loading || !workers.length}
              className={`${secondaryButton} !min-h-8 !h-8 !px-2.5 !bg-slate-700 !text-white hover:!bg-slate-800 text-xs font-bold whitespace-nowrap text-center justify-center disabled:opacity-60`}
            >
              {savingAction === 'save' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save'
              )}
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={isSaving || loading || !workers.length}
              className={`${primaryButton} !min-h-8 !h-8 !px-2.5 !bg-emerald-600 hover:!bg-emerald-700 !text-white text-xs font-bold whitespace-nowrap text-center justify-center disabled:opacity-60`}
            >
              {savingAction === 'next' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              ) : (
                'Save & Next ➡️'
              )}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
