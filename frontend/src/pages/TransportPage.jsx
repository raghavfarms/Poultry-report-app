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
const show = (number, suffix = "") => {
  const value = Number(number);
  return number == null || !Number.isFinite(value) || value === 0
    ? "—"
    : `${value.toFixed(value % 1 ? 2 : 0)}${suffix}`;
};
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const columns = [
  { id: "from", label: "From", width: "w-[8%] min-w-[50px]" },
  { id: "destination", label: "Destination", width: "w-[8%] min-w-[50px]" },
  { id: "openingDate", label: "Date", width: "w-[13%] min-w-[85px]" },
  { id: "openingReading", label: <>Opening<br />Reading</>, width: "w-[11%] min-w-[75px]" },
  { id: "closingReading", label: <>Closing<br />Reading</>, width: "w-[11%] min-w-[75px]" },
  { id: "kmRun", label: <>KM<br />Run</>, width: "w-[7%] min-w-[48px]" },
  { id: "fill1", label: "Fill 1", width: "w-[7%] min-w-[48px]" },
  { id: "fill2", label: "Fill 2", width: "w-[7%] min-w-[48px]" },
  { id: "consumed", label: "Consumed", width: "w-[9%] min-w-[62px]" },
  { id: "avg", label: "Avg", width: "w-[11%] min-w-[72px]" },
  { id: "action", label: "Action", width: "w-[8%] min-w-[58px]" },
];

