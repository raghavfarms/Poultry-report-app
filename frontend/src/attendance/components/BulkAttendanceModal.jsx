import { useState, useEffect, useMemo } from 'react';
import { Dialog } from './AdminUi.jsx';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton, primaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

function getYesterdayString() {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const [y, m, d] = todayStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d - 1));
  return dateObj.toISOString().slice(0, 10);
}

export default function BulkAttendanceModal({ firmId, initialDate, onClose, onSuccess }) {
  const [date, setDate] = useState(initialDate || getYesterdayString());
  const [workers, setWorkers] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({}); // workerId -> 'P' | 'HD' | 'A'
  const [initialMap, setInitialMap] = useState({}); // workerId -> initial loaded status
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingAction, setSavingAction] = useState(null); // 'save' | 'next' | null
  const isSaving = Boolean(savingAction);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 1. Fetch exact daily attendance report for the selected date
  useEffect(() => {
    if (!firmId || !date) return;
    let isMounted = true;
    setLoading(true);
    setError('');

    api(attendancePath('reports/daily', { firmId, date }))
      .then((res) => {
        if (!isMounted) return;
        const records = res?.records || [];
        const workerList = records.map((r) => ({
          _id: r.workerId,
          fullName: r.workerName,
          workerCode: r.workerCode,
          workLocationName: r.workLocationName,
          designation: { name: r.designationName },
        }));
        setWorkers(workerList);

        const map = {};
        records.forEach((r) => {
          let st = 'A';
          if (r.status === 'COMPLETED' || r.status === 'ON_DUTY' || r.status === 'PRESENT') {
            st = 'P';
          } else if (r.status === 'HALF_DAY') {
            st = 'HD';
          } else {
            st = 'A';
          }
          map[r.workerId] = st;
        });

        setAttendanceMap(map);
        setInitialMap(map);
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

    const advanceDate = () => {
      const currentParts = date.split('-').map(Number);
      const nextDateObj = new Date(currentParts[0], currentParts[1] - 1, currentParts[2] + 1, 12, 0, 0);
      const nextDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(nextDateObj);
      setDate(nextDateStr);
      return nextDateStr;
    };

    // Filter only workers whose status was changed by the user
    const changedRecords = workers
      .filter((w) => attendanceMap[w._id] !== initialMap[w._id])
      .map((w) => ({
        workerId: w._id,
        status: attendanceMap[w._id] || 'A',
      }));

    if (changedRecords.length === 0) {
      if (advanceNextDay) {
        const nextDateStr = advanceDate();
        setNotice(`No changes made on ${date}. Moved to ${nextDateStr}.`);
      } else {
        onClose();
      }
      return;
    }

    setSavingAction(advanceNextDay ? 'next' : 'save');
    setError('');
    setNotice('');

    try {
      await api(attendancePath('sessions/bulk-day'), {
        method: 'POST',
        body: JSON.stringify({
          firmId,
          date,
          records: changedRecords,
          defaultDutyIn: '08:00',
          defaultDutyOut: '17:00',
          reason: 'Bulk muster roll entry',
        }),
      });

      const successMsg = `✅ Saved ${date}: ${counts.p} P, ${counts.hd} HD, ${counts.a} A (${changedRecords.length} updated).`;
      if (onSuccess) onSuccess(successMsg);

      if (advanceNextDay) {
        const nextDateStr = advanceDate();
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
          {/* Row 1: Date + Live Badge Counts */}
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

            <div className="flex items-center gap-1.5 text-[11px] font-bold overflow-x-auto whitespace-nowrap py-0.5">
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

          {/* Row 2: Search Input */}
          <div className="pt-1.5 border-t border-slate-200/70">
            <input
              type="text"
              placeholder="Search worker by name or code…"
              value={search}
              disabled={isSaving}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} !min-h-7.5 !h-7.5 !py-0 !px-2.5 text-xs rounded-md bg-white w-full`}
            />
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
                const currentStatus = attendanceMap[w._id] || 'A';
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
                        title="Present"
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
