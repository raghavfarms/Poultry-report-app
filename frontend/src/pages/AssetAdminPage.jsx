import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import { canAccessTemperatureMaster } from "../utils/moduleAccess.js";
import TransportAdminPage from "./TransportAdminPage.jsx";
import TemperatureMasterPage from "../temperature/pages/TemperatureMaster.jsx";
import {
  Alert,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
  Spinner,
} from "../components/Ui.jsx";

const blank = {
  label: "",
  category: "genset",
  tankCapacity: 0,
  serviceHours: 225,
  order: 0,
};

function AssetSection() {
  const [firms, setFirms] = useState([]);
  const [firmId, setFirmId] = useState("");
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);
  const firm = useMemo(
    () => firms.find((item) => item._id === firmId),
    [firms, firmId],
  );

  useEffect(() => {
    setOpeningBalance(firm?.dieselOpeningBalance ?? 0);
  }, [firm]);

  useEffect(() => {
    api("/firms")
      .then(({ firms }) => {
        setFirms(firms);
        if (firms[0]) setFirmId(firms[0]._id);
      })
      .catch((err) => setError(err.message));
  }, []);

  const loadAssets = () => {
    if (!firmId) return;
    setLoading(true);
    api(`/assets/firm/${firmId}?includeInactive=true`)
      .then((data) => setAssets(data.assets))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadAssets, [firmId, firms]);

  const reset = () => {
    setForm(blank);
    setEditing(null);
    setShowForm(false);
  };

  const edit = (asset) => {
    setEditing(asset._id);
    setShowForm(true);
    setForm({
      label: asset.label,
      category: asset.category,
      tankCapacity: asset.tankCapacity,
      serviceHours: asset.serviceIntervalMinutes / 60,
      order: asset.order,
      active: asset.active,
    });
  };

  const saveAsset = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api(editing ? `/assets/${editing}` : `/assets/firm/${firmId}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(form),
      });
      setSuccess(editing ? "Asset updated." : "Asset added.");
      reset();
      loadAssets();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (asset) => {
    if (
      !window.confirm(
        `Remove ${asset.label}? Historical report rows will remain unchanged.`,
      )
    )
      return;
    try {
      await api(`/assets/${asset._id}`, { method: "DELETE" });
      loadAssets();
    } catch (err) {
      setError(err.message);
    }
  };

  const restore = async (asset) => {
    try {
      await api(`/assets/${asset._id}/restore`, { method: "PATCH" });
      loadAssets();
    } catch (err) {
      setError(err.message);
    }
  };

  const saveOpeningBalance = async (event) => {
    event.preventDefault();
    if (!firmId) return;
    setSavingBalance(true);
    setError("");
    setSuccess("");
    try {
      const response = await api(`/firms/${firmId}/diesel-balance`, {
        method: "PATCH",
        body: JSON.stringify({ openingBalance }),
      });
      setSuccess("Opening balance updated.");
      setFirms((prev) =>
        prev.map((item) =>
          item._id === firmId
            ? {
                ...item,
                dieselOpeningBalance: response.firm.dieselOpeningBalance,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBalance(false);
    }
  };

  const compactInput = `${inputClass} !min-h-8 !py-1 !px-2 !text-xs`;
  const compactSecondary = `${secondaryButton} !min-h-8 !rounded-lg !px-3 !py-1 !text-xs`;

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {firms.map((item) => (
          <button
            key={item._id}
            onClick={() => {
              setFirmId(item._id);
              reset();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              firmId === item._id
                ? "bg-emerald-800 text-white"
                : "border border-slate-300 bg-white text-slate-600"
            }`}
          >
            {item.name}
          </button>
        ))}
      </div>
      <Alert>{error}</Alert>
      <Alert type="success">{success}</Alert>
      {firm && (
        <section className="w-full max-w-[340px] rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Assets for {firm.name}
              </h2>
              <p className="text-[10px] text-slate-500">
                {assets.filter((item) => item.active).length} active
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                reset();
                setShowForm(true);
              }}
              className={`${primaryButton} !min-h-8 !rounded-lg !px-3 !py-1 !text-xs`}
            >
              ＋ Add asset
            </button>
          </div>
          {loading ? (
            <Spinner />
          ) : (
            <div className="grid gap-1.5">
              {assets.length ? (
                assets.map((asset) => (
                  <article
                    key={asset._id}
                    className={`rounded-lg border p-2 ${
                      asset.active
                        ? "border-slate-200"
                        : "border-slate-200 bg-slate-50 opacity-70"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <h3 className="mr-1 min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                        {asset.label}
                      </h3>
                      {!asset.active && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase">
                          Removed
                        </span>
                      )}
                      <div className="flex shrink-0 gap-1">
                        {asset.active ? (
                          <>
                            <button
                              onClick={() => edit(asset)}
                              className={`${compactSecondary} !min-h-7 !px-2 !text-[11px]`}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => remove(asset)}
                              className="min-h-7 rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-bold text-red-600"
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => restore(asset)}
                            className={`${compactSecondary} !min-h-7 !px-2 !text-[11px]`}
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Tank {asset.tankCapacity} L · Service{" "}
                      {asset.serviceIntervalMinutes / 60}h · Order {asset.order}
                    </p>
                  </article>
                ))
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
                  No assets yet. Add the first asset.
                </p>
              )}
            </div>
          )}
          {showForm && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={editing ? "Edit asset" : "Add asset"}
              className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[1px]"
              onMouseDown={reset}
            >
              <form
                onSubmit={saveAsset}
                onMouseDown={(event) => event.stopPropagation()}
                className="w-full max-w-xs rounded-xl border border-emerald-200 bg-white p-3 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    {editing ? `Edit ${form.label}` : "Add asset"}
                  </h2>
                  <button
                    type="button"
                    onClick={reset}
                    className={compactSecondary}
                  >
                    Cancel
                  </button>
                </div>
                <div className="mt-2 grid gap-2">
                  <Field label="Asset name">
                    <input
                      required
                      autoFocus
                      placeholder="e.g. 82 KVA"
                      className={compactInput}
                      value={form.label}
                      onChange={(e) =>
                        setForm({ ...form, label: e.target.value })
                      }
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Category">
                      <select
                        className={compactInput}
                        value={form.category}
                        onChange={(e) =>
                          setForm({ ...form, category: e.target.value })
                        }
                      >
                        <option value="genset">Genset</option>
                        <option value="tractor">Tractor</option>
                        <option value="vehicle">Vehicle</option>
                      </select>
                    </Field>
                    <Field label="Display order">
                      <input
                        type="number"
                        className={compactInput}
                        value={form.order}
                        onChange={(e) =>
                          setForm({ ...form, order: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Tank capacity (L)">
                      <input
                        type="number"
                        min="0"
                        className={compactInput}
                        value={form.tankCapacity}
                        onChange={(e) =>
                          setForm({ ...form, tankCapacity: e.target.value })
                        }
                      />
                    </Field>
                    <Field label="Service interval (h)">
                      <input
                        type="number"
                        min="1"
                        className={compactInput}
                        value={form.serviceHours}
                        onChange={(e) =>
                          setForm({ ...form, serviceHours: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <button
                    disabled={busy}
                    className={`${primaryButton} !min-h-9 !rounded-lg !py-1 !text-xs`}
                  >
                    {busy ? "Saving…" : editing ? "Update asset" : "Add asset"}
                  </button>
                </div>
              </form>
            </div>
          )}
          <form
            onSubmit={saveOpeningBalance}
            className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-2"
          >
            <Field label="Initial diesel opening balance (L)">
              <div className="flex items-center gap-2">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${compactInput} !h-8 !w-28 flex-none`}
                  value={openingBalance}
                  onChange={(event) => setOpeningBalance(event.target.value)}
                />
                <button
                  disabled={savingBalance}
                  className={`${primaryButton} !min-h-8 !rounded-md !px-2.5 !py-1 !text-[11px]`}
                >
                  {savingBalance ? "Saving…" : "Save"}
                </button>
              </div>
            </Field>
            <p className="mt-1 text-[9px] text-slate-500">
              Used as the opening stock before the first diesel entry.
            </p>
          </form>
        </section>
      )}
    </div>
  );
}

export default function AssetAdminPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdminOrDev = ["admin", "developer"].includes(user?.role);
  const canManageAssets = isAdminOrDev || user?.permissions?.asset_master;
  const canManageTransport = isAdminOrDev || user?.permissions?.transport_master;
  const canManageTemperature = canAccessTemperatureMaster(user);

  const allowedTabs = useMemo(() => {
    const list = [];
    if (canManageAssets) list.push("asset");
    if (canManageTransport) list.push("vehicle");
    if (canManageTemperature) list.push("temperature");
    return list;
  }, [canManageAssets, canManageTransport, canManageTemperature]);

  const rawTab = searchParams.get("tab") || "asset";
  const activeTab = allowedTabs.includes(rawTab)
    ? rawTab
    : allowedTabs[0] || "asset";

  const setActiveTab = (tab) => {
    setSearchParams(tab === "asset" ? {} : { tab });
  };

  return (
    <div className="space-y-4 max-w-7xl">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
          Admin only
        </p>
        <h1 className="text-xl font-black text-slate-900">Asset Management</h1>
        <p className="text-xs text-slate-500">
          Manage firm assets, transport vehicles, and temperature monitoring spots.
        </p>
      </div>

      {/* Top Navigation Tabs: 1 tab asset, 2 tab vehicle, 3 tab temperature */}
      <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 p-1 sm:p-1.5 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto no-scrollbar whitespace-nowrap">
        {canManageAssets && (
          <button
            type="button"
            onClick={() => setActiveTab("asset")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
              activeTab === "asset"
                ? "bg-white text-emerald-800 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>⚙</span>
            <span>Asset</span>
          </button>
        )}

        {canManageTransport && (
          <button
            type="button"
            onClick={() => setActiveTab("vehicle")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
              activeTab === "vehicle"
                ? "bg-white text-emerald-800 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>🚚</span>
            <span>Vehicle</span>
          </button>
        )}

        {canManageTemperature && (
          <button
            type="button"
            onClick={() => setActiveTab("temperature")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer shrink-0 ${
              activeTab === "temperature"
                ? "bg-white text-emerald-800 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
            }`}
          >
            <span>🌡️</span>
            <span>Temperature</span>
          </button>
        )}
      </div>

      {activeTab === "asset" && <AssetSection />}
      {activeTab === "vehicle" && <TransportAdminPage embedded={true} />}
      {activeTab === "temperature" && <TemperatureMasterPage embedded={true} />}
    </div>
  );
}