function VehicleTable({ vehicle, rows, onEdit, onAdd }) {
  const { user } = useAuth();
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const dateCmp = `${b.openingDate}T${b.openingTime}`.localeCompare(`${a.openingDate}T${a.openingTime}`);
      if (dateCmp !== 0) return dateCmp;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }, [rows]);

  const completedRows = sortedRows.filter((row) => row.complete);
  const latest = completedRows[0];
  const unfinishedRow = sortedRows.find((row) => !row.complete);
  const totalKm = sum(completedRows, "kmRun");
  const totalConsumed = sum(completedRows, "consumedLiters");
  const completedCycles = sortedRows.filter((row) => Number(row.cycleFuelLiters) > 0 && row.averageKmPerLiter != null);
  const cycleDistance = sum(completedCycles, "fullCycleDistanceKm");
  const cycleFuel = sum(completedCycles, "cycleFuelLiters");

  const nextDate = latest ? addDays(latest.closingDate || latest.openingDate, 1) : today();

  return (
    <section className="break-inside-avoid space-y-1.5 max-w-5xl">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 px-1">
        <div><p className="text-[10px] font-bold uppercase text-emerald-700">Vehicle name</p><h3 className="font-black text-slate-900">{vehicle.name}</h3></div>
        <div><p className="text-[10px] font-bold uppercase text-slate-500">Vehicle number</p><b>{vehicle.number}</b></div>
        <div><p className="text-[10px] font-bold uppercase text-slate-500">Tank capacity</p><b>{vehicle.tankCapacity} L</b></div>
      </div>
      <div className="w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="transport-report-table w-full min-w-[680px] border-collapse text-[10px] xl:text-xs">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.id}
                  className={`px-1.5 py-1.5 text-center align-middle leading-tight font-bold ${col.width || ""} ${
                    idx === columns.length - 1
                      ? "sticky right-0 bg-[#e7eee9] z-20 border-l border-slate-300 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]"
                      : ""
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!unfinishedRow && (
              <tr className="bg-[#fff6e9] hover:bg-[#ffeed6] text-[#7c6851]">
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={`${cell} font-bold text-slate-900`}>{displayDate(nextDate)}</td>
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={cell}>—</td>
                <td className={`${cell} no-print text-center sticky right-0 bg-[#fff6e9] border-l border-amber-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]`}>
                  <button
                    type="button"
                    onClick={() => onAdd(vehicle._id, nextDate)}
                    className={actionAddButton}
                  >
                    Add
                  </button>
                </td>
              </tr>
            )}
            {sortedRows.map((row) => <tr key={row._id} className={`group ${!row.complete ? "bg-amber-50/50 hover:bg-amber-50" : "hover:bg-emerald-50"}`}>
              <td className={cell}>{row.from || "—"}</td>
              <td className={cell}>{row.destination || "—"}</td>
              <td className={`${cell} font-bold`}>{displayDate(row.openingDate)}</td>
              <td className={cell}>{show(row.openingReading)}</td>
              <td className={cell}>{row.complete ? show(row.closingReading) : "—"}</td>
              <td className={`${cell} font-bold`}>{row.complete ? show(row.kmRun) : "—"}</td>
              <td className={cell}>{show(row.fill1Liters, " L")}</td>
              <td className={cell}>{show(row.fill2Liters, " L")}</td>
              <td className={`${cell} font-bold`}>{row.complete ? show(row.consumedLiters, " L") : "—"}</td>
              <td className={`${cell} font-black text-emerald-700`}>{row.averageKmPerLiter == null ? "—" : show(row.averageKmPerLiter, " km/L")}</td>
              <td className={`${cell} no-print text-center sticky right-0 ${!row.complete ? "bg-[#fffbeb] group-hover:bg-amber-50" : "bg-white group-hover:bg-emerald-50"} border-l border-slate-200 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]`}>
                {!row.complete ? (
                  ["admin", "developer"].includes(user.role) || Date.now() - new Date(row.createdAt).getTime() <= 86400000 ? (
                    <button onClick={() => onEdit(row)} className={actionAddButton}>Add</button>
                  ) : (
                    "—"
                  )
                ) : ["admin", "developer"].includes(user.role) ? (
                  <button onClick={() => onEdit(row)} className={actionEditButton}>Edit</button>
                ) : (
                  "—"
                )}
              </td>
            </tr>)}
          </tbody>
          <tfoot className="font-bold bg-[#dce9df] text-[#203c2b]">
            <tr>
              <td className={cell}>Total</td>
              <td className={cell}>—</td>
              <td className={cell}>—</td>
              <td className={cell}>—</td>
              <td className={cell}>—</td>
              <td className={cell}>{show(totalKm)}</td>
              <td className={cell}>{show(sum(sortedRows, "fill1Liters"), " L")}</td>
              <td className={cell}>{show(sum(sortedRows, "fill2Liters"), " L")}</td>
              <td className={cell}>{show(totalConsumed, " L")}</td>
              <td className={cell}>{cycleFuel > 0 ? show(cycleDistance / cycleFuel, " km/L") : "—"}</td>
              <td className={`${cell} no-print text-center sticky right-0 bg-[#dce9df] border-l border-slate-300 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.04)]`}>
                —
              </td>
            </tr>
          </tfoot>
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
    <div className="no-print flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs font-bold text-slate-500">Vehicle<select className={`${inputClass} !min-h-9 sm:w-60`} value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="all">All vehicles</option>{vehicles.filter((vehicle) => vehicle.active).map((vehicle) => <option key={vehicle._id} value={vehicle._id}>{vehicle.name} — {vehicle.number} — {vehicle.tankCapacity} L</option>)}</select></label><button onClick={exportPdf} disabled={exporting} className={`${secondaryButton} !min-h-9 !w-28 !rounded-lg !px-3 !py-1`}>{exporting ? "Exporting…" : "Export PDF"}</button><button onClick={() => window.print()} className={`${secondaryButton} !min-h-9 !w-28 !rounded-lg !px-3 !py-1`}>Print</button><button onClick={() => { const vehicle = shownVehicles[0]; if (vehicle) setForm({ vehicleId: vehicle._id, initialDate: today() }); }} disabled={!shownVehicles.length} className={`${primaryButton} !min-h-9 !w-28 whitespace-nowrap !rounded-lg !px-3 !py-1`}>Add entry</button></div>
    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3" onMouseDown={() => setForm(null)}><div className="w-full max-w-sm" onMouseDown={(event) => event.stopPropagation()}><TransportEntryForm entryId={form.entryId} initialVehicleId={form.vehicleId} initialDate={form.initialDate} onCancel={() => setForm(null)} onSaved={() => { setForm(null); load(); }} /></div></div>}
    {loading ? <Spinner label="Loading transport report…" /> : <div ref={reportRef} className="report-export-content space-y-5">{shownVehicles.length ? shownVehicles.map((vehicle) => <VehicleTable key={vehicle._id} vehicle={vehicle} rows={rows.filter((row) => String(row.vehicle) === vehicle._id)} onEdit={(row) => setForm({ entryId: row._id })} onAdd={(id, nextDate) => setForm({ vehicleId: id, initialDate: nextDate })} />) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">An administrator must add a transport vehicle first.</div>}</div>}
  </div>;
}
