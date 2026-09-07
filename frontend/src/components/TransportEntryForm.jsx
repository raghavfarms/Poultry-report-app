import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";
import { addDays, today } from "../utils/date.js";
import { Alert, inputClass, primaryButton, secondaryButton, Spinner } from "./Ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const empty = { vehicleId: "", station: "", from: "", destination: "", openingDate: today(), openingTime: "00:00", openingReading: "", closingDate: addDays(today(), 1), closingTime: "00:00", closingReading: "", openingFull: true, fill1Liters: "", fill2Liters: "", fill1Reading: "", fill2Reading: "", isFull: false, note: "" };
const num = (value) => Number(value || 0);
const openDatePicker = (event) => event.currentTarget.showPicker?.();

function FormField({ label, children }) {
  return (
    <label className="grid gap-0.5 text-[9.5px] sm:text-[11px] font-bold text-slate-600">
      <span className="truncate">{label}</span>
      {children}
    </label>
  );
}

export default function TransportEntryForm({ entryId, initialVehicleId, initialDate, onSaved, onCancel }) {
  const { user } = useAuth();
  const completing = Boolean(entryId) && !["admin", "developer"].includes(user.role);
  const [vehicles, setVehicles] = useState([]), [stations, setStations] = useState([]), [form, setForm] = useState({
    ...empty,
    vehicleId: initialVehicleId || "",
    openingDate: initialDate || today(),
    closingDate: addDays(initialDate || today(), 1),
    openingReading: "",
  });
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState({ lastFullReading: null, firstCycleReading: null, pendingFuelLiters: 0 });
  const [saving, setSaving] = useState(false), [error, setError] = useState("");

  useEffect(() => {
    let active = true; setLoading(true);
    Promise.all([
      api("/transport-vehicles"),
      api("/transport-stations"),
      entryId ? api(`/transport-entries/${entryId}`) : Promise.resolve(null),
    ])
      .then(([vehicleData, stationData, entryData]) => {
        if (!active) return;
        setVehicles(vehicleData.vehicles);
        setStations(stationData?.stations || []);
        if (entryData?.entry) {
          const e = entryData.entry;
          setForm({ ...empty, ...e, closingDate: e.closingDate || addDays(e.openingDate, 1), fill1Reading: e.fill1Reading ?? "", fill2Reading: e.fill2Reading ?? "", vehicleId: e.vehicle });
        } else {
          setForm((current) => ({
            ...current,
            vehicleId: current.vehicleId || initialVehicleId || vehicleData.vehicles[0]?._id || "",
            openingDate: initialDate || current.openingDate || today(),
            closingDate: addDays(initialDate || current.openingDate || today(), 1),
            openingReading: current.openingReading || "",
          }));
        }
      })
      .catch((e) => setError(e.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [entryId, initialVehicleId, initialDate]);
  useEffect(() => {
    if (!form.vehicleId || !form.openingDate || !form.openingTime) { setCycle({ lastFullReading: null, firstCycleReading: null, pendingFuelLiters: 0 }); return; }
    const query = new URLSearchParams({ vehicleId: form.vehicleId, date: form.openingDate, time: form.openingTime, ...(entryId ? { entryId } : {}) });
    api(`/transport-entries/opening?${query}`).then(({ lastFullReading, firstCycleReading, pendingFuelLiters }) => setCycle({ lastFullReading, firstCycleReading, pendingFuelLiters })).catch((e) => setError(e.message));
  }, [form.vehicleId, form.openingDate, form.openingTime, entryId]);
  const totals = useMemo(() => { const complete = form.closingReading !== "" && form.closingReading != null; const kmRun = complete ? num(form.closingReading) - num(form.openingReading) : null; const fill = num(form.fill1Liters) + num(form.fill2Liters); const cycleFuel = cycle.pendingFuelLiters + fill; const cycleStart = cycle.lastFullReading ?? cycle.firstCycleReading ?? (form.openingFull ? num(form.openingReading) : null); const cycleDistance = complete ? num(form.closingReading) - cycleStart : null; const average = complete && cycleStart != null && form.isFull && cycleFuel > 0 ? cycleDistance / cycleFuel : null; return { complete, kmRun, total: fill, consumed: fill, average }; }, [form, cycle]);
  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value, ...(key === "openingDate" ? { closingDate: e.target.value ? addDays(e.target.value, 1) : "" } : {}) });
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (totals.complete && totals.kmRun < 0) {
      setError("Closing reading cannot be below opening reading.");
      return;
    }
    setSaving(true);
    try { const { entry } = await api(entryId ? `/transport-entries/${entryId}` : "/transport-entries", { method: entryId ? "PUT" : "POST", body: JSON.stringify(form) }); onSaved(entry); } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  if (loading) return <div className="rounded-2xl bg-white"><Spinner label="Preparing transport entry…" /></div>;
  const fields = [
    ["Opening date", "openingDate", "date"], ["Opening reading", "openingReading", "number"],
    ["Closing date", "closingDate", "date"], ["Closing reading", "closingReading", "number"],
    ["Fill 1 (L)", "fill1Liters", "number"], ["Fill 2 (L)", "fill2Liters", "number"],
  ];
  return <form onSubmit={submit} className="w-full rounded-2xl bg-white p-2 sm:p-4 shadow-xl border border-slate-100">
    <div className="mb-1 flex items-center justify-between"><div><p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-wider text-emerald-700">Transport journey</p><h2 className="text-xs sm:text-base font-black text-slate-900">{entryId ? "Edit entry" : "Add entry"}</h2></div><button type="button" onClick={onCancel} className={`${secondaryButton} !min-h-[22px] !h-[22px] !px-1.5 !py-0 !text-[11px]`}>Close</button></div><Alert>{error}</Alert>
    {!vehicles.length ? <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">No active transport vehicle exists. An administrator must add one.</div> : <div className="mt-1 grid grid-cols-2 gap-1 sm:gap-2">
      <FormField label="Vehicle"><select required disabled={completing} className={`${inputClass} !min-h-[26px] !h-[26px] sm:!min-h-8 sm:!h-8 !rounded-md sm:!rounded-lg !px-1.5 !py-0 text-[10.5px] sm:text-xs`} value={form.vehicleId} onChange={update("vehicleId")}>{vehicles.map((v) => <option key={v._id} value={v._id}>{v.name} — {v.number}</option>)}</select></FormField>
      <FormField label="Station / Location">
        {stations.length > 0 ? (
          <select className={`${inputClass} !min-h-[26px] !h-[26px] sm:!min-h-8 sm:!h-8 !rounded-md sm:!rounded-lg !px-1.5 !py-0 text-[10.5px] sm:text-xs`} value={form.station || ""} onChange={update("station")}>
            <option value="">— Select Location —</option>
            {stations.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        ) : (
          <input type="text" placeholder="e.g. AMETHI, GKR" className={`${inputClass} !min-h-[26px] !h-[26px] sm:!min-h-8 sm:!h-8 !rounded-md sm:!rounded-lg !px-1.5 !py-0 text-[10.5px] sm:text-xs`} value={form.station || ""} onChange={update("station")} />
        )}
      </FormField>
      {fields.map(([label, key, type]) => <FormField key={key} label={label}><input required={!['from', 'destination', 'closingReading', 'fill1Liters', 'fill2Liters', 'note'].includes(key)} disabled={completing && !["closingReading", "closingDate", "fill1Liters", "fill2Liters"].includes(key)} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} onClick={type === "date" ? openDatePicker : undefined} className={`${inputClass} !min-h-[26px] !h-[26px] sm:!min-h-8 sm:!h-8 !rounded-md sm:!rounded-lg !px-1.5 !py-0 text-[10.5px] sm:text-xs ${type === "date" ? "cursor-pointer" : ""}`} value={form[key]} onChange={update(key)} /></FormField>)}
      <FormField label="Opening tank"><label className="flex min-h-[24px] h-[24px] items-center gap-1 text-[10px] sm:text-[11px] cursor-pointer text-slate-700"><input type="checkbox" disabled={Boolean(entryId)} checked={form.openingFull} onChange={(event) => setForm({ ...form, openingFull: event.target.checked })} className="accent-emerald-700" /> Full at departure</label></FormField>
      <FormField label="Closing tank"><label className="flex min-h-[24px] h-[24px] items-center gap-1 rounded-md bg-blue-50 px-1 text-[10px] sm:text-[11px] font-bold cursor-pointer text-blue-900"><input type="checkbox" checked={form.isFull} onChange={(event) => setForm({ ...form, isFull: event.target.checked })} className="accent-emerald-700" /> Full at closing</label></FormField>
    </div>}
    {!!vehicles.length && <><div className="mt-1.5 grid grid-cols-3 gap-0.5 rounded-lg bg-emerald-50/80 p-0.5 sm:p-1 text-[8.5px] sm:text-[10px] text-center border border-emerald-100"><span><b className="text-slate-500 font-semibold block text-[7.5px] sm:text-[8.5px]">KM RUN</b>{totals.kmRun == null ? "—" : Number(totals.kmRun.toFixed(2))}</span><span><b className="text-slate-500 font-semibold block text-[7.5px] sm:text-[8.5px]">FUEL ADDED</b>{Number(totals.total.toFixed(2))} L</span><span><b className="text-slate-500 font-semibold block text-[7.5px] sm:text-[8.5px]">FULL-CYCLE AVG</b>{totals.average == null ? "—" : `${Number(totals.average.toFixed(2))} km/L`}</span></div><div className="mt-1.5 flex justify-end gap-1"><button type="button" onClick={onCancel} className={`${secondaryButton} !min-h-[26px] !h-[26px] sm:!min-h-8 sm:!h-8 !px-2.5 !py-0 !text-[11px] sm:!text-xs`}>Cancel</button><button disabled={saving} className={`${primaryButton} !min-h-[26px] !h-[26px] sm:!min-h-8 sm:!h-8 !px-3 !py-0 !text-[11px] sm:!text-xs`}>{saving ? "Saving…" : totals.complete ? "Save closing" : "Save opening"}</button></div></>}
  </form>;
}
