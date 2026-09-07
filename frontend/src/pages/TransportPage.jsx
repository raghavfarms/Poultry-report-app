import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import { api } from "../api/client.js";
import { addDays, displayDate, today } from "../utils/date.js";
import { Alert, inputClass, primaryButton, secondaryButton, Spinner } from "../components/Ui.jsx";
import TransportEntryForm from "../components/TransportEntryForm.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const cell = "border border-slate-200 px-1.5 py-1 text-center align-middle text-[11px] xl:text-xs";
const divider = "!border-r-2 !border-r-emerald-800";
const actionGreenButton = "rounded-md border border-emerald-700 bg-emerald-700 px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-emerald-800 transition shadow-2xs min-h-[24px] touch-manipulation whitespace-nowrap";
const actionEditButton = "rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-900 hover:bg-slate-50 transition shadow-2xs min-h-[24px] touch-manipulation whitespace-nowrap";
const sum = (rows, key) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
const detailColumns = [
  { label: "READING", width: `w-[68px] min-w-[68px] ${divider}` },
  { label: "DATE", width: "w-[94px] min-w-[94px]" },
  { label: "READING", width: `w-[68px] min-w-[68px] ${divider}` },
  { label: "O/B", width: "w-10 min-w-[36px]" },
  { label: "FILL 1", width: "w-12 min-w-[48px]" },
  { label: "FILL 2", width: "w-12 min-w-[44px]" },
  { label: "TOTAL FILL", width: "w-12 min-w-[48px]" },
  { label: "clg", width: "w-10 min-w-[36px]" },
  { label: "CONSUM", width: `w-12 min-w-[48px] ${divider}` },
  { label: "K.M.", width: "w-12 min-w-[46px]" },
  { label: "CYCLE K.M.", width: `w-14 min-w-[54px] ${divider}` },
  { label: "KM/CON", width: `w-14 min-w-[52px] ${divider}` },
];

function StationCell({ row, stations = [], onStationUpdate, canEdit = true }) {
  const [saving, setSaving] = useState(false);

  const handleChange = async (e) => {
    const nextStation = e.target.value;
    if (nextStation === (row.station || "")) return;
    setSaving(true);
    try {
      await api(`/transport-entries/${row._id}/station`, {
        method: "PATCH",
        body: JSON.stringify({ station: nextStation }),
      });
      onStationUpdate(row._id, nextStation);
    } catch (err) {
      alert(err.message || "Failed to update station");
    } finally {
      setSaving(false);
    }
  };

  return (
    <td className={`${cell} w-20 min-w-[72px] p-0.5`}>
      <select
        value={row.station || ""}
        onChange={handleChange}
        disabled={saving || !canEdit}
        className={`w-full min-h-[24px] bg-transparent text-center font-bold text-[10px] sm:text-[11px] py-0 px-0.5 rounded hover:bg-emerald-50 focus:bg-white focus:outline-none cursor-pointer border border-transparent hover:border-slate-300 transition-colors ${
          row.station ? "text-slate-900" : "text-slate-400 font-normal"
        } ${!canEdit ? "!cursor-not-allowed opacity-75" : ""}`}
        title={canEdit ? "Select station" : "Station locked (24 hours passed)"}
      >
        <option value="" className="text-slate-400 font-normal">—</option>
        {stations.map((st) => (
          <option key={st} value={st} className="text-slate-900 font-bold">
            {st}
          </option>
        ))}
      </select>
    </td>
  );
}

