import { useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";
import { Alert, Field, inputClass, primaryButton, secondaryButton, Spinner } from "../components/Ui.jsx";

const blank = { name: "", number: "", tankCapacity: "", order: 0 };

export default function TransportAdminPage() {
  const [vehicles, setVehicles] = useState([]), [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null), [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [stations, setStations] = useState([]), [newStationName, setNewStationName] = useState("");
  const [showStationModal, setShowStationModal] = useState(false), [busyStation, setBusyStation] = useState(false);
  const locationCardRef = useRef(null);
  const locationBtnRef = useRef(null);

  useEffect(() => {
    if (!showStationModal) return;
    const handlePointerDown = (e) => {
      if (
        locationCardRef.current &&
        !locationCardRef.current.contains(e.target) &&
        locationBtnRef.current &&
        !locationBtnRef.current.contains(e.target)
      ) {
        setShowStationModal(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showStationModal]);

  const load = () => {
    setLoading(true);
    Promise.all([
      api("/transport-vehicles?includeInactive=true"),
      api("/transport-stations"),
    ])
      .then(([{ vehicles }, { stations }]) => {
        setVehicles(vehicles);
        setStations(stations || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const close = () => { setShowForm(false); setEditing(null); setForm(blank); };
  const edit = (v) => { setEditing(v._id); setForm({ name: v.name, number: v.number, tankCapacity: v.tankCapacity, order: v.order }); setShowForm(true); };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(editing ? `/transport-vehicles/${editing}` : "/transport-vehicles", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      setSuccess(editing ? "Vehicle updated." : "Vehicle added.");
      close();
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (v) => {
    if (v.active && !window.confirm(`Remove ${v.name} (${v.number})? Historical reports remain unchanged.`)) return;
    try {
      await api(`/transport-vehicles/${v._id}${v.active ? "" : "/restore"}`, { method: v.active ? "DELETE" : "PATCH" });
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const addStationSubmit = async (e) => {
    e.preventDefault();
    if (!newStationName.trim()) return;
    setBusyStation(true); setError(""); setSuccess("");
    try {
      const res = await api("/transport-stations", {
        method: "POST",
        body: JSON.stringify({ name: newStationName.trim() }),
      });
      setStations(res.stations || []);
      setNewStationName("");
      setSuccess("Location added successfully.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyStation(false);
    }
  };

  const removeStation = async (toRemove) => {
    if (!window.confirm(`Delete location "${toRemove}"?`)) return;
    setError(""); setSuccess("");
    try {
      const res = await api(`/transport-stations/${encodeURIComponent(toRemove)}`, {
        method: "DELETE",
      });
      setStations(res.stations || []);
      setSuccess(`Deleted location "${toRemove}".`);
    } catch (e) {
      setError(e.message);
    }
  };

  return <div className="max-w-4xl space-y-4">
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Admin only</p>
      <h1 className="text-xl font-black">Transport Vehicles</h1>
      <p className="text-xs text-slate-500">Vehicles are independent and are not connected to a firm.</p>
    </div>
    <Alert>{error}</Alert>
    <Alert type="success">{success}</Alert>

    <section className="relative w-full max-w-[360px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Vehicles</h2>
          <p className="text-[10px] text-slate-500">{vehicles.filter((v) => v.active).length} active</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            ref={locationBtnRef}
            type="button"
            onClick={() => setShowStationModal(!showStationModal)}
            className={`${secondaryButton} !min-h-8 !rounded-lg !px-2.5 !py-1 !text-xs font-semibold`}
            title="Manage common locations"
          >
            📍 Locations ({stations.length})
          </button>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={`${primaryButton} !min-h-8 !rounded-lg !px-3 !py-1 !text-xs`}
          >
            ＋ Add vehicle
          </button>
        </div>
      </div>

      {/* Floating card opening directly over vehicles without shifting them down */}
      {showStationModal && (
        <div
          ref={locationCardRef}
          className="absolute top-[48px] left-2 right-2 z-30 rounded-xl border border-emerald-300 bg-[#f4faf6] p-3 shadow-2xl space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-emerald-950">Common Locations</h3>
              <p className="text-[10px] text-slate-500">{stations.length} configured</p>
            </div>
            <button
              type="button"
              onClick={() => setShowStationModal(false)}
              className="rounded p-1 text-slate-400 hover:bg-emerald-100 hover:text-slate-700 text-xs font-bold"
              title="Close"
            >
              ✕
            </button>
          </div>

          <form onSubmit={addStationSubmit} className="flex gap-1.5">
            <input
              autoFocus
              className={`${inputClass} !min-h-7 !py-1 !px-2 !text-xs bg-white flex-1`}
              placeholder="Add location (e.g. AMETHI)"
              value={newStationName}
              onChange={(e) => setNewStationName(e.target.value)}
            />
            <button
              type="submit"
              disabled={busyStation || !newStationName.trim()}
              className={`${primaryButton} !min-h-7 !rounded-lg !px-3 !py-1 !text-xs whitespace-nowrap`}
            >
              {busyStation ? "…" : "＋ Add"}
            </button>
          </form>

          <div className="max-h-56 overflow-y-auto rounded-lg border border-emerald-200 bg-white p-1 space-y-1">
            {stations.length > 0 ? (
              stations.map((st) => (
                <div
                  key={st}
                  className="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-emerald-50/40 border border-slate-100"
                >
                  <span className="font-bold text-slate-800 tracking-wide">{st}</span>
                  <button
                    type="button"
                    onClick={() => removeStation(st)}
                    className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                    title={`Delete location ${st}`}
                  >
                    Delete
                  </button>
                </div>
              ))
            ) : (
              <p className="py-2 text-center text-[11px] italic text-slate-400">No locations added yet.</p>
            )}
          </div>
        </div>
      )}

      {loading ? <Spinner /> : <div className="grid gap-1.5">
        {vehicles.map((v) => (
          <article key={v._id} className={`rounded-lg border border-slate-200 p-2 ${v.active ? "" : "bg-slate-50 opacity-70"}`}>
            <div className="flex items-center gap-1.5">
              <h3 className="mr-1 min-w-0 flex-1 truncate text-sm font-bold">{v.name}</h3>
              <div className="flex shrink-0 gap-1">
                {v.active && <button onClick={() => edit(v)} className={`${secondaryButton} !min-h-7 !px-2 !py-1 !text-[11px]`}>Edit</button>}
                <button onClick={() => toggle(v)} className={`${secondaryButton} !min-h-7 !px-2 !py-1 !text-[11px]`}>{v.active ? "Remove" : "Restore"}</button>
              </div>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">{v.number} · Tank {v.tankCapacity} L</p>
          </article>
        ))}
      </div>}
    </section>

    {/* Add / Edit Vehicle Modal */}
    {showForm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" onMouseDown={close}>
        <form onSubmit={save} onMouseDown={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5">
          <h2 className="font-black">{editing ? "Edit vehicle" : "Add vehicle"}</h2>
          <Field label="Vehicle name"><input required className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Vehicle number"><input required className={inputClass} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} /></Field>
          <Field label="Tank capacity (L)"><input required type="number" min="0" className={inputClass} value={form.tankCapacity} onChange={(e) => setForm({ ...form, tankCapacity: e.target.value })} /></Field>
          <Field label="Display order"><input type="number" className={inputClass} value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={close} className={secondaryButton}>Cancel</button>
            <button disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    )}
  </div>;
}
