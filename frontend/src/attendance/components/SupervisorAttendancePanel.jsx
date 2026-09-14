import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Alert, inputClass, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';
import AttendanceCorrectionModal from './AttendanceCorrectionModal.jsx';

export default function SupervisorAttendancePanel() {
  const [date, setDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()));
  const [workers, setWorkers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api(attendancePath('supervisor/workers', { date })).then(data => {
      if (!cancelled) setWorkers(data.items);
    }).catch(err => { if (!cancelled) { setWorkers([]); setError(err.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);
  return <section className="space-y-3 rounded-xl border bg-white p-4">
    <h2 className="font-bold text-slate-900">Team attendance corrections</h2>
    <p className="text-sm text-slate-600">Correct missed scans for workers assigned to you. Enter the actual duty times and a reason. Every change is recorded for admin review.</p>
    <label className="block text-sm">Attendance date
      <input type="date" required className={inputClass} value={date} onChange={e => { if (e.target.value) setDate(e.target.value); }} />
    </label>
    <Alert>{error}</Alert>
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {loading ? <p className="text-sm">Loading assigned workers...</p> : workers.length === 0 ? <p className="text-sm text-slate-500">No workers assigned to you on this date.</p> :
      workers.map(worker => <div key={worker._id} className="flex items-center justify-between gap-2 border-t pt-2">
        <div><p className="font-semibold">{worker.fullName}</p><p className="text-xs text-slate-500">{worker.workerCode}</p></div>
        <button type="button" className={secondaryButton} onClick={() => { setNotice(''); setSelected(worker); }}>Correct</button>
      </div>)}
    {selected && <AttendanceCorrectionModal supervisor worker={selected} initialDate={date} onClose={() => setSelected(null)} onSuccess={setNotice} />}
  </section>;
}
