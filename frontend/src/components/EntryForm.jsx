import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { formatMinutes, splitMinutes, today } from '../utils/date.js';
import { Alert, Field, inputClass, primaryButton, secondaryButton, Spinner } from './Ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const emptyRow = (asset) => ({ asset: asset._id, runningMinutes: 0, refillLiters: 0, isFull: false, serviceDone: false });

function TimeInput({ value, onChange, maxHours = 24, disabled = false }) {
  const { hours, minutes } = splitMinutes(value);
  const change = (part, raw) => {
    const next = Math.max(0, Number(raw || 0));
    const total = part === 'hours' ? Math.min(maxHours, next) * 60 + minutes : hours * 60 + Math.min(59, next);
    onChange(Math.min(maxHours * 60, total));
  };
  const compactClass = 'no-number-spinner h-6 min-w-0 w-full rounded border border-slate-300 bg-white px-1 text-center text-xs outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-100 disabled:bg-slate-100';
  return <div className="grid grid-cols-[42px_42px] items-center gap-1"><input disabled={disabled} aria-label="Hours" placeholder="Hr" type="number" min="0" max={maxHours} value={hours || ''} onChange={(e) => change('hours', e.target.value)} className={compactClass} /><input disabled={disabled} aria-label="Minutes" placeholder="Min" type="number" min="0" max="59" value={minutes || ''} onChange={(e) => change('minutes', e.target.value)} className={compactClass} /></div>;
}

const compactInput = 'no-number-spinner h-6 w-[42px] min-w-0 rounded border border-slate-300 bg-white px-1 text-center text-xs outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-100';

function CompactField({ label, children, className = '' }) {
  return <div className={`min-w-0 ${className}`}>{children}</div>;
}

