import { useState, useEffect } from 'react';
import { Alert, Field, inputClass, primaryButton, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath, saveAttendance } from '../services/adminApi.js';
import { captureLocation } from '../services/captureLocation.js';
import { useAttendanceData, useDebounced, LoadState, Pager, Dialog, Status, panelClass, cellClass } from './AdminUi.jsx';

function GeofenceForm({ item, firmId, firms = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    name: item?.name || '',
    firmId: item?.firm?._id || item?.firm || firmId || '',
    latitude: item?.latitude != null ? String(item.latitude) : '',
    longitude: item?.longitude != null ? String(item.longitude) : '',
    radiusMetres: item?.radiusMetres != null ? String(item.radiusMetres) : '500',
    isOfficeTesting: item?.isOfficeTesting ?? false,
    active: item?.active ?? true,
    remarks: item?.remarks || '',
    order: item?.order || 0,
  });
  const [detectingGps, setDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function detectCurrentLocation(silent = false) {
    const isSilent = silent === true;
    if (!isSilent) {
      setDetectingGps(true);
      setGpsNotice('📡 Fetching live GPS coordinates…');
    }
    try {
      const loc = await captureLocation({ timeoutMs: 3000, maximumAge: 60000, preferCache: false });
      if (loc && loc.status === 'CAPTURED' && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) {
        const lat = Number(loc.latitude).toFixed(6);
        const lon = Number(loc.longitude).toFixed(6);
        setForm((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lon,
        }));
        setGpsNotice(`📍 Live GPS Applied: ${lat}, ${lon} (±${Math.round(loc.accuracyMetres || 0)}m)`);
      } else {
        if (!isSilent) {
          setGpsNotice(`⚠️ ${loc?.status || 'Unable to fetch position'}. You can also enter coordinates manually.`);
        }
      }
    } catch (err) {
      if (!isSilent) {
        setGpsNotice(`⚠️ GPS Error: ${err.message || 'Unable to fetch position'}`);
      }
    } finally {
      if (!isSilent) setDetectingGps(false);
    }
  }

  // Auto-fill live coordinates if creating a new geofence location and coordinates are empty
  useEffect(() => {
    if (!item && !form.latitude && !form.longitude) {
      detectCurrentLocation(true);
    }
  }, []);

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    const body = {
      name: form.name,
      firmId: form.firmId || null,
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      radiusMetres: Number(form.radiusMetres) || 500,
      isOfficeTesting: Boolean(form.isOfficeTesting),
      active: Boolean(form.active),
      remarks: form.remarks,
      order: Number(form.order) || 0,
    };

    try {
      await saveAttendance(`geofences${item ? `/${item._id}` : ''}`, body, item ? 'PATCH' : 'POST');
      onSaved(`Geofence location saved.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`${item ? 'Edit' : 'Add'} Geofence Location`}
      onClose={onClose}
      busy={busy}
      maxWidth="460px"
    >
      <form onSubmit={save} className="space-y-3">
        <Alert>{error}</Alert>
        <fieldset disabled={busy} className="space-y-2.5">
          <Field label="Location / Farm Name *">
            <input
              autoFocus
              required
              maxLength={100}
              placeholder="e.g. Raghav Farm Campus, Head Office Testing"
              className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2.5 text-xs font-semibold rounded-lg`}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>

          <Field label="Applies To Firm">
            <select
              className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 text-xs rounded-lg`}
              value={form.firmId}
              onChange={(e) => set('firmId', e.target.value)}
            >
              <option value="">All Farms / Office Testing (Global)</option>
              {firms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>

          {/* GPS Detection Banner */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>📍</span>
                <span>GPS Coordinates</span>
              </span>
              <button
                type="button"
                onClick={() => detectCurrentLocation(false)}
                disabled={detectingGps}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-700 bg-white hover:bg-sky-100 border border-sky-300 rounded-md px-2.5 py-1 shadow-2xs transition active:scale-95 cursor-pointer"
              >
                <span>{detectingGps ? '⏳' : '📍'}</span>
                <span>{detectingGps ? 'Detecting…' : 'Use Current GPS'}</span>
              </button>
            </div>

            {gpsNotice && (
              <p className="text-[11px] font-semibold text-sky-800 bg-sky-100/80 rounded px-2 py-1">
                {gpsNotice}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Field label="Latitude *">
                <input
                  required
                  type="number"
                  step="any"
                  placeholder="e.g. 18.520430"
                  className={`${inputClass} !min-h-7.5 !h-7.5 !py-0.5 !px-2 text-xs rounded-lg font-mono`}
                  value={form.latitude}
                  onChange={(e) => set('latitude', e.target.value)}
                />
              </Field>
              <Field label="Longitude *">
                <input
                  required
                  type="number"
                  step="any"
                  placeholder="e.g. 73.856740"
                  className={`${inputClass} !min-h-7.5 !h-7.5 !py-0.5 !px-2 text-xs rounded-lg font-mono`}
                  value={form.longitude}
                  onChange={(e) => set('longitude', e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-[1.2fr_1fr] gap-2 items-center">
            <Field label="Boundary Radius (Metres) *">
              <input
                required
                type="number"
                min="10"
                max="50000"
                step="10"
                placeholder="500"
                className={`${inputClass} !min-h-7.5 !h-7.5 !py-0.5 !px-2 text-xs rounded-lg`}
                value={form.radiusMetres}
                onChange={(e) => set('radiusMetres', e.target.value)}
              />
            </Field>
            <div className="text-[11px] text-slate-500 pt-3">
              Recommended: <span className="font-bold text-slate-800">500m</span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                checked={form.isOfficeTesting}
                onChange={(e) => set('isOfficeTesting', e.target.checked)}
              />
              <span>🏢 Office / Remote Testing Location</span>
            </label>
            <p className="text-[10.5px] text-slate-500 leading-tight pl-5.5">
              Check this if this location is your administrative office or testing environment. Scans here will be accepted and noted as office testing.
            </p>
          </div>

          <Field label="Remarks (Optional)">
            <textarea
              rows={2}
              className={`${inputClass} !min-h-11 !h-11 !py-1.5 !px-2.5 text-xs rounded-lg resize-none`}
              maxLength={1000}
              placeholder="e.g. Raghav farm main entrance and sheds…"
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
              checked={form.active}
              onChange={(e) => set('active', e.target.checked)}
            />
            <span>Active (Enforce boundary for attendance)</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              className={`${secondaryButton} !min-h-7.5 !h-7.5 !px-3.5 text-xs font-semibold rounded-lg cursor-pointer`}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className={`${primaryButton} !min-h-7.5 !h-7.5 !px-4 text-xs font-bold rounded-lg cursor-pointer`}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save Geofence'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

export default function GeofencePanel({ firmId, firms = [], revision, onChanged }) {
  const [search, setSearch] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [editor, setEditor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const state = useAttendanceData(
    attendancePath('geofences', { firmId, search: useDebounced(search), active, page, limit }),
    revision
  );

  async function toggle(item) {
    setBusy(true);
    setError('');
    try {
      await saveAttendance(`geofences/${item._id}`, { active: !item.active }, 'PATCH');
      onChanged?.(`${item.name} ${item.active ? 'deactivated' : 'activated'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${panelClass} space-y-3`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
            <span>📍</span>
            <span>Farm Geofence Master</span>
          </h2>
          <p className="text-xs text-slate-500">
            Configure farm GPS boundary coordinates. Workers can only mark attendance when physically within these boundaries.
          </p>
        </div>
        <button
          className={`${primaryButton} self-start sm:self-auto !min-h-7.5 h-7.5 px-3 py-1.5 text-xs font-semibold rounded-xl whitespace-nowrap cursor-pointer`}
          onClick={() => setEditor({ item: null })}
        >
          + Add Geofence Location
        </button>
      </div>

      <Alert>{error}</Alert>

      {/* Filter toolbar */}
      <div className="flex items-center gap-1.5 text-xs">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 text-xs">
            🔍
          </span>
          <input
            aria-label="Search geofences"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-500"
            placeholder="Search farm or location names…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        <select
          aria-label="Active status"
          className={`shrink-0 rounded-lg border px-2 py-1.5 text-[11px] font-medium outline-none transition cursor-pointer ${
            active
              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      <LoadState state={state}>
        {!state.data?.items.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-2">
            <span className="text-3xl">📍</span>
            <p className="text-sm font-semibold text-slate-700">No Geofence Locations Configured</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click &quot;+ Add Geofence Location&quot; to set the GPS coordinates and boundary radius for Raghav Farm or your office testing location.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="attendance-table w-full min-w-[640px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className={`${cellClass} text-left`}>Location Name</th>
                  <th className={`${cellClass} text-left`}>Farm / Scope</th>
                  <th className={`${cellClass} text-left`}>GPS Coordinates</th>
                  <th className={`${cellClass} text-left`}>Boundary Radius</th>
                  <th className={`${cellClass} text-left`}>Type</th>
                  <th className={`${cellClass} text-left`}>Status</th>
                  <th className={`${cellClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.data.items.map((item) => (
                  <tr key={item._id} className="hover:bg-slate-50/80 group">
                    <td className={`${cellClass} font-semibold text-slate-900`}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">📍</span>
                        <span>{item.name}</span>
                      </div>
                      {item.remarks && (
                        <p className="text-[11px] text-slate-400 font-normal pl-5">{item.remarks}</p>
                      )}
                    </td>
                    <td className={cellClass}>
                      {item.firm?.name ? (
                        <span className="inline-flex items-center font-semibold text-slate-700">
                          {item.firm.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10.5px] font-semibold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded">
                          All Farms / Office
                        </span>
                      )}
                    </td>
                    <td className={cellClass}>
                      <a
                        href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        title="View on Google Maps"
                        className="font-mono text-xs text-sky-700 hover:text-sky-900 hover:underline flex items-center gap-1"
                      >
                        <span>{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</span>
                        <span className="text-[10px]">↗</span>
                      </a>
                    </td>
                    <td className={cellClass}>
                      <span className="font-semibold text-slate-800">{item.radiusMetres || 500} m</span>
                    </td>
                    <td className={cellClass}>
                      {item.isOfficeTesting ? (
                        <span className="inline-flex items-center text-[10.5px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          🏢 Office Testing
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10.5px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          🏡 Farm Boundary
                        </span>
                      )}
                    </td>
                    <td className={cellClass}>
                      <Status active={item.active} />
                    </td>
                    <td className={`${cellClass} text-right whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className={`${secondaryButton} !min-h-7 h-7 px-2.5 text-xs font-semibold rounded-lg`}
                          onClick={() => setEditor({ item })}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:text-slate-800 px-1.5 py-1 rounded transition"
                          disabled={busy}
                          onClick={() => toggle(item)}
                        >
                          {item.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          pagination={state.data?.pagination}
          onPage={setPage}
          onLimit={(value) => {
            setLimit(value);
            setPage(1);
          }}
        />
      </LoadState>

      {editor && (
        <GeofenceForm
          item={editor.item}
          firmId={firmId}
          firms={firms}
          onClose={() => setEditor(null)}
          onSaved={(msg) => {
            setEditor(null);
            onChanged?.(msg);
          }}
        />
      )}
    </section>
  );
}

