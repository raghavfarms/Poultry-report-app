import { Dialog } from './AdminUi.jsx';
import { useEffect, useState, useMemo } from 'react';
import { api } from '../../api/client.js';
import { Alert, inputClass, secondaryButton, primaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';
import AttendanceEditHistory from './AttendanceEditHistory.jsx';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function AttendanceCorrectionModal({ worker, initialDate, onClose, onSuccess, supervisor = false }) {
  const [date, setDate] = useState(initialDate || getTodayString());
  const [dutyIn, setDutyIn] = useState('08:00');
  const [dutyOut, setDutyOut] = useState('17:00');
  const [lunchOut, setLunchOut] = useState('');
  const [lunchIn, setLunchIn] = useState('');
  const [sessionId, setSessionId] = useState(null);

  const [loadingExisting, setLoadingExisting] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // 1. Check if an existing session exists for this worker on the chosen date
  useEffect(() => {
    if (!worker?._id || !date) return;
    let cancelled = false;
    setLoadingExisting(true);
    setLoadError('');
    setError('');

    api(attendancePath(supervisor ? 'supervisor/sessions' : 'sessions', { workerId: worker._id, date, limit: 25 }))
      .then(({ items = [] }) => {
        if (cancelled) return;
        if (items.length > 1) { setLoadError('Multiple sessions exist for this day. Ask an administrator to review them.'); setSessionId(null); return; }
        if (items[0]) {
          const sess = items[0];
          setSessionId(sess._id);
          if (sess.dutyIn) {
            const inDate = new Date(sess.dutyIn);
            setDutyIn(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(inDate));
          }
          if (sess.dutyOut) {
            const outDate = new Date(sess.dutyOut);
            setDutyOut(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(outDate));
          } else {
            setDutyOut('');
          }
          if (sess.lunchOut) {
            const lOutDate = new Date(sess.lunchOut);
            setLunchOut(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(lOutDate));
          } else {
            setLunchOut('');
          }
          if (sess.lunchIn) {
            const lInDate = new Date(sess.lunchIn);
            setLunchIn(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(lInDate));
          } else {
            setLunchIn('');
          }
        } else {
          setSessionId(null);
          setDutyIn('08:00');
          setDutyOut('17:00');
          setLunchOut('');
          setLunchIn('');
        }
      })
      .catch((err) => { if (!cancelled) { setSessionId(null); setLoadError(err.message || 'Failed to load attendance.'); } })
      .finally(() => { if (!cancelled) setLoadingExisting(false); });
    return () => { cancelled = true; };
  }, [worker?._id, date, supervisor]);

  // Compute live duration
  const calculatedDuration = useMemo(() => {
    if (!dutyIn || !dutyOut) return null;
    const [inH, inM] = dutyIn.split(':').map(Number);
    const [outH, outM] = dutyOut.split(':').map(Number);
    const inMins = inH * 60 + inM;
    const outMins = outH * 60 + outM;
    const gross = outMins - inMins;
    if (gross <= 0) return 'Invalid: OUT must be after IN';

    let lunchMins = 0;
    if (lunchOut && lunchIn) {
      const [lOutH, lOutM] = lunchOut.split(':').map(Number);
      const [lInH, lInM] = lunchIn.split(':').map(Number);
      const lOutTotal = lOutH * 60 + lOutM;
      const lInTotal = lInH * 60 + lInM;
      lunchMins = lInTotal - lOutTotal;
      if (lunchMins <= 0) return 'Invalid: Lunch IN must be after Lunch OUT';
      if (lOutTotal < inMins || lInTotal > outMins) return 'Invalid: Lunch must be within Duty IN & OUT';
    }

    const net = Math.max(0, gross - lunchMins);
    const hrs = Math.floor(net / 60);
    const mins = net % 60;
    return lunchMins > 0 ? `${hrs}h ${mins}m (${lunchMins}m lunch deducted)` : `${hrs}h ${mins}m`;
  }, [dutyIn, dutyOut, lunchOut, lunchIn]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dutyIn) {
      setError('Duty IN time is required.');
      return;
    }
    if (dutyOut && calculatedDuration?.startsWith('Invalid')) {
      setError('Please resolve invalid duty or lunch times.');
      return;
    }

    if (loadingExisting || loadError) return;
    setSubmitting(true);
    setError('');

    try {
      await api(attendancePath(supervisor ? 'supervisor/sessions/correct' : 'sessions/correct'), {
        method: 'POST',
        body: JSON.stringify({
          workerId: worker._id,
          date,
          dutyIn,
          dutyOut: dutyOut || null,
          lunchOut: lunchOut || null,
          lunchIn: lunchIn || null,
          reason: 'Attendance edited',
          sessionId: sessionId || undefined,
        }),
      });

      onSuccess(`Attendance for ${worker.fullName} on ${date} corrected successfully.`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to correct attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog title="Edit attendance" onClose={onClose} busy={submitting} maxWidth="380px">
      <div className="w-full">
        {/* Header */}
        <p className="text-sm text-slate-600 font-medium">{worker.fullName} · {worker.workerCode}</p>

        {(error || loadError) && <div className="mt-2"><Alert type="error">{error || loadError}</Alert></div>}

        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
          {/* Date Selector */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500">
              Attendance Date *
            </label>
            <input
              type="date"
              aria-label="Attendance Date"
              required
              className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2 mt-1 text-xs font-semibold`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {loadingExisting && (
              <span className="text-[11px] text-emerald-700 animate-pulse">Checking existing session…</span>
            )}
            {!loadingExisting && sessionId && (
              <span className="text-[11px] font-semibold text-sky-700">✓ Existing session found — editing</span>
            )}
            {!loadingExisting && !sessionId && (
              <span className="text-[11px] text-slate-400">No session logged for this date — creating entry</span>
            )}
          </div>

          {/* Duty IN & OUT times */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500">
                Duty IN Time *
              </label>
              <input
                type="time"
                aria-label="Duty IN Time"
                required
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2 mt-1 text-sm font-semibold`}
                value={dutyIn}
                onChange={(e) => setDutyIn(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500">
                Duty OUT Time
              </label>
              <input
                type="time"
                aria-label="Duty OUT Time"
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2 mt-1 text-sm font-semibold`}
                value={dutyOut}
                onChange={(e) => setDutyOut(e.target.value)}
              />
              <span className="text-[10px] text-slate-400">Leave blank if still on duty</span>
            </div>
          </div>

          {/* Lunch OUT & IN times */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500">
                Lunch OUT (Start)
              </label>
              <input
                type="time"
                aria-label="Lunch OUT Time"
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2 mt-1 text-sm font-semibold`}
                value={lunchOut}
                onChange={(e) => setLunchOut(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500">
                Lunch IN (Return)
              </label>
              <input
                type="time"
                aria-label="Lunch IN Time"
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2 mt-1 text-sm font-semibold`}
                value={lunchIn}
                onChange={(e) => setLunchIn(e.target.value)}
              />
              <span className="text-[10px] text-slate-400">Optional lunch break</span>
            </div>
          </div>

          {/* Calculated Duration Pill */}
          {calculatedDuration && (
            <div
              className={`rounded-xl p-2 text-center text-xs font-bold ${
                calculatedDuration.startsWith('Invalid')
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              Duration: {calculatedDuration}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`${secondaryButton} !min-h-9 !px-3 !py-1 text-xs`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingExisting || Boolean(loadError)}
              className={`${primaryButton} !min-h-9 !px-3 !py-1 text-xs`}
            >
              {submitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
        <AttendanceEditHistory key={`${worker._id}-${date}`} workerId={worker._id} date={date} />
      </div>
    </Dialog>
  );
}


