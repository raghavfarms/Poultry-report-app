import { useState } from 'react';
import { Alert, Field, inputClass, primaryButton, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath, saveAttendance } from '../services/adminApi.js';
import { useAttendanceData, useDebounced, LoadState, Pager, Dialog, RemoteSelect, Status, panelClass, cellClass } from './AdminUi.jsx';

function MasterForm({ item, kind, firmId, onClose, onSaved }) {
  const isLocation = kind === 'work-locations';
  const [form, setForm] = useState({ name: item?.name || '', active: item?.active ?? true, type: item?.type || 'SHED', supervisor: item?.supervisor?._id || '',
    remarks: item?.remarks || '', order: item?.order || 0, configured: item?.birdCapacity != null, male: item?.birdCapacity?.male ?? '', female: item?.birdCapacity?.female ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  async function save(e) {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    const body = { name: form.name, active: form.active, ...(!item ? { firmId } : {}) };
    if (isLocation) Object.assign(body, { type: form.type, supervisor: form.supervisor || null, remarks: form.remarks, order: Number(form.order),
      birdCapacity: form.type === 'SHED' && form.configured ? { male: Number(form.male), female: Number(form.female) } : null });
    try { await saveAttendance(`${kind}${item ? `/${item._id}` : ''}`, body, item ? 'PATCH' : 'POST'); onSaved(`${isLocation ? 'Work location' : 'Designation'} saved.`); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <Dialog
      title={`${item ? 'Edit' : 'Add'} ${isLocation ? 'work location' : 'designation'}`}
      onClose={onClose}
      busy={busy}
      maxWidth="420px"
    >
      <form onSubmit={save} className="space-y-2.5">
        <Alert>{error}</Alert>
        <fieldset disabled={busy} className="space-y-2.5">
          <Field label="Name *">
            <input
              autoFocus
              required
              maxLength={100}
              placeholder={isLocation ? 'e.g. Shed 1' : 'e.g. Supervisor'}
              className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2.5 text-xs font-semibold rounded-lg`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          {isLocation && (
            <>
              <div className="grid grid-cols-[1.4fr_1fr] sm:grid-cols-2 gap-2">
                <Field label="Location type">
                  <select
                    className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 text-xs rounded-lg`}
                    value={form.type}
                    onChange={(e) => set('type', e.target.value)}
                  >
                    <option value="SHED">Shed</option>
                    <option value="MISCELLANEOUS">Miscellaneous</option>
                  </select>
                </Field>
                <Field label="Display order">
                  <input
                    className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 text-xs rounded-lg`}
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={form.order}
                    onChange={(e) => set('order', e.target.value)}
                  />
                </Field>
              </div>
              <RemoteSelect
                resource="workers"
                firmId={firmId}
                supervisor
                label="Supervisor / in-charge"
                value={form.supervisor}
                selectedLabel={item?.supervisor?.fullName}
                onChange={(value) => set('supervisor', value)}
              />
              {form.type === 'SHED' && (
                <section className="space-y-1.5 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2 sm:p-2.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                      checked={form.configured}
                      onChange={(e) => set('configured', e.target.checked)}
                    />
                    <span>Set bird capacity</span>
                  </label>
                  <p className="text-[10.5px] text-slate-500 leading-tight">
                    Capacity is the number of birds the shed can accommodate.
                  </p>
                  {form.configured ? (
                    <>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        {['male', 'female'].map((key) => (
                          <Field key={key} label={`${key === 'male' ? 'Male' : 'Female'} capacity *`}>
                            <input
                              required
                              type="number"
                              min="0"
                              max="1000000000"
                              step="1"
                              className={`${inputClass} !min-h-7.5 !h-7.5 !py-0.5 !px-2 text-xs rounded-lg`}
                              value={form[key]}
                              onChange={(e) => set(key, e.target.value)}
                            />
                          </Field>
                        ))}
                      </div>
                      <p className="text-[11px] font-bold text-emerald-900">
                        Total: {(Number(form.male) + Number(form.female)).toLocaleString('en-IN')} birds
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] font-medium text-amber-800">Capacity not configured.</p>
                  )}
                </section>
              )}
              {form.type === 'MISCELLANEOUS' && item?.birdCapacity && (
                <p className="text-[11px] text-amber-800">Saving as miscellaneous will clear bird capacity.</p>
              )}
              <Field label="Remarks">
                <textarea
                  rows={2}
                  className={`${inputClass} !min-h-12 !h-12 !py-1.5 !px-2.5 text-xs rounded-lg resize-none`}
                  maxLength={1000}
                  placeholder="Optional remarks…"
                  value={form.remarks}
                  onChange={(e) => set('remarks', e.target.value)}
                />
              </Field>
            </>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            <span>Active</span>
          </label>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              className={`${secondaryButton} !min-h-7.5 !h-7.5 !px-3.5 text-xs font-semibold rounded-lg cursor-pointer`}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className={`${primaryButton} !min-h-7.5 !h-7.5 !px-4 text-xs font-bold rounded-lg cursor-pointer`}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export default function MastersPanel({ kind, firmId, revision, onChanged }) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isLocation = kind === 'work-locations';
  const state = useAttendanceData(attendancePath(kind, { firmId, search: useDebounced(search), active, page, limit }), revision);
  async function toggle(item) {
    setBusy(true); setError('');
    try { await saveAttendance(`${kind}/${item._id}`, { active: !item.active }, 'PATCH'); onChanged(`${item.name} ${item.active ? 'deactivated' : 'activated'}.`); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className={`${panelClass} space-y-4`}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">{isLocation ? 'Sheds & work locations' : 'Designations'}</h2><p className="text-sm text-slate-500">{isLocation ? 'Manage sheds, supervisors and bird capacities.' : 'Define the roles used when deploying workers.'}</p></div><button className={`${primaryButton} w-full sm:w-auto !min-h-10`} disabled={!firmId} onClick={() => setEditor({ item: null })}>+ Add {isLocation ? 'location' : 'designation'}</button></div>
    {!firmId && <p className="text-sm text-amber-800">Select a firm above to add a record.</p>}
    <Alert>{error}</Alert>
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-[1fr_180px]"><input aria-label="Search names" className={inputClass} placeholder="Search by name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /><select aria-label="Active status" className={inputClass} value={active} onChange={(e) => { setActive(e.target.value); setPage(1); }}><option value="">All statuses</option><option value="true">Active</option><option value="false">Inactive</option></select></div>
    <LoadState state={state}>
      {!state.data?.items.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">No matching {isLocation ? 'locations' : 'designations'}.</p> : <div className="overflow-x-auto"><table className="attendance-table w-full"><thead className="bg-slate-50 text-slate-500"><tr>{['Name', 'Firm', ...(isLocation ? ['Supervisor', 'Bird capacity'] : []), 'Status', 'Actions'].map((label) => <th key={label} className={cellClass}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{state.data.items.map((item) => <tr key={item._id}>
        <td data-label="Name" className={cellClass}><p className="font-semibold">{item.name}</p>{isLocation && <p className="text-xs text-slate-500">{item.type === 'SHED' ? 'Shed' : 'Miscellaneous'}</p>}</td><td data-label="Firm" className={cellClass}>{item.firm?.name}</td>
        {isLocation && <><td data-label="Supervisor" className={cellClass}>{item.supervisor?.fullName || 'Unassigned'}</td><td data-label="Bird capacity" className={cellClass}>{item.type !== 'SHED' ? '—' : item.birdCapacity ? <><p className="font-semibold">{item.birdCapacity.total.toLocaleString('en-IN')} total</p><p className="whitespace-nowrap text-xs text-slate-500">Male {item.birdCapacity.male.toLocaleString('en-IN')} · Female {item.birdCapacity.female.toLocaleString('en-IN')}</p></> : <span className="text-amber-800">Not configured</span>}</td></>}
        <td data-label="Status" className={cellClass}><Status active={item.active} /></td><td data-label="Actions" className={cellClass}><div className="grid grid-cols-2 sm:flex sm:gap-2"><button className={`${secondaryButton} !min-h-9 !px-3 !py-1 text-xs`} onClick={() => setEditor({ item })}>Edit</button><button className={`${secondaryButton} !min-h-9 !px-3 !py-1 text-xs`} disabled={busy} onClick={() => toggle(item)}>{item.active ? 'Deactivate' : 'Activate'}</button></div></td>
      </tr>)}</tbody></table></div>}
      <Pager pagination={state.data?.pagination} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
    </LoadState>
    {editor && <MasterForm item={editor.item} kind={kind} firmId={editor.item?.firm?._id || firmId} onClose={() => setEditor(null)} onSaved={(message) => { setEditor(null); onChanged(message); }} />}
  </section>;
}
