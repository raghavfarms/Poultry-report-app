import { displayDate, formatMinutes, today } from '../utils/date.js';
import { useAuth } from '../context/AuthContext.jsx';

const value = (number, suffix = '') => number == null ? '—' : `${Number(number).toFixed(Number(number) % 1 ? 2 : 0)}${suffix}`;

function reportAssets(report) {
  const map = new Map(report.assets.map((item) => [String(item._id), { id: String(item._id), label: item.label, order: item.order, serviceIntervalMinutes: item.serviceIntervalMinutes }]));
  for (const row of report.rows) for (const item of row.assetEntries || []) if (!map.has(String(item.asset))) map.set(String(item.asset), { id: String(item.asset), label: item.label, order: item.order });
  return [...map.values()].sort((a, b) => a.order - b.order);
}

function nextMissingDate(report) {
  return report.rows.filter((row) => row.missing).map((row) => row.date).sort()[0];
}

function currentService(report, assetId) {
  for (const row of report.rows) {
    const item = (row.assetEntries || []).find((entry) => String(entry.asset) === assetId);
    if (item?.service) return item.service;
  }
  return { runningMinutes: 0, due: false };
}

const sum = (items, getValue) => items.reduce((total, item) => total + Number(getValue(item) || 0), 0);

function reportTotals(report, assets) {
  const rows = report.rows.filter((row) => !row.missing);
  return {
    openingLiters: sum(rows, (row) => row.openingLiters),
    dieselInLiters: sum(rows, (row) => row.dieselInLiters),
    lightConsumptionMinutes: sum(rows, (row) => row.lightConsumptionMinutes),
    electricityConsumptionMinutes: sum(rows, (row) => row.electricityConsumptionMinutes),
    dieselConsumptionLiters: sum(rows, (row) => row.dieselConsumptionLiters),
    closingLiters: sum(rows, (row) => row.closingLiters),
    assets: new Map(assets.map((asset) => {
      const entries = rows.flatMap((row) => row.assetEntries || []).filter((entry) => String(entry.asset) === asset.id);
      const runningMinutes = sum(entries, (entry) => entry.runningMinutes);
      const refillLiters = sum(entries, (entry) => entry.refillLiters);
      return [asset.id, {
        runningMinutes,
        refillLiters,
        averageLitersPerHour: runningMinutes ? refillLiters / (runningMinutes / 60) : null,
        fullCount: entries.filter((entry) => entry.isFull).length,
      }];
    })),
  };
}