function VehicleTable({ vehicle, rows, stations = [], onEdit, onAdd, onStationUpdate, selectedDate }) {
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
  const overallAvg = cycleFuel > 0 ? (cycleDistance / cycleFuel).toFixed(2) : "\u2014";

  return <section className="break-inside-avoid space-y-2 w-fit max-w-full">
    <div className="flex items-baseline gap-2 px-1">
      <h3 className="font-black text-slate-900 text-base sm:text-lg">{vehicle.name}</h3>
      <span className="font-bold text-slate-700 text-xs sm:text-sm">{vehicle.number}</span>
    </div>

    <div className="report-scroll w-fit max-w-full overflow-x-auto rounded-lg border border-slate-300 bg-white touch-pan-x overscroll-x-contain shadow-2xs">
      <table className="transport-report-table border-separate border-spacing-0 text-[10.5px] xl:text-xs">
        <thead>
          <tr>
            <th rowSpan={2} className={`${header} sticky-date w-[94px] min-w-[94px] whitespace-nowrap`}>DATE</th>
            <th className={`${header} ${divider} w-[68px] min-w-[68px]`}>OPENING</th>
            <th colSpan={2} className={`${header} ${divider}`}>CLOSING READING</th>
            <th colSpan={6} className={`${header} ${divider}`}>DIESEL TANK CAPACITY - {vehicle.tankCapacity} LT</th>
            <th colSpan={2} className={`${header} ${divider}`}>RUNNING</th>
            <th className={`${header} ${divider}`}>AVERAGE</th>
            <th rowSpan={2} className={`${header} w-20 min-w-[72px]`}>STATION</th>
            <th rowSpan={2} className={`${header} sticky-action no-print w-14 min-w-[54px] whitespace-nowrap !border-l-2 !border-l-emerald-800`}>Action</th>
          </tr>
          <tr>{detailColumns.map((col, index) => <th key={index} className={`${header} ${col.width}`}>{col.label}</th>)}</tr>
        </thead>
        <tbody>
          {!unfinishedRow && <tr className="bg-[#fff6e9] no-print">
            <td className={`${cell} sticky-date whitespace-nowrap font-medium w-[94px] min-w-[94px]`}>{displayDate(nextDate)}</td>
            <td className={`${cell} ${divider} w-[68px] min-w-[68px]`}>—</td>
            <td className={cell}>—</td>
            <td className={`${cell} ${divider}`}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={`${cell} ${divider}`}>—</td>
            <td className={cell}>—</td>
            <td className={`${cell} ${divider}`}>—</td>
            <td className={`${cell} ${divider}`}>—</td>
            <td className={cell}>—</td>
            <td className={`${cell} sticky-action no-print whitespace-nowrap w-14 min-w-[54px] !border-l-2 !border-l-emerald-800`}><button type="button" onClick={() => onAdd(vehicle._id, nextDate)} className={actionGreenButton}>Add</button></td>
          </tr>}
          {sortedRows.map((row, index) => {
            const previous = sortedRows[index + 1];
            const openingKnownFull = previous
              ? previous.complete && previous.isFull && Number(previous.closingReading) === Number(row.openingReading)
              : row.openingFull !== false;
            const openingFuel = openingKnownFull ? Number(row.tankCapacity ?? vehicle.tankCapacity) : null;
            const closingFuel = row.complete && row.isFull ? Number(row.tankCapacity ?? vehicle.tankCapacity) : null;
            const totalFuel = openingFuel == null ? null : openingFuel + Number(row.fill1Liters || 0) + Number(row.fill2Liters || 0);
            const isStaff = ["admin", "developer"].includes(user?.role);
            const entryTime = row.createdAt ? new Date(row.createdAt).getTime() : new Date(`${row.openingDate}T${row.openingTime || '00:00'}:00`).getTime();
            const isWithin24Hours = (Date.now() - entryTime) < 24 * 60 * 60 * 1000;
            const canEdit = isStaff || isWithin24Hours;

            return <tr key={row._id} className={`group ${row.complete ? "hover:bg-emerald-50" : "bg-amber-50"}`}>
              <td className={`${cell} sticky-date w-[94px] min-w-[94px] whitespace-nowrap font-medium`}>
                {displayDate(row.openingDate)}
              </td>
              <td className={`${cell} ${divider} w-[68px] min-w-[68px]`}>{balance(row.openingReading)}</td>
              <td className={cell + " whitespace-nowrap"}>{row.closingDate ? displayDate(row.closingDate) : "\u2014"}</td>
              <td className={`${cell} ${divider}`}>{balance(row.closingReading)}</td>
              <td className={cell}>{balance(openingFuel)}</td>
              <td className={cell}>{balance(row.fill1Liters)}{row.fill1Reading != null && <small className="block text-[9px]">@ {row.fill1Reading} km</small>}</td>
              <td className={cell}>{balance(row.fill2Liters)}{row.fill2Reading != null && <small className="block text-[9px]">@ {row.fill2Reading} km</small>}</td>
              <td className={cell}>{balance(totalFuel)}</td>
              <td className={cell}>{balance(closingFuel)}</td>
              <td className={`${cell} ${divider} font-bold`}>{balance(row.consumedLiters)}</td>
              <td className={cell}>{balance(row.kmRun)}</td>
              <td className={`${cell} ${divider}`}>{balance(row.fullCycleDistanceKm)}</td>
              <td className={`${cell} ${divider} font-bold text-emerald-700`}>{balance(row.averageKmPerLiter)}</td>
              <StationCell row={row} stations={stations} onStationUpdate={onStationUpdate} canEdit={canEdit} />
              <td className={`${cell} sticky-action no-print whitespace-nowrap w-14 min-w-[54px] !border-l-2 !border-l-emerald-800`}>
                {canEdit ? (
                  <button
                    onClick={() => onEdit(row)}
                    className={!row.complete ? actionGreenButton : actionEditButton}
                  >
                    {row.complete ? "Edit" : "Update"}
                  </button>
                ) : (
                  "—"
                )}
              </td>
            </tr>;
          })}
        </tbody>
        <tfoot className="font-bold bg-[#dce9df]">
          <tr>
            <td className={`${cell} sticky-date`}>Total</td>
            <td className={`${cell} ${divider} w-[68px] min-w-[68px]`}>—</td>
            <td className={cell}>—</td>
            <td className={`${cell} ${divider}`}>—</td>
            <td className={cell}>—</td>
            <td className={cell}>{balance(sum(sortedRows, "fill1Liters"))}</td>
            <td className={cell}>{balance(sum(sortedRows, "fill2Liters"))}</td>
            <td className={cell}>—</td>
            <td className={cell}>—</td>
            <td className={`${cell} ${divider}`}>{balance(cycles.length ? sum(cycles, "consumedLiters") : null)}</td>
            <td className={cell}>{balance(sum(completedRows, "kmRun"))}</td>
            <td className={`${cell} ${divider}`}>{balance(cycles.length ? cycleDistance : null)}</td>
            <td className={`${cell} ${divider}`}>{balance(cycleFuel > 0 ? cycleDistance / cycleFuel : null)}</td>
            <td className={cell}>—</td>
            <td className={`${cell} sticky-action no-print whitespace-nowrap w-14 min-w-[54px] !border-l-2 !border-l-emerald-800`}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </section>;
}

