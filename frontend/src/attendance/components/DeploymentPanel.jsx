import { useEffect, useMemo, useState } from 'react';
import { Alert, Field, inputClass, primaryButton, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath, saveAttendance } from '../services/adminApi.js';
import { useAttendanceData, LoadState, Pager, Dialog, RemoteSelect, dateTime, panelClass, cellClass } from './AdminUi.jsx';

export function InitialDeploymentForm({ worker, onClose, onSaved }) {
  const [form, setForm] = useState({ workLocation: '', supervisor: '', effectiveFrom: worker.dateOfJoining, reason: 'Initial deployment' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  async function save(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await saveAttendance(`workers/${worker._id}/initial-deployment`, { ...form, supervisor: form.supervisor || null }); onSaved('Initial deployment saved.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Dialog title={`Assign ${worker.fullName}`} onClose={onClose} busy={busy} maxWidth="420px">
      <form onSubmit={save} className="space-y-2.5">
        <Alert>{error}</Alert>
        <p className="text-xs text-slate-500 font-medium">{worker.firm?.name || ''} · {worker.designation?.name || ''}</p>
        <fieldset disabled={busy} className="space-y-2.5">
          <RemoteSelect required label="Work location" resource="work-locations" firmId={worker.firm?._id || worker.firm} value={form.workLocation} onChange={(value) => set('workLocation', value)} />
          <RemoteSelect label="Supervisor" resource="workers" supervisor firmId={worker.firm?._id || worker.firm} value={form.supervisor} onChange={(value) => set('supervisor', value)} />
          <Field label="Start Date">
            <input type="date" required min={worker.dateOfJoining} className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 text-xs rounded-lg`} value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
          </Field>
          <Field label="Reason">
            <textarea rows={2} required maxLength={1000} className={`${inputClass} !min-h-12 !h-12 !py-1.5 !px-2 text-xs rounded-lg resize-none`} value={form.reason} onChange={(e) => set('reason', e.target.value)} />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button type="button" className={`${secondaryButton} !min-h-7.5 !h-7.5 !px-3.5 text-xs font-semibold rounded-lg`} onClick={onClose} disabled={busy}>Cancel</button>
            <button disabled={busy || !form.workLocation} className={`${primaryButton} !min-h-7.5 !h-7.5 !px-4 text-xs font-bold rounded-lg`}>{busy ? 'Saving…' : 'Save deployment'}</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export function DeploymentTable({ items = [] }) {
  if (!items.length) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No deployments match this selection.</p>;
  return <div className="overflow-x-auto"><table className="attendance-table w-full"><thead className="bg-slate-50 text-slate-500"><tr>{['Worker', 'Firm / location', 'Designation / supervisor', 'Start Date', 'Reason'].map((label) => <th key={label} className={cellClass}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{items.map((row) => <tr key={row._id}>
    <td data-label="Worker" className={cellClass}><p className="font-semibold">{row.workerNameSnapshot}</p><p className="text-xs text-slate-500">{row.workerCodeSnapshot}</p></td>
    <td data-label="Firm / location" className={cellClass}><p>{row.firmNameSnapshot}</p><p className="text-xs text-slate-500">{row.workLocationNameSnapshot}</p></td>
    <td data-label="Designation / supervisor" className={cellClass}><p>{row.designationNameSnapshot}</p><p className="text-xs text-slate-500">{row.supervisorNameSnapshot || 'No supervisor'}</p></td>
    <td data-label="Start Date" className={`${cellClass} whitespace-nowrap`}>{dateTime(row.effectiveFrom)}</td>
    <td data-label="Reason" className={cellClass}><p>{row.reason}</p><p className="text-xs text-slate-500">{row.allocationType.replaceAll('_', ' ')}</p></td>
  </tr>)}</tbody></table></div>;
}

export default function DeploymentPanel({ firmId, revision }) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [location, setLocation] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [worker, setWorker] = useState('');

  const workersState = useAttendanceData(
    firmId ? attendancePath('workers', { firmId, active: true, limit: 100 }) : null,
    revision
  );
  const locationsState = useAttendanceData(
    firmId ? attendancePath('work-locations', { firmId, active: true, limit: 100 }) : null,
    revision
  );
  const supervisorsState = useAttendanceData(
    firmId ? attendancePath('workers', { firmId, active: true, isSupervisor: true, limit: 100 }) : null,
    revision
  );

  const workers = workersState.data?.items || [];
  const locations = locationsState.data?.items || [];
  const supervisors = supervisorsState.data?.items || [];

  useEffect(() => {
    setWorker('');
    setLocation('');
    setSupervisor('');
  }, [firmId]);

  const now = useMemo(() => new Date().toISOString(), [revision]);
  const state = useAttendanceData(
    attendancePath('deployments', { firmId, workLocation: location, supervisor, workerId: worker, at: now, page, limit }),
    revision
  );
  const change = (setter, value) => { setter(value); setPage(1); };
  return <section className={`${panelClass} space-y-4`}>
    <div><h2 className="text-lg font-bold">Worker deployment</h2><p className="text-sm text-slate-500">View current shed assignments of active workers.</p></div>
    {firmId && (
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-3 items-center">
        <Field label="Worker">
          <select
            aria-label="Filter by Worker"
            className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
            value={worker}
            onChange={(e) => change(setWorker, e.target.value)}
          >
            <option value="">All Workers</option>
            {workers.map((w) => (
              <option key={w._id} value={w._id}>
                {w.fullName} ({w.workerCode})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Work location">
          <select
            aria-label="Filter by Work location"
            className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
            value={location}
            onChange={(e) => change(setLocation, e.target.value)}
          >
            <option value="">All Work Locations</option>
            {locations.map((loc) => (
              <option key={loc._id} value={loc._id}>
                {loc.name} {loc.type ? `(${loc.type})` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Supervisor">
          <select
            aria-label="Filter by Supervisor"
            className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
            value={supervisor}
            onChange={(e) => change(setSupervisor, e.target.value)}
          >
            <option value="">All Supervisors</option>
            {supervisors.map((s) => (
              <option key={s._id} value={s._id}>
                {s.fullName} ({s.workerCode})
              </option>
            ))}
          </select>
        </Field>
      </div>
    )}
    <LoadState state={state}>
      <DeploymentTable items={state.data?.items} />
      <Pager pagination={state.data?.pagination} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
    </LoadState>
  </section>;
}