function MobileRows({ report, assets, onEdit, isAdmin }) {
  const nextDate = nextMissingDate(report);
  return <div className="grid gap-3 md:hidden">{report.rows.map((row) => <article key={row.date} className={`rounded-2xl border p-4 ${row.missing ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-start justify-between gap-3"><div><h4 className="font-bold text-slate-900">{displayDate(row.date)}</h4>{!row.missing && <p className="text-xs font-semibold text-emerald-700">Completed</p>}</div>{((row.missing && row.date === nextDate) || (!row.missing && (isAdmin || row.date === today()))) && <button onClick={() => onEdit(row)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold">{row.missing ? 'Add' : 'Edit'}</button>}</div>
    <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-white/70 p-2"><span className="block text-[10px] uppercase text-slate-400">Opening</span><b>{!row.missing || row.date === nextDate ? value(row.openingLiters) : '—'}</b></div><div className="rounded-lg bg-white/70 p-2"><span className="block text-[10px] uppercase text-slate-400">IN</span><b>{row.missing ? '—' : value(row.dieselInLiters)}</b></div><div className="rounded-lg bg-white/70 p-2"><span className="block text-[10px] uppercase text-slate-400">Closing</span><b>{!row.missing || row.date === nextDate ? value(row.closingLiters) : '—'}</b></div></div>
    {!row.missing && <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">{assets.map((asset) => { const item = row.assetEntries.find((entry) => String(entry.asset) === asset.id); return <div key={asset.id} className="grid grid-cols-[1fr_auto] gap-3 p-3 text-xs"><b>{asset.label}</b>{item ? <span className="text-right text-slate-600">{formatMinutes(item.runningMinutes)} · {value(item.refillLiters, ' L')} · Avg {value(item.averageLitersPerHour)} · {item.isFull ? '✓ Full' : 'Not full'}</span> : <span className="text-slate-400">—</span>}</div>; })}</div>}
    {!row.missing && <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600"><span>Light: <b>{formatMinutes(row.lightConsumptionMinutes)}</b></span><span>Electricity: <b>{formatMinutes(row.electricityConsumptionMinutes)}</b></span><span>Diesel: <b>{value(row.dieselConsumptionLiters, ' L')}</b></span><span>Total avg: <b>{value(row.totalAverageLitersPerHour)}</b></span></div>}
  </article>)}</div>;
}

export default function ReportView({ report, index, controls, onEdit, onServiceReset }) {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const assets = reportAssets(report);
  const nextDate = nextMissingDate(report);
  const totals = reportTotals(report, assets);
  return <section className="space-y-2">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{index + 1}. Firm</p><h3 className="text-lg font-black uppercase tracking-[0.12em] text-slate-900">{report.firm.name}</h3></div>{controls}<p className="text-xs text-slate-500">{report.from} → {report.to}</p></div>
    <MobileRows report={report} assets={assets} onEdit={onEdit} isAdmin={isAdmin} />
    <div className="report-scroll hidden overflow-x-auto rounded-2xl shadow-sm md:block"><table className="report-table"><thead><tr><th rowSpan="2">Date</th><th colSpan="2">Stock</th>{assets.map((asset) => <AssetHeader key={asset.id} asset={asset} service={currentService(report, asset.id)} onReset={() => onServiceReset(asset)} />)}<th colSpan="4">Daily summary</th><th rowSpan="2" className="sticky-action">Action</th></tr><tr><th>Opening</th><th>IN</th>{assets.map((asset) => <FragmentHeader key={asset.id} />)}<th>Light</th><th>Electricity</th><th>Diesel</th><th>Closing</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.date} className={row.missing ? 'missing' : ''}><td><b>{displayDate(row.date)}</b></td><td>{!row.missing || row.date === nextDate ? value(row.openingLiters) : '—'}</td><td>{row.missing ? '—' : value(row.dieselInLiters)}</td>{assets.map((asset) => { const item = row.assetEntries.find((entry) => String(entry.asset) === asset.id); return <AssetCells key={asset.id} item={item} />; })}<td>{formatMinutes(row.lightConsumptionMinutes)}</td><td>{formatMinutes(row.electricityConsumptionMinutes)}</td><td><b>{row.missing ? '—' : value(row.dieselConsumptionLiters)}</b></td><td><b>{!row.missing || row.date === nextDate ? value(row.closingLiters) : '—'}</b></td><td className="sticky-action">{(row.missing && row.date === nextDate) || (!row.missing && (isAdmin || row.date === today())) ? <button onClick={() => onEdit(row)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-emerald-800">{row.missing ? 'Add' : 'Edit'}</button> : '—'}</td></tr>)}</tbody><tfoot><tr><td><b>Total</b></td><td>{value(totals.openingLiters)}</td><td>{value(totals.dieselInLiters)}</td>{assets.map((asset) => <AssetTotalCells key={asset.id} totals={totals.assets.get(asset.id)} />)}<td>{formatMinutes(totals.lightConsumptionMinutes)}</td><td>{formatMinutes(totals.electricityConsumptionMinutes)}</td><td><b>{value(totals.dieselConsumptionLiters)}</b></td><td><b>{value(totals.closingLiters)}</b></td><td className="sticky-action">—</td></tr></tfoot></table></div>
  </section>;
}

function FragmentHeader() { return <><th>Running</th><th>Refill</th><th>Avg</th><th>Full</th></>; }
const serviceTime = (minutes) => `${Math.floor(Number(minutes || 0) / 60)}:${String(Number(minutes || 0) % 60).padStart(2, '0')}`;
function AssetHeader({ asset, service, onReset }) { const status = <>{serviceTime(service.runningMinutes)} / {serviceTime(asset.serviceIntervalMinutes)} · Last: {service.lastServiceDate || 'Never'}</>; return <th colSpan="4"><span className="block">{asset.label}</span>{service.due ? <button type="button" onClick={onReset} title="Mark service completed today" className="text-[9px] font-black text-red-600 underline">{status}<span className="block">SERVICE DUE · RESET</span></button> : <span className="block text-[9px] font-semibold text-slate-500">{status}</span>}</th>; }
function AssetCells({ item }) { return <>{item ? <><td>{formatMinutes(item.runningMinutes)}</td><td>{value(item.refillLiters)}</td><td>{value(item.averageLitersPerHour)}</td><td className="text-center">{item.isFull ? '✓' : '—'}</td></> : <><td>—</td><td>—</td><td>—</td><td>—</td></>}</>; }
function AssetTotalCells({ totals }) { return <><td>{formatMinutes(totals.runningMinutes)}</td><td>{value(totals.refillLiters)}</td><td>{value(totals.averageLitersPerHour)}</td><td className="text-center">{totals.fullCount}</td></>; }
