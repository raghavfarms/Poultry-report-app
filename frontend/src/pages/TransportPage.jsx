import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import { api } from "../api/client.js";
import { addDays, displayDate, today } from "../utils/date.js";
import { Alert, inputClass, primaryButton, secondaryButton, Spinner } from "../components/Ui.jsx";
import TransportEntryForm from "../components/TransportEntryForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const cell = "border border-slate-200 px-1.5 py-1 text-center align-middle";
const actionAddButton = "rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-800 hover:bg-slate-50 transition shadow-sm";
const actionEditButton = "rounded-lg border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm";
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const detailColumns = ["DATE", "OP READING", "DATE", "CL READING", "O/B", "FILL 1", "FILL 2", "TOTAL FILL", "clg", "CONSUM", "K.M.", "CYCLE K.M.", "KM/CON"];

function VehicleTable({ vehicle, rows, onEdit, onAdd, selectedDate }) {
  const { user } = useAuth();
  const sortedRows = useMemo(() => [...rows].sort((a, b) =>
    b.openingDate.localeCompare(a.openingDate) ||
    (b.openingTime || "").localeCompare(a.openingTime || "") ||
    (b.createdAt || "").localeCompare(a.createdAt || "")
  ), [rows]);
  const completedRows = sortedRows.filter((row) => row.complete);
  const latest = completedRows[0];
  const unfinishedRow = sortedRows.find((row) => !row.complete);
  const cycles = sortedRows.filter((row) => row.averageKmPerLiter != null);
  const cycleDistance = sum(cycles, "fullCycleDistanceKm");
  const cycleFuel = sum(cycles, "cycleFuelLiters");
  const nextDate = selectedDate || (latest ? (latest.closingDate || addDays(latest.openingDate, 1)) : today());
  const balance = (value) => value == null ? "\u2014" : String(Number(Number(value).toFixed(2)));
  const header = cell + " bg-[#dce9df] font-bold whitespace-nowrap";

  return <section className="break-inside-avoid space-y-1.5 w-full">
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-1">
      <h3 className="font-black text-slate-900">{vehicle.name}</h3><b>{vehicle.number}</b>
      <span className="text-xs">DIESEL TANK CAPACITY - {vehicle.tankCapacity} LT</span>
    </div>
    <div className="report-scroll w-full overflow-x-auto rounded-lg border border-slate-300 bg-white">
      <table className="transport-report-table w-full min-w-[1150px] border-collapse text-[10px] xl:text-xs">
        <thead>
          <tr>
            <th colSpan={2} className={header}>OPENING READING</th>
            <th colSpan={2} className={header}>CLOSING READING</th>
            <th colSpan={6} className={header}>DIESEL TANK CAPACITY - {vehicle.tankCapacity} LT</th>
            <th colSpan={2} className={header}>RUNNING</th>
            <th className={header}>AVERAGE</th>
            <th rowSpan={2} className={header + " no-print"}>Action</th>
          </tr>
          <tr>{detailColumns.map((label, index) => <th key={index} className={header}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {!unfinishedRow && <tr className="bg-[#fff6e9] no-print">
            <td className={cell}>{displayDate(nextDate)}</td>
            <td colSpan={12} className={cell}></td>
            <td className={cell}><button type="button" onClick={() => onAdd(vehicle._id, nextDate)} className={actionAddButton}>Add</button></td>
          </tr>}
          {sortedRows.map((row, index) => {
            const previous = sortedRows[index + 1];
            const openingKnownFull = previous
              ? previous.complete && previous.isFull && Number(previous.closingReading) === Number(row.openingReading)
              : row.openingFull !== false;
            const openingFuel = openingKnownFull ? Number(row.tankCapacity ?? vehicle.tankCapacity) : null;
            const closingFuel = row.complete && row.isFull ? Number(row.tankCapacity ?? vehicle.tankCapacity) : null;
            const totalFuel = openingFuel == null ? null : openingFuel + Number(row.fill1Liters || 0) + Number(row.fill2Liters || 0);
            return <tr key={row._id} className={row.complete ? "hover:bg-emerald-50" : "bg-amber-50"}>
              <td className={cell + " whitespace-nowrap"}>{displayDate(row.openingDate)}</td>
              <td className={cell}>{balance(row.openingReading)}</td>
              <td className={cell + " whitespace-nowrap"}>{row.closingDate ? displayDate(row.closingDate) : "\u2014"}</td>
              <td className={cell}>{balance(row.closingReading)}</td>
              <td className={cell}>{balance(openingFuel)}</td>
              <td className={cell}>{balance(row.fill1Liters)}{row.fill1Reading != null && <small className="block">@ {row.fill1Reading} km</small>}</td>
              <td className={cell}>{balance(row.fill2Liters)}{row.fill2Reading != null && <small className="block">@ {row.fill2Reading} km</small>}</td>
              <td className={cell}>{balance(totalFuel)}</td>
              <td className={cell}>{balance(closingFuel)}</td>
              <td className={cell + " font-bold"}>{balance(row.consumedLiters)}</td>
              <td className={cell}>{balance(row.kmRun)}</td>
              <td className={cell}>{balance(row.fullCycleDistanceKm)}</td>
              <td className={cell + " font-bold text-emerald-700"}>{balance(row.averageKmPerLiter)}</td>
              <td className={cell + " no-print"}>{!row.complete || ["admin", "developer"].includes(user.role)
                ? <button onClick={() => onEdit(row)} className={actionEditButton}>{row.complete ? "Edit" : "Update"}</button> : "\u2014"}</td>
            </tr>;
          })}
        </tbody>
        <tfoot className="font-bold bg-[#dce9df]">
          <tr>
            <td className={cell}>Total</td><td colSpan={3} className={cell}>—</td><td className={cell}>—</td>
            <td className={cell}>{balance(sum(sortedRows, "fill1Liters"))}</td>
            <td className={cell}>{balance(sum(sortedRows, "fill2Liters"))}</td>
            <td className={cell}>—</td><td className={cell}>—</td>
            <td className={cell}>{balance(cycles.length ? sum(cycles, "consumedLiters") : null)}</td>
            <td className={cell}>{balance(sum(completedRows, "kmRun"))}</td>
            <td className={cell}>{balance(cycles.length ? cycleDistance : null)}</td>
            <td className={cell}>{balance(cycleFuel > 0 ? cycleDistance / cycleFuel : null)}</td>
            <td className={cell + " no-print"}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p className="text-[10px] text-slate-600">Fuel quantities are in litres. TOTAL FILL = O/B + FILL 1 + FILL 2, as in the spreadsheet. CONSUM and CYCLE K.M. cover the completed full-to-full cycle; KM/CON = cycle kilometres / all refill litres in that cycle. — means unknown or pending.</p>
  </section>;
}

export default function TransportPage() {
  const [vehicles, setVehicles] = useState([]), [vehicleId, setVehicleId] = useState("all");
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [form, setForm] = useState(null), [exporting, setExporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const reportRef = useRef(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const data = await api(`/transport-entries/report${vehicleId === "all" ? "" : `?vehicleId=${vehicleId}`}`); setVehicles(data.vehicles); setRows(data.rows); } catch (error) { setError(error.message); } finally { setLoading(false); } }, [vehicleId]);
  useEffect(() => { load(); }, [load]);
  const shownVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.active && (vehicleId === "all" || vehicle._id === vehicleId)), [vehicles, vehicleId]);
  const defaultEntryDate = rows
    .filter((row) => row.complete && String(row.vehicle) === shownVehicles[0]?._id)
    .map((row) => row.closingDate || addDays(row.openingDate, 1))
    .sort().at(-1) || today();
  const entryDate = selectedDate || defaultEntryDate;
  const exportPdf = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    setError("");
    reportRef.current.classList.add("pdf-exporting");
    try {
      await html2pdf().set({
        filename: "transport-report.pdf",
        margin: 6,
        image: { type: "jpeg", quality: .98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "mm", format: "a3", orientation: "landscape" },
        pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] },
      }).from(reportRef.current).save();
    } catch (error) {
      setError(error.message || "Could not export the PDF.");
    } finally {
      reportRef.current?.classList.remove("pdf-exporting");
      setExporting(false);
    }
  };
  return <div className="space-y-3">
    <div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Second reporting module</p><h1 className="mt-1 text-2xl font-black">Transport Report</h1></div><Alert>{error}</Alert>
    <div className="no-print flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-bold text-slate-500">Vehicle<select className={`${inputClass} !min-h-9 sm:w-60`} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="all">All vehicles</option>{vehicles.filter((vehicle) => vehicle.active).map((vehicle) => <option key={vehicle._id} value={vehicle._id}>{vehicle.name} — {vehicle.number} — {vehicle.tankCapacity} L</option>)}</select></label><button onClick={exportPdf} disabled={exporting} className={`${secondaryButton} !min-h-9 !w-28 !rounded-lg !px-3 !py-1`}>{exporting ? "Exporting…" : "Export PDF"}</button><button onClick={() => window.print()} className={`${secondaryButton} !min-h-9 !w-28 !rounded-lg !px-3 !py-1`}>Print</button><input type="date" aria-label="Entry date" title="Choose entry date; the next entry starts on the previous closing date" value={entryDate} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} onClick={(event) => event.currentTarget.showPicker?.()} className={`${secondaryButton} !min-h-9 !w-40 cursor-pointer !rounded-lg !px-3 !py-1`} /><button onClick={() => { const vehicle = shownVehicles[0]; if (vehicle) setForm({ vehicleId: vehicle._id, initialDate: entryDate }); }} disabled={!shownVehicles.length} className={`${primaryButton} !min-h-9 !w-28 whitespace-nowrap !rounded-lg !px-3 !py-1`}>Add entry</button></div>
    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3" onMouseDown={() => setForm(null)}><div className="w-full max-w-sm" onMouseDown={(event) => event.stopPropagation()}><TransportEntryForm entryId={form.entryId} initialVehicleId={form.vehicleId} initialDate={form.initialDate} onCancel={() => setForm(null)} onSaved={() => { setSelectedDate(""); setForm(null); load(); }} /></div></div>}
    {loading ? <Spinner label="Loading transport report…" /> : <div ref={reportRef} className="report-export-content space-y-5">{shownVehicles.length ? shownVehicles.map((vehicle) => <VehicleTable key={vehicle._id} vehicle={vehicle} selectedDate={selectedDate} rows={rows.filter((row) => String(row.vehicle) === vehicle._id)} onEdit={(row) => setForm({ entryId: row._id })} onAdd={(id, nextDate) => setForm({ vehicleId: id, initialDate: nextDate })} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">An administrator must add a transport vehicle first.</div>}</div>}
  </div>;
}