export default function EntryForm({ firms, initialFirmId, initialDate, onSaved, onCancel }) {
  const { user } = useAuth();
  const [firmId, setFirmId] = useState(initialFirmId || firms[0]?._id || '');
  const [date, setDate] = useState(initialDate || '');
  const [assets, setAssets] = useState([]); const [rows, setRows] = useState([]); const [baseService, setBaseService] = useState({});
  const [opening, setOpening] = useState(0); const [dieselIn, setDieselIn] = useState(0); const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('');

  useEffect(() => { if (!firmId && firms[0]) setFirmId(firms[0]._id); }, [firms, firmId]);
  useEffect(() => {
    if (!firmId) return;
    let active = true; setLoading(true); setError('');
    Promise.all([api(`/assets/firm/${firmId}`), initialDate ? Promise.resolve({ date: initialDate }) : api(`/entries/default-date?firmId=${firmId}`)])
      .then(([assetData, dateData]) => {
        if (!active) return; setAssets(assetData.assets); setDate(initialDate || dateData.date);
      }).catch((err) => setError(err.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [firmId, initialDate]);

  useEffect(() => {
    if (!firmId || !date || loading) return;
    let active = true; setLoading(true); setError('');
    Promise.all([api(`/entries/opening?firmId=${firmId}&date=${date}`), api(`/entries/service-status?firmId=${firmId}&date=${date}`)])
      .then(([openingData, serviceData]) => {
        if (!active) return;
        const current = openingData.entry;
        const old = new Map((current?.assetEntries || []).map((item) => [String(item.asset), item]));
        setOpening(openingData.openingLiters); setDieselIn(current?.dieselInLiters || 0); setNote(current?.note || '');
        setRows(assets.map((asset) => old.has(String(asset._id)) ? { ...emptyRow(asset), ...old.get(String(asset._id)), asset: asset._id } : emptyRow(asset)));
        setBaseService(Object.fromEntries(serviceData.statuses.map((item) => [item.asset, item])));
      }).catch((err) => setError(err.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [firmId, date, assets]);

  const updateRow = (assetId, patch) => setRows((values) => values.map((row) => row.asset === assetId ? { ...row, ...patch } : row));
  const totalRefill = useMemo(() => rows.reduce((sum, row) => sum + Number(row.refillLiters || 0), 0), [rows]);
  const lightMinutes = useMemo(() => Math.min(1440, rows.reduce((sum, row) => {
    const asset = assets.find((item) => item._id === row.asset);
    return asset?.category === 'genset' ? sum + Number(row.runningMinutes || 0) : sum;
  }, 0)), [rows, assets]);
  const closing = Number(opening || 0) + Number(dieselIn || 0) - totalRefill;

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(`/entries/${firmId}/${date}`, { method: 'PUT', body: JSON.stringify({ dieselInLiters: Number(dieselIn || 0), lightConsumptionMinutes: lightMinutes, assetEntries: rows, note }) });
      onSaved?.({ firmId, date });
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };

  if (loading && !date) return <Spinner label="Preparing daily form…" />;
  return <form onSubmit={submit} className="mx-auto w-full max-w-md rounded-lg border border-emerald-200 bg-white p-2 shadow-sm">
    <div className="mb-2 flex items-start justify-between gap-2"><div><p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Daily entry</p><h2 className="text-base font-bold text-slate-900">Diesel consumption</h2></div><button type="button" onClick={onCancel} className={`${secondaryButton} !min-h-8 !rounded-lg !px-3 !py-1 !text-xs`}>Close</button></div>
    <Alert>{error}</Alert>
    <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_70px] items-start gap-2">
      <Field label="Firm"><select className={`${inputClass} !min-h-8 !rounded-md !px-2 !py-0.5`} value={firmId} onChange={(e) => setFirmId(e.target.value)}>{firms.map((firm) => <option key={firm._id} value={firm._id}>{firm.name}</option>)}</select></Field>
      <Field label="Entry date"><input required type="date" className={`${inputClass} cursor-pointer !min-h-8 !rounded-md !px-2 !py-0.5`} value={date} max={user.role === 'admin' ? undefined : today()} onClick={(e) => e.currentTarget.showPicker?.()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Diesel IN"><input type="number" min="0" step="0.01" className={`${inputClass} !min-h-8 !rounded-md !px-2 !py-0.5`} value={Number(dieselIn) === 0 ? '' : dieselIn} onChange={(e) => setDieselIn(e.target.value)} /></Field>
    </div>

    <div className="mt-2.5">
      {!assets.length && <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">No active assets exist for this firm. An admin must add gensets or tractors under <b>Firms & Assets</b>.</div>}
      {!!assets.length && <div className="w-[382px] max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[110px_88px_48px_48px_56px] gap-1 border-b border-slate-200 bg-slate-100 px-2 py-1 text-[8px] font-bold uppercase tracking-wide text-slate-500">
          <span>Asset</span><span>Running hr</span><span>Refill</span><span>Avg</span><span>Is full</span>
        </div>
      {assets.map((asset) => {
        const row = rows.find((item) => item.asset === asset._id) || emptyRow(asset);
        const serviceMinutes = row.serviceDone ? 0 : Number(baseService[asset._id]?.runningMinutes || 0) + Number(row.runningMinutes || 0);
        const serviceDue = serviceMinutes >= asset.serviceIntervalMinutes;
        return <section key={asset._id} className="grid grid-cols-[110px_88px_48px_48px_56px] items-center gap-1 border-b border-slate-200 bg-slate-50/60 px-2 py-1.5 last:border-b-0">
          <div>
            <h3 className="break-words text-sm font-bold text-slate-900">{asset.label}</h3>
            <p className={`text-[9px] ${serviceDue ? 'font-bold text-red-600' : 'text-slate-500'}`}>Service {formatMinutes(serviceMinutes)} / {Math.round(asset.serviceIntervalMinutes / 60)}h</p>
            {row.serviceDone ? <button type="button" onClick={() => updateRow(asset._id, { serviceDone: false })} className="mt-0.5 text-left text-[9px] font-bold text-emerald-700">✓ Service marked done</button> : serviceDue ? <button type="button" onClick={() => updateRow(asset._id, { serviceDone: true })} className="mt-0.5 text-left text-[9px] font-black text-red-600 underline">Service due — mark done</button> : null}
          </div>
          <div className="contents">
            <CompactField label="Running"><TimeInput value={row.runningMinutes} onChange={(value) => updateRow(asset._id, { runningMinutes: value })} /></CompactField>
            <CompactField label="Refill (L)"><input aria-label={`${asset.label} refill diesel`} type="number" min="0" step="0.01" placeholder="L" className={compactInput} value={Number(row.refillLiters) === 0 ? '' : row.refillLiters} onChange={(e) => { const refillLiters = e.target.value; updateRow(asset._id, { refillLiters, isFull: Number(refillLiters) > 0 }); }} /></CompactField>
            <CompactField label="Average"><div className="flex h-6 items-center px-1 text-xs text-slate-500">Auto</div></CompactField>
            <CompactField label="Is full"><label className="flex h-6 items-center gap-1.5 px-1"><input aria-label={`${asset.label} tank is full`} type="checkbox" checked={row.isFull} onChange={(e) => updateRow(asset._id, { isFull: e.target.checked })} className="h-3.5 w-3.5 shrink-0 accent-emerald-700" /><span className="text-xs">Full</span></label></CompactField>
          </div>
        </section>;
      })}
      </div>}
    </div>

    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-[120px_92px_92px]">
      <Field label="Generator light"><div className="flex h-7 items-center rounded bg-slate-100 px-2 text-xs font-semibold">{formatMinutes(lightMinutes)}</div></Field>
      <Field label="Diesel used"><div className="flex h-7 items-center rounded bg-slate-100 px-2 text-xs font-bold">{totalRefill.toFixed(2)} L</div></Field>
      <Field label="Closing"><div className={`flex h-7 items-center rounded bg-slate-100 px-2 text-xs font-bold ${closing < 0 ? 'text-red-700' : ''}`}>{closing.toFixed(2)} L</div></Field>
    </div>
    <div className="mt-2.5 flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className={`${secondaryButton} !min-h-8 !rounded-lg !px-3 !py-1 !text-xs`}>Cancel</button><button disabled={saving || loading || closing < 0} className={`${primaryButton} !min-h-8 !rounded-lg !px-3 !py-1 !text-xs`}>{saving ? 'Saving…' : 'Save'}</button></div>
  </form>;
}
