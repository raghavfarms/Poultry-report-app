import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import { api } from "../api/client.js";
import { Alert, inputClass, secondaryButton, Spinner } from "../components/Ui.jsx";
import TransportEntryForm from "../components/TransportEntryForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const cell = "border border-slate-200 px-1 py-1.5";
const show = (number, suffix = "") => {
  const value = Number(number);
  return number == null || !Number.isFinite(value) || value === 0
    ? "—"
    : `${value.toFixed(value % 1 ? 2 : 0)}${suffix}`;
};
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const headings = ["From", "Destination", "Opening Date", "Opening Reading", "Closing Reading", "KM Run", "Fill 1", "Fill 2", "Total Diesel", "Consumed", "Avg", "Action"];

function VehicleTable({ vehicle, rows, onEdit, onAdd }) {
  const { user } = useAuth();
  const chronological = [...rows].reverse();
  const first = chronological[0];
  const latest = rows.find((row) => row.complete);
  const completedRows = rows.filter((row) => row.complete);
  const totalKm = sum(completedRows, "kmRun");
  const totalConsumed = sum(completedRows, "consumedLiters");
  const completedCycles = rows.filter((row) => Number(row.cycleFuelLiters) > 0 && row.averageKmPerLiter != null);
  const cycleDistance = sum(completedCycles, "fullCycleDistanceKm");
  const cycleFuel = sum(completedCycles, "cycleFuelLiters");
  return (
    <section className="break-inside-avoid space-y-1.5">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 px-1">
        <div><p className="text-[10px] font-bold uppercase text-emerald-700">Vehicle name</p><h3 className="font-black text-slate-900">{vehicle.name}</h3></div>
        <div><p className="text-[10px] font-bold uppercase text-slate-500">Vehicle number</p><b>{vehicle.number}</b></div>
        <div><p className="text-[10px] font-bold uppercase text-slate-500">Tank capacity</p><b>{vehicle.tankCapacity} L</b></div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="transport-report-table w-full table-fixed border-collapse text-[10px] xl:text-xs">
          <thead><tr>{headings.map((heading) => <th key={heading} className="px-1 py-1.5 text-left leading-tight">{heading}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row._id} className="hover:bg-emerald-50">
              <td className={cell}>{row.from || "—"}</td><td className={cell}>{row.destination || "—"}</td><td className={cell}>{row.openingDate}</td><td className={cell}>{show(row.openingReading)}</td><td className={cell}>{row.complete ? show(row.closingReading) : "—"}</td><td className={`${cell} font-bold`}>{row.complete ? show(row.kmRun) : "—"}</td><td className={cell}>{show(row.fill1Liters, " L")}</td><td className={cell}>{show(row.fill2Liters, " L")}</td><td className={`${cell} font-bold`}>{show(row.totalDiesel, " L")}</td><td className={`${cell} font-bold`}>{row.complete ? show(row.consumedLiters, " L") : "—"}</td><td className={`${cell} font-black text-emerald-700`}>{row.averageKmPerLiter == null ? "—" : show(row.averageKmPerLiter, " km/L")}</td><td className={`${cell} no-print`}>{user.role === "admin" ? <button onClick={() => onEdit(row)} className={`${secondaryButton} !min-h-7 !px-2 !py-1 !text-[11px]`}>Edit</button> : !row.complete && Date.now() - new Date(row.createdAt).getTime() <= 86400000 ? <button onClick={() => onEdit(row)} className={`${secondaryButton} !min-h-7 !px-2 !py-1 !text-[11px]`}>Add</button> : "—"}</td>
            </tr>)}
          </tbody>
          <tfoot className="font-bold"><tr>
            <td className={cell}>Total</td><td className={cell}>—</td><td className={cell}>{first?.openingDate || "—"}</td><td className={cell}>{first ? show(first.openingReading) : "—"}</td><td className={cell}>{latest ? show(latest.closingReading) : "—"}</td><td className={cell}>{show(totalKm)}</td><td className={cell}>{show(sum(rows, "fill1Liters"), " L")}</td><td className={cell}>{show(sum(rows, "fill2Liters"), " L")}</td><td className={cell}>{show(sum(rows, "totalDiesel"), " L")}</td><td className={cell}>{show(totalConsumed, " L")}</td><td className={cell}>{cycleFuel > 0 ? show(cycleDistance / cycleFuel, " km/L") : "—"}</td><td className={`${cell} no-print sticky right-0 bg-emerald-50`}><button onClick={() => onAdd(vehicle._id)} className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white">Add</button></td>
          </tr></tfoot>
        </table>
      </div>
    </section>
  );
}

export default function TransportPage() {
  const [vehicles, setVehicles] = useState([]), [vehicleId, setVehicleId] = useState("all");
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [form, setForm] = useState(null), [exporting, setExporting] = useState(false);
  const reportRef = useRef(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const data = await api(`/transport-entries/report${vehicleId === "all" ? "" : `?vehicleId=${vehicleId}`}`); setVehicles(data.vehicles); setRows(data.rows); } catch (error) { setError(error.message); } finally { setLoading(false); } }, [vehicleId]);
  useEffect(() => { load(); }, [load]);
  const shownVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.active && (vehicleId === "all" || vehicle._id === vehicleId)), [vehicles, vehicleId]);
  const exportPdf = async () => { if (!reportRef.current) return; setExporting(true); try { await html2pdf().set({ filename: "transport-report.pdf", margin: 6, image: { type: "jpeg", quality: .98 }, html2canvas: { scale: 2 }, jsPDF: { unit: "mm", format: "a3", orientation: "landscape" } }).from(reportRef.current).save(); } catch (error) { setError(error.message); } finally { setExporting(false); } };
  return <div className="space-y-3">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Second reporting module</p><h1 className="mt-1 text-2xl font-black">Transport Report</h1></div><Alert>{error}</Alert>
    <div className="no-print flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-bold text-slate-500">Vehicle<select className={`${inputClass} !min-h-9 sm:w-60`} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="all">All vehicles</option>{vehicles.filter((vehicle) => vehicle.active).map((vehicle) => <option key={vehicle._id} value={vehicle._id}>{vehicle.name} — {vehicle.number} — {vehicle.tankCapacity} L</option>)}</select></label><button onClick={exportPdf} disabled={exporting} className={secondaryButton}>{exporting ? "Exporting…" : "Export PDF"}</button><button onClick={() => window.print()} className={secondaryButton}>Print</button></div>
    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3" onMouseDown={() => setForm(null)}><div className="w-full max-w-sm" onMouseDown={(event) => event.stopPropagation()}><TransportEntryForm entryId={form.entryId} initialVehicleId={form.vehicleId} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); }} /></div></div>}
    {loading ? <Spinner label="Loading transport report…" /> : <div ref={reportRef} className="space-y-5">{shownVehicles.length ? shownVehicles.map((vehicle) => <VehicleTable key={vehicle._id} vehicle={vehicle} rows={rows.filter((row) => String(row.vehicle) === vehicle._id)} onEdit={(row) => setForm({ entryId: row._id })} onAdd={(id) => setForm({ vehicleId: id })} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">An administrator must add a transport vehicle first.</div>}</div>}
  </div>;
}
