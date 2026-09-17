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
  return (
    <div className="overflow-x-auto">
      <table className="attendance-table w-full min-w-[650px]">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            {['Worker', 'Firm / location', 'Designation / supervisor', 'Start Date', 'Reason'].map((label) => (
              <th
                key={label}
                className={`${cellClass} ${
                  label === 'Worker'
                    ? 'sticky left-0 z-20 bg-slate-50 border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] min-w-[130px] whitespace-nowrap'
                    : ''
                }`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((row) => (
            <tr key={row._id} className="hover:bg-slate-50/80 group">
              <td
                data-label="Worker"
                className={`${cellClass} sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] min-w-[130px]`}
              >
                <p className="font-semibold text-slate-900 truncate max-w-[130px]">{row.workerNameSnapshot}</p>
                <p className="text-xs text-slate-500 font-mono">{row.workerCodeSnapshot}</p>
              </td>
              <td data-label="Firm / location" className={cellClass}>
                <p className="font-medium text-slate-800">{row.firmNameSnapshot}</p>
                <p className="text-xs text-slate-500">{row.workLocationNameSnapshot}</p>
              </td>
              <td data-label="Designation / supervisor" className={cellClass}>
                <p className="font-medium text-slate-800">{row.designationNameSnapshot}</p>
                <p className="text-xs text-slate-500">{row.supervisorNameSnapshot || 'No supervisor'}</p>
              </td>
              <td data-label="Start Date" className={`${cellClass} whitespace-nowrap`}>
                {dateTime(row.effectiveFrom)}
              </td>
              <td data-label="Reason" className={cellClass}>
                <p className="text-slate-800">{row.reason}</p>
                <p className="text-xs text-slate-500">{row.allocationType.replaceAll('_', ' ')}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  return (
    <section className={`${panelClass} space-y-3`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Worker deployment</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            View current shed assignments of active workers.
          </p>
        </div>
      </div>

      {firmId && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          {/* Worker Filter */}
          <select
            aria-label="Filter by Worker"
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium outline-none transition shrink-0 cursor-pointer ${
              worker
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
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

          {/* Work Location Filter */}
          <select
            aria-label="Filter by Work location"
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium outline-none transition shrink-0 cursor-pointer ${
              location
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
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

          {/* Supervisor Filter */}
          <select
            aria-label="Filter by Supervisor"
            className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium outline-none transition shrink-0 cursor-pointer ${
              supervisor
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
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

          {/* Reset Filters chip */}
          {(Boolean(worker) || Boolean(location) || Boolean(supervisor)) && (
            <button
              type="button"
              onClick={() => {
                setWorker('');
                setLocation('');
                setSupervisor('');
                setPage(1);
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 shrink-0 cursor-pointer"
            >
              ✕ Reset
            </button>
          )}
        </div>
      )}

      <LoadState state={state}>
        <DeploymentTable items={state.data?.items} />
        <Pager pagination={state.data?.pagination} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
      </LoadState>
    </section>
  );
}
