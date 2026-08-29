import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';
import { addDays, today } from '../utils/date.js';
import { Alert, inputClass, primaryButton, secondaryButton, Spinner } from './Ui.jsx';
import EntryForm from './EntryForm.jsx';
import ReportView from './ReportView.jsx';

const openDatePicker = (event) => event.currentTarget.showPicker?.();

export default function DieselReports({ compact = false }) {
  const [firms, setFirms] = useState([]); const [firmFilter, setFirmFilter] = useState('all');
  const [to, setTo] = useState(today()); const [from, setFrom] = useState(addDays(today(), -6));
  const [reports, setReports] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [form, setForm] = useState(null);

  useEffect(() => { api('/firms').then(({ firms }) => setFirms(firms)).catch((err) => setError(err.message)); }, []);
  const visibleFirms = useMemo(() => firmFilter === 'all' ? firms : firms.filter((firm) => firm._id === firmFilter), [firms, firmFilter]);
  const load = useCallback(async () => {
    if (!visibleFirms.length) { setReports([]); setLoading(false); return; }
    setLoading(true); setError('');
    try { setReports(await Promise.all(visibleFirms.map((firm) => api(`/entries/report?firmId=${firm._id}&from=${from}&to=${to}`)))); }
    catch (err) { setError(err.message); } finally { setLoading(false); }
  }, [visibleFirms, from, to]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => setForm({ firmId: firmFilter === 'all' ? firms[0]?._id : firmFilter, date: null });
  const openEdit = (report, row) => setForm({ firmId: report.firm._id, date: row.date });
  const saved = () => { setForm(null); load(); };
  const resetService = async (report, asset) => {
    if (!window.confirm(`Mark ${asset.label} service as completed today and reset its counter?`)) return;
    setError('');
    try { await api(`/entries/service-reset/${report.firm._id}/${asset.id}`, { method: 'POST' }); await load(); }
    catch (err) { setError(err.message); }
  };

  const exportCsv = () => {
    const lines = [['Firm','Date','Status','Opening','IN','Asset','Running minutes','Refill L','Average L/H','Full','Service due','Light minutes','Electricity minutes','Diesel consumed L','Closing']];
    for (const report of reports) for (const row of report.rows) {
      if (row.missing) lines.push([report.firm.name,row.date,'Missing',row.openingLiters,'','','','','','','','','','',row.closingLiters]);
      else if (!row.assetEntries.length) lines.push([report.firm.name,row.date,'Completed',row.openingLiters,row.dieselInLiters,'','','','','','',row.lightConsumptionMinutes,row.electricityConsumptionMinutes,row.dieselConsumptionLiters,row.closingLiters]);
      else for (const item of row.assetEntries) lines.push([report.firm.name,row.date,'Completed',row.openingLiters,row.dieselInLiters,item.label,item.runningMinutes,item.refillLiters,item.averageLitersPerHour ?? '',item.isFull ? 'Yes' : 'No',item.service.due ? 'Yes' : 'No',row.lightConsumptionMinutes,row.electricityConsumptionMinutes,row.dieselConsumptionLiters,row.closingLiters]);
    }
    const csv = lines.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = `diesel-report-${from}-to-${to}.csv`; link.click(); URL.revokeObjectURL(link.href);
  };

  const reportControls = <div className="no-print flex flex-wrap items-end gap-2"><label className="grid w-40 gap-1 text-xs font-bold text-slate-500">Firm<select className={`${inputClass} !min-h-9 !rounded-lg !px-2 !py-1 !text-xs`} value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)}><option value="all">All firms</option>{firms.map((firm) => <option key={firm._id} value={firm._id}>{firm.name}</option>)}</select></label><label className="grid w-40 gap-1 text-xs font-bold text-slate-500">From<input className={`${inputClass} !min-h-9 cursor-pointer !rounded-lg !px-2 !py-1 !text-xs`} type="date" value={from} onClick={openDatePicker} onChange={(e) => setFrom(e.target.value)} /></label><label className="grid w-40 gap-1 text-xs font-bold text-slate-500">To<input className={`${inputClass} !min-h-9 cursor-pointer !rounded-lg !px-2 !py-1 !text-xs`} type="date" value={to} onClick={openDatePicker} onChange={(e) => setTo(e.target.value)} /></label><button onClick={exportCsv} className={`${secondaryButton} !min-h-9 w-40 !rounded-lg !py-1`}>Export CSV</button><button onClick={() => window.print()} className={`${secondaryButton} !min-h-9 w-40 !rounded-lg !py-1`}>Print</button><button onClick={openNew} disabled={!firms.length} className={`${primaryButton} !min-h-9 w-40 !rounded-lg !py-1`}>＋ Add entry</button></div>;

  return <div className="space-y-3">
    <div>{!compact && <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">First reporting module</p>}<h2 className={`${compact ? 'text-xl' : 'mt-1 text-2xl'} font-black text-slate-900`}>Diesel Consumption</h2>{!compact && <p className="mt-1 text-sm text-slate-500">Newest date first · each firm is shown separately</p>}</div>
    <Alert>{error}</Alert>
    {form && <div role="dialog" aria-modal="true" aria-label="Daily diesel entry" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-3 pt-6 backdrop-blur-[1px] sm:items-center sm:p-6" onMouseDown={() => setForm(null)}>
      <div className="w-full max-w-md" onMouseDown={(event) => event.stopPropagation()}>
        <EntryForm firms={firms} initialFirmId={form.firmId} initialDate={form.date} onSaved={saved} onCancel={() => setForm(null)} />
      </div>
    </div>}
    {loading ? <Spinner label="Loading report…" /> : reports.length ? <div className="space-y-3">{reports.map((report, index) => <ReportView key={report.firm._id} report={report} index={index} controls={index === 0 ? reportControls : null} onEdit={(row) => openEdit(report, row)} onServiceReset={(asset) => resetService(report, asset)} />)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No accessible firm was found.</div>}
    {!compact && <p className="text-xs text-slate-500">Average is calculated from each asset’s full-to-full cycle. A zero-refill “Full” mark does not close the cycle, so running hours continue accumulating safely.</p>}
  </div>;
}
