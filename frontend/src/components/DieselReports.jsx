import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2pdf from 'html2pdf.js';
import { api } from '../api/client.js';
import { addDays, today } from '../utils/date.js';
import { Alert, inputClass, primaryButton, secondaryButton, Spinner } from './Ui.jsx';
import EntryForm from './EntryForm.jsx';
import ReportView from './ReportView.jsx';

const openDatePicker = (event) => event.currentTarget.showPicker?.();

export default function DieselReports({ compact = false, showHeading = true }) {
  const [firms, setFirms] = useState([]); const [firmFilter, setFirmFilter] = useState('all');
  const [to, setTo] = useState(today()); const [from, setFrom] = useState(addDays(today(), -6));
  const [reports, setReports] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [exporting, setExporting] = useState(false);
  const reportsRef = useRef(null);

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

  const exportPdf = async () => {
    if (!reportsRef.current || exporting) return;
    setExporting(true); setError('');
    reportsRef.current.classList.add('pdf-exporting');
    try {
      await html2pdf().set({
        filename: `diesel-report-${from}-to-${to}.pdf`,
        margin: 6,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] },
      }).from(reportsRef.current).save();
    } catch (err) {
      setError(err.message || 'Could not export the PDF.');
    } finally {
      reportsRef.current?.classList.remove('pdf-exporting');
      setExporting(false);
    }
  };

  const reportControls = <div className="no-print grid w-full grid-cols-2 items-end gap-1.5 sm:flex sm:flex-wrap sm:gap-2 lg:w-auto"><label className="grid w-36 gap-0.5 text-[10px] font-bold text-slate-500 sm:w-40 sm:gap-1 sm:text-xs">Firm<select className={`${inputClass} !min-h-8 !rounded-lg !px-2 !py-0.5 !text-xs sm:!min-h-9 sm:!py-1`} value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)}><option value="all">All firms</option>{firms.map((firm) => <option key={firm._id} value={firm._id}>{firm.name}</option>)}</select></label><label className="col-start-1 row-start-2 grid w-full gap-0.5 text-[10px] font-bold text-slate-500 sm:w-40 sm:gap-1 sm:text-xs">From<input className={`${inputClass} !min-h-8 cursor-pointer !rounded-lg !px-2 !py-0.5 !text-[11px] sm:!min-h-9 sm:!py-1 sm:!text-xs`} type="date" value={from} onClick={openDatePicker} onChange={(e) => setFrom(e.target.value)} /></label><label className="col-start-2 row-start-2 grid w-full gap-0.5 text-[10px] font-bold text-slate-500 sm:w-40 sm:gap-1 sm:text-xs">To<input className={`${inputClass} !min-h-8 cursor-pointer !rounded-lg !px-2 !py-0.5 !text-[11px] sm:!min-h-9 sm:w-40 sm:!py-1 sm:!text-xs`} type="date" value={to} onClick={openDatePicker} onChange={(e) => setTo(e.target.value)} /></label><button onClick={exportPdf} disabled={exporting} className={`${secondaryButton} col-start-1 row-start-3 !min-h-8 w-full !rounded-lg !py-0.5 !text-xs sm:!min-h-9 sm:w-40 sm:!py-1 sm:!text-sm`}>{exporting ? 'Exporting…' : 'Export PDF'}</button><button onClick={() => window.print()} className={`${secondaryButton} col-start-2 row-start-3 !min-h-8 w-full !rounded-lg !py-0.5 !text-xs sm:!min-h-9 sm:w-40 sm:!py-1 sm:!text-sm`}>Print</button><button onClick={openNew} disabled={!firms.length} className={`${primaryButton} col-start-2 row-start-1 !min-h-8 w-36 !rounded-lg !py-0.5 !text-xs sm:!min-h-9 sm:w-40 sm:!py-1 sm:!text-sm`}>＋ Add entry</button></div>;

  return <div className="space-y-3">
    {showHeading && <div>{!compact && <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-emerald-700 sm:block">First reporting module</p>}<h2 className={`${compact ? 'text-lg sm:text-xl' : 'text-xl sm:mt-1 sm:text-2xl'} font-black text-slate-900`}>Diesel Consumption</h2>{!compact && <p className="mt-1 hidden text-sm text-slate-500 sm:block">Newest date first · each firm is shown separately</p>}</div>}
    <Alert>{error}</Alert>
    {form && <div role="dialog" aria-modal="true" aria-label="Daily diesel entry" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-[1px] sm:p-6" onMouseDown={() => setForm(null)}>
      <div className="w-full max-w-md [zoom:.78] sm:[zoom:1]" onMouseDown={(event) => event.stopPropagation()}>
        <EntryForm firms={firms} initialFirmId={form.firmId} initialDate={form.date} onSaved={saved} onCancel={() => setForm(null)} />
      </div>
    </div>}
    {loading ? <Spinner label="Loading report…" /> : reports.length ? <div ref={reportsRef} className="report-export-content space-y-3">{reports.map((report, index) => <ReportView key={report.firm._id} report={report} index={index} controls={index === 0 ? reportControls : null} onEdit={(row) => openEdit(report, row)} onServiceReset={(asset) => resetService(report, asset)} />)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No accessible firm was found.</div>}
    {!compact && <p className="text-xs text-slate-500">Average is calculated from each asset’s full-to-full cycle. A zero-refill “Full” mark does not close the cycle, so running hours continue accumulating safely.</p>}
  </div>;
}