export default function TransportPage() {
  const [vehicles, setVehicles] = useState([]), [vehicleId, setVehicleId] = useState("all");
  const [rows, setRows] = useState([]), [stations, setStations] = useState([]), [loading, setLoading] = useState(true);
  const [error, setError] = useState(""), [form, setForm] = useState(null), [exporting, setExporting] = useState(false);
  const [to, setTo] = useState(today());
  const [from, setFrom] = useState(addDays(today(), -6));
  const reportRef = useRef(null);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (vehicleId !== "all") params.set("vehicleId", vehicleId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const [reportData, stationData] = await Promise.all([
        api(`/transport-entries/report${queryStr}`),
        api("/transport-stations").catch(() => ({ stations: [] })),
      ]);
      setVehicles(reportData.vehicles);
      setRows(reportData.rows);
      const combined = [...new Set([
        ...(reportData.stations || []),
        ...(stationData.stations || []),
      ])];
      setStations(combined);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [vehicleId, from, to]);
  useEffect(() => { load(); }, [load]);
  const shownVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.active && (vehicleId === "all" || vehicle._id === vehicleId)), [vehicles, vehicleId]);
  const exportPdf = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    setError("");
    reportRef.current.classList.add("pdf-exporting");
    try {
      await html2pdf().set({
        filename: `transport-report-${from}-to-${to}.pdf`,
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
  const handleStationUpdate = (entryId, newStation) => {
    setRows((prev) =>
      prev.map((r) => (r._id === entryId ? { ...r, station: newStation } : r))
    );
  };
  return <div className="space-y-3">
    <div>
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Second reporting module</p>
      <h1 className="mt-1 text-xl sm:text-2xl font-black">Transport Report</h1>
    </div>
    <Alert>{error}</Alert>

    {/* Responsive Toolbar with visible buttons and From/To date pickers */}
    <div className="no-print flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2">
      <label className="grid gap-0.5 text-xs font-bold text-slate-600 w-44 max-w-full">
        Vehicle
        <select
          className={`${inputClass} !min-h-0 h-8 sm:h-9 !py-1 text-xs w-full font-semibold text-slate-800`}
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          <option value="all">All vehicles</option>
          {vehicles.filter((vehicle) => vehicle.active).map((vehicle) => (
            <option key={vehicle._id} value={vehicle._id}>
              {vehicle.name} — {vehicle.number} — {vehicle.tankCapacity} L
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-end gap-2 w-auto">
        <label className="grid gap-0.5 text-xs font-bold text-slate-600">
          From
          <input
            type="date"
            className={`${inputClass} !min-h-0 h-8 sm:h-9 cursor-pointer !rounded-lg !px-2 !py-1 text-xs w-28 sm:w-32 font-semibold text-slate-800`}
            value={from}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>

        <label className="grid gap-0.5 text-xs font-bold text-slate-600">
          To
          <input
            type="date"
            className={`${inputClass} !min-h-0 h-8 sm:h-9 cursor-pointer !rounded-lg !px-2 !py-1 text-xs w-28 sm:w-32 font-semibold text-slate-800`}
            value={to}
            onClick={(e) => e.currentTarget.showPicker?.()}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 w-auto">
        <button
          onClick={exportPdf}
          disabled={exporting}
          style={{ fontSize: "10.5px", color: "#1e293b", fontWeight: 600 }}
          className="inline-flex items-center justify-center h-8 sm:h-8.5 w-[88px] sm:w-24 rounded-lg border border-slate-300 bg-white px-1 py-1 font-semibold text-slate-800 hover:bg-slate-50 transition shadow-2xs whitespace-nowrap text-center disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export PDF"}
        </button>

        <button
          onClick={() => window.print()}
          style={{ fontSize: "10.5px", color: "#1e293b", fontWeight: 600 }}
          className="inline-flex items-center justify-center h-8 sm:h-8.5 w-[88px] sm:w-24 rounded-lg border border-slate-300 bg-white px-1 py-1 font-semibold text-slate-800 hover:bg-slate-50 transition shadow-2xs whitespace-nowrap text-center"
        >
          Print
        </button>

        <button
          onClick={() => {
            const vehicle = shownVehicles[0];
            if (vehicle) setForm({ vehicleId: vehicle._id, initialDate: to || today() });
          }}
          disabled={!shownVehicles.length}
          style={{ fontSize: "10.5px" }}
          className="inline-flex items-center justify-center h-8 sm:h-8.5 w-[88px] sm:w-24 rounded-lg bg-emerald-800 hover:bg-emerald-900 px-1 py-1 font-bold text-white transition shadow-2xs whitespace-nowrap text-center disabled:cursor-not-allowed disabled:opacity-50"
        >
          ＋ Add entry
        </button>
      </div>
    </div>

    {form && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Transport entry"
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-2 sm:p-4 backdrop-blur-xs"
        onMouseDown={() => setForm(null)}
      >
        <div className="w-full max-w-[310px] sm:max-w-md" onMouseDown={(event) => event.stopPropagation()}>
          <TransportEntryForm
            entryId={form.entryId}
            initialVehicleId={form.vehicleId}
            initialDate={form.initialDate}
            onCancel={() => setForm(null)}
            onSaved={() => {
              setForm(null);
              load();
            }}
          />
        </div>
      </div>
    )}

    {loading ? (
      <Spinner label="Loading transport report…" />
    ) : (
      <div ref={reportRef} className="report-export-content space-y-5">
        {shownVehicles.length ? (
          shownVehicles.map((vehicle) => (
            <VehicleTable
              key={vehicle._id}
              vehicle={vehicle}
              selectedDate={to}
              rows={rows.filter((row) => String(row.vehicle) === vehicle._id)}
              stations={stations}
              onEdit={(row) => setForm({ entryId: row._id })}
              onAdd={(id, nextDate) => setForm({ vehicleId: id, initialDate: nextDate })}
              onStationUpdate={handleStationUpdate}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            An administrator must add a transport vehicle first.
          </div>
        )}
      </div>
    )}
  </div>;
}
