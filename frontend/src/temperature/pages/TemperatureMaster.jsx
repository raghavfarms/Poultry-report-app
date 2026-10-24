import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api } from '../../api/client.js';
import {
  fetchSpots,
  createSpot,
  quickSetupSpots,
  deleteSpot,
  updateSpot,
  toggleSpotStatus
} from '../api/temperatureApi.js';

export default function TemperatureMasterPage() {
  // 1. Data States
  const [firms, setFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState('');
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 2. Feedback Messages
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 3. Batch Setup State (Flexible: any number of sheds and any line)
  const [batchShedCount, setBatchShedCount] = useState(4);
  const [batchLine, setBatchLine] = useState('Line 1');

  // 4. Custom Spot Form State (100% dynamic for any custom shed/line)
  const [formData, setFormData] = useState({
    shed: 'Shed 1',
    line: 'Line 1',
    position: 'Pad Side',
    customSpotCode: '',
  });

   // 5. QR Sticker Modal State
  const [qrModalSpot, setQrModalSpot] = useState(null);


  // 6. Edit Spot Modal State
  const [editingSpot, setEditingSpot] = useState(null);
  const [editFormData, setEditFormData] = useState({
    shed: '',
    line: '',
    position: 'Pad Side',
    spotCode: '',
  });

  // 7. 3-Dots Action Dropdown Menu State
  const [openMenuId, setOpenMenuId] = useState(null);

  // 8. Collapsible Setup & Add Spot Forms state (default collapsed on mobile to view 7-8 rows directly)
  const [showSetupForms, setShowSetupForms] = useState(false);

  // Close 3-dots dropdown when clicking anywhere outside
  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Load permitted poultry farms on initial page load
  useEffect(() => {
    api('/firms?module=temperature')
      .then((data) => {
        const firmList = data.firms || data || [];
        setFirms(firmList);
        if (firmList.length > 0 && !selectedFirm) {
          setSelectedFirm(firmList[0]._id);
        }
      })
      .catch((err) => {
        console.error('Failed to load farms:', err);
        setError('Failed to load farm list');
      });
  }, []);

  // Fetch spots whenever selectedFirm changes
  const loadSpots = async (firmId) => {
    if (!firmId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetchSpots(firmId);
      setSpots(res.data || []);
    } catch (err) {
      console.error('Failed to load spots:', err);
      setError(err.message || 'Failed to fetch thermometer spots');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedFirm) {
      loadSpots(selectedFirm);
    }
  }, [selectedFirm]);

  // 1. Dynamic Quick Setup Handler (Customizable sheds & line)
  const handleQuickSetup = async () => {
    if (!selectedFirm) {
      setError('Please select a farm first');
      return;
    }

    const currentFirm = firms.find((f) => f._id === selectedFirm);
    const firmName = currentFirm?.name || 'Poultry Farm';

    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await quickSetupSpots({
        firm: selectedFirm,
        firmName,
        shedCount: Number(batchShedCount) || 4,
        line: batchLine.trim() || 'Line 1',
      });
      setSuccessMsg(res.message || 'Batch setup complete! Spots generated successfully.');
      setSpots(res.data || []);
    } catch (err) {
      console.error('Quick setup error:', err);
      setError(err.message || 'Failed to complete quick setup');
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Manual Custom Spot Creation Handler
  const handleCreateSpot = async (e) => {
    e.preventDefault();
    if (!selectedFirm) {
      setError('Please select a farm first');
      return;
    }

    const currentFirm = firms.find((f) => f._id === selectedFirm);
    const firmName = currentFirm?.name || 'Poultry Farm';

    setActionLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const res = await createSpot({
        firm: selectedFirm,
        firmName,
        shed: formData.shed.trim(),
        line: formData.line.trim(),
        position: formData.position,
        spotCode: formData.customSpotCode ? formData.customSpotCode.trim() : undefined,
      });

      setSuccessMsg(`Registered spot: ${res.data.spotCode}`);
      setFormData({
        shed: formData.shed,
        line: formData.line,
        position: 'Pad Side',
        customSpotCode: '',
      });
      loadSpots(selectedFirm);
    } catch (err) {
      console.error('Create spot error:', err);
      setError(err.message || 'Failed to create spot');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Delete Spot Handler
  const handleDeleteSpot = async (id, spotCode) => {
    if (!window.confirm(`Are you sure you want to delete spot ${spotCode}?`)) {
      return;
    }
    setError('');
    setSuccessMsg('');
    try {
      await deleteSpot(id);
      setSuccessMsg(`Deleted spot ${spotCode}`);
      setSpots((prev) => prev.filter((s) => s._id !== id));
    } catch (err) {
      console.error('Delete spot error:', err);
      setError(err.message || 'Failed to delete spot');
    }
  };

      // 4. Toggle Active / Inactive Status Handler
  const handleToggleStatus = async (id, spotCode, currentActive) => {
    try {
      const res = await toggleSpotStatus(id);
      setSuccessMsg(res.message || `Spot ${spotCode} updated`);
      // Local state update (Instant UI update without reloading)
      setSpots((prev) =>
        prev.map((s) => (s._id === id ? { ...s, active: !currentActive } : s))
      );
    } catch (err) {
      console.error('Toggle status error:', err);
      setError(err.message || 'Failed to update spot status');
    }
  };

  // 5. Open Edit Modal
  const handleOpenEdit = (spot) => {
    setEditingSpot(spot);
    setEditFormData({
      shed: spot.shed,
      line: spot.line,
      position: spot.position,
      spotCode: spot.spotCode,
    });
  };

  // 6. Save Edited Spot Form
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSpot) return;
    setActionLoading(true);
    setError('');
    try {
      const res = await updateSpot(editingSpot._id, editFormData);
      setSuccessMsg(`Spot ${editFormData.spotCode} updated successfully`);
      // Update local spots list
      setSpots((prev) =>
        prev.map((s) => (s._id === editingSpot._id ? res.data : s))
      );
      setEditingSpot(null); // Close modal
    } catch (err) {
      console.error('Update spot error:', err);
      setError(err.message || 'Failed to update spot');
    } finally {
      setActionLoading(false);
    }
  };

  const [qrDataUrl, setQrDataUrl] = useState('');

  // Generate offline QR code locally in browser using `qrcode` library
  useEffect(() => {
    if (!qrModalSpot) {
      setQrDataUrl('');
      return;
    }

    const payload = JSON.stringify({
      spotCode: qrModalSpot.spotCode,
      firm: qrModalSpot.firm,
      firmName: qrModalSpot.firmName,
      shed: qrModalSpot.shed,
      line: qrModalSpot.line,
      position: qrModalSpot.position,
    });

    QRCode.toDataURL(payload, {
      width: 250,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate offline QR code:', err));
  }, [qrModalSpot]);

  return (
    <div className="p-2.5 sm:p-4 md:p-8 max-w-7xl mx-auto space-y-3 sm:space-y-5 bg-slate-50 min-h-screen">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl sm:text-2xl">🌡️</span>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">
              Thermometer Spot Master
            </h1>
          </div>
          <p className="text-[11px] sm:text-xs md:text-sm text-slate-500 mt-0.5">
            Configure shed spots, generate location QR stickers, and manage active monitoring zones.
          </p>
        </div>

        {/* Farm Selector (Reduced by 30% for compact mobile layout) */}
        <div className="self-start sm:self-auto inline-flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl shadow-xs">
          <label className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
            Farm:
          </label>
          <select
            value={selectedFirm}
            onChange={(e) => setSelectedFirm(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 font-semibold text-xs rounded-lg px-2 py-1 focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-xs cursor-pointer min-w-[120px] max-w-[180px]"
          >
            {firms.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-800 font-bold ml-4 text-xs">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-medium">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4 text-xs">✕</button>
        </div>
      )}

      {/* Collapsible Setup & Add Spot Section (Saves vertical space so 7-8 spots show on mobile) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setShowSetupForms(!showSetupForms)}
          className="w-full flex items-center justify-between text-left cursor-pointer group"
        >
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-base sm:text-xl">⚡</span>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition flex items-center gap-1.5">
                <span>Configure & Add Thermometer Spots</span>
                <span className="hidden sm:inline-block text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                  Batch Generator & Custom
                </span>
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400">
                {showSetupForms ? 'Click to collapse configuration' : 'Click to auto-generate or manually add spots'}
              </p>
            </div>
          </div>
          <span className="text-[10px] sm:text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-lg bg-slate-100 group-hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 whitespace-nowrap">
            {showSetupForms ? 'Hide Options ▲' : 'Open Setup ▼'}
          </span>
        </button>

        {showSetupForms && (
          <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-3 sm:space-y-4 animate-in fade-in duration-150">
            {/* Batch Spot Generator */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 sm:p-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="text-amber-500">⚡</span> Batch Spot Generator (Flexible)
                  </h4>
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5">
                    Quickly create 3-position spots (Pad, Middle, Fan) for multiple sheds and lines.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1">
                    <label className="text-[11px] font-semibold text-slate-600">Sheds:</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={batchShedCount}
                      onChange={(e) => setBatchShedCount(e.target.value)}
                      className="w-14 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 text-center focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <label className="text-[11px] font-semibold text-slate-600">Line:</label>
                    <input
                      type="text"
                      value={batchLine}
                      onChange={(e) => setBatchLine(e.target.value)}
                      className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500"
                      placeholder="Line 1"
                    />
                  </div>

                  <button
                    onClick={handleQuickSetup}
                    disabled={actionLoading || !selectedFirm}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition shadow-sm disabled:opacity-50 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    {actionLoading ? 'Generating...' : `⚡ Generate for ${batchShedCount} Sheds`}
                  </button>
                </div>
              </div>
            </div>

            {/* Add Custom Spot Form */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 sm:p-4">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                <span className="text-emerald-600">➕</span> Add Single Thermometer Spot
              </h4>
              <form onSubmit={handleCreateSpot} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Shed Name / No</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shed 1"
                    value={formData.shed}
                    onChange={(e) => setFormData({ ...formData, shed: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Line / Row</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Line 1"
                    value={formData.line}
                    onChange={(e) => setFormData({ ...formData, line: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Position along Line</label>
                  <select
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
                  >
                    <option value="Pad Side">Pad Side (Front)</option>
                    <option value="Middle">Middle (Center)</option>
                    <option value="Fan Side">Fan Side (Back / End)</option>
                  </select>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={actionLoading || !selectedFirm}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-1.5 px-3 rounded-lg transition disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    Add Spot
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* Spots List Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-2 bg-slate-50/50">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              Registered Thermometer Spots ({spots.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Arranged physically: Pad Side (Front) → Middle → Fan Side (Back)
            </p>
          </div>
          {spots.length > 0 && (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              {spots.length} Scannable Spots Active
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400 font-medium text-sm">Loading spots...</div>
        ) : spots.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-3">
            <p className="text-sm">No thermometer spots registered for this farm yet.</p>
            <button
              onClick={handleQuickSetup}
              className="text-emerald-600 hover:text-emerald-700 font-semibold text-xs underline cursor-pointer"
            >
              Click here to auto-generate standard spots
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto min-h-[300px] pb-24">
            <table className="w-full text-left text-xs text-slate-700 border-collapse">
              <thead className="bg-slate-50 text-[10px] sm:text-[11px] uppercase font-bold text-slate-500 border-b border-slate-200">
                <tr>
                  {/* Sticky Steady Spot Code Column */}
                  <th className="py-2 sm:py-2.5 px-3 sticky left-0 z-20 bg-slate-50 font-bold text-slate-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] whitespace-nowrap">
                    Spot Code
                  </th>
                  <th className="py-2 sm:py-2.5 px-3 whitespace-nowrap">Shed</th>
                  <th className="py-2 sm:py-2.5 px-3 whitespace-nowrap">Line</th>
                  <th className="py-2 sm:py-2.5 px-3 whitespace-nowrap">Position</th>
                  <th className="py-2 sm:py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                  <th className="py-2 sm:py-2.5 px-3 text-center whitespace-nowrap">QR Sticker</th>
                  <th className="py-2 sm:py-2.5 px-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {spots.map((spot) => (
                  <tr key={spot._id} className="hover:bg-slate-50/80 transition group">
                    {/* Sticky Steady Spot Code Column with mobile Shed & Line helper */}
                    <td className="py-1.5 sm:py-2.5 px-3 sticky left-0 z-10 bg-white group-hover:bg-slate-50/90 font-mono font-bold text-emerald-700 text-xs shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)] whitespace-nowrap">
                      <div className="leading-tight">{spot.spotCode}</div>
                      <div className="text-[10px] font-sans font-normal text-slate-400 sm:hidden mt-0.5">
                        {spot.shed} • {spot.line}
                      </div>
                    </td>
                    <td className="py-1.5 sm:py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap text-xs">
                      {spot.shed}
                    </td>
                    <td className="py-1.5 sm:py-2.5 px-3 text-slate-600 whitespace-nowrap text-xs">
                      {spot.line}
                    </td>
                    <td className="py-1.5 sm:py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${
                          spot.position === 'Pad Side'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : spot.position === 'Middle'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        {spot.position}
                      </span>
                    </td>
                    <td className="py-1.5 sm:py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold ${
                          spot.active !== false
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {spot.active !== false ? '● Active' : '○ Inactive'}
                      </span>
                    </td>
                    <td className="py-1.5 sm:py-2.5 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => setQrModalSpot(spot)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-[11px] transition cursor-pointer border border-slate-200 whitespace-nowrap"
                      >
                        <span>🔲</span> View
                      </button>
                    </td>
                    <td className="py-1.5 sm:py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="relative inline-block text-left">
                        {/* 3-Dots Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === spot._id ? null : spot._id);
                          }}
                          className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer border ${
                            openMenuId === spot._id ? 'bg-slate-100 border-slate-300 text-slate-900' : 'border-transparent'
                          }`}
                          title="Actions Menu"
                        >
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="19" r="2" />
                          </svg>
                        </button>

                        {/* Floating Action Menu */}
                        {openMenuId === spot._id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 mt-1 w-36 sm:w-40 bg-white border border-slate-200 rounded-2xl shadow-xl py-1 z-50 text-left animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100"
                          >
                            <div className="py-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleOpenEdit(spot);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2 cursor-pointer transition"
                              >
                                <span>✏️</span> Edit Spot
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleToggleStatus(spot._id, spot.spotCode, spot.active !== false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center gap-2 cursor-pointer transition hover:bg-slate-50 ${
                                  spot.active !== false ? 'text-amber-700' : 'text-emerald-700'
                                }`}
                              >
                                <span>{spot.active !== false ? '⏸️' : '▶️'}</span>
                                {spot.active !== false ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>

                            <div className="py-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  handleDeleteSpot(spot._id, spot.spotCode);
                                }}
                                className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer transition"
                              >
                                <span>🗑️</span> Delete Spot
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Printable QR Sticker Modal */}
      {qrModalSpot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setQrModalSpot(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>

            {/* Printable Sticker Preview Card */}
            <div id="printable-sticker-card" className="bg-white text-slate-900 rounded-2xl p-5 border-2 border-dashed border-slate-300 my-4 shadow-sm">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {qrModalSpot.firmName}
              </h2>
              <h1 className="text-lg font-black text-slate-900 mt-1">
                {qrModalSpot.shed} • {qrModalSpot.line}
              </h1>
              <p className="text-xs font-bold text-emerald-600 uppercase mb-3">
                {qrModalSpot.position}
              </p>

              {/* Scannable QR Code */}
              <div className="flex justify-center my-3">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`QR for ${qrModalSpot.spotCode}`}
                    className="w-44 h-44 border border-slate-200 p-2 rounded-xl bg-white shadow-sm"
                  />
                ) : (
                  <div className="w-44 h-44 border border-slate-200 rounded-xl bg-slate-50 flex items-center justify-center text-xs text-slate-400">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="font-mono text-xs font-bold tracking-widest text-slate-800 bg-slate-100 py-1.5 px-3 rounded-lg inline-block mt-1 border border-slate-200">
                {qrModalSpot.spotCode}
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                Paste beside physical thermometer inside shed
              </p>
            </div>

            <div className="flex gap-2 justify-center mt-5">
              <button
                onClick={() => window.print()}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer transition flex items-center gap-1.5"
              >
                <span>🖨️</span> Print Sticker
              </button>
              <button
                onClick={() => setQrModalSpot(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Spot Modal */}
      {editingSpot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Thermometer Spot</h3>
                <p className="text-xs text-slate-500">Update shed, line, position, or spot code</p>
              </div>
              <button
                onClick={() => setEditingSpot(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Shed
                  </label>
                  <input
                    type="text"
                    value={editFormData.shed}
                    onChange={(e) => setEditFormData({ ...editFormData, shed: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Line
                  </label>
                  <input
                    type="text"
                    value={editFormData.line}
                    onChange={(e) => setEditFormData({ ...editFormData, line: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Position
                </label>
                <select
                  value={editFormData.position}
                  onChange={(e) => setEditFormData({ ...editFormData, position: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Pad Side">Pad Side (Front/Cooling)</option>
                  <option value="Middle">Middle (Center)</option>
                  <option value="Fan Side">Fan Side (Back/Exhaust)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                  Spot Code (Unique)
                </label>
                <input
                  type="text"
                  value={editFormData.spotCode}
                  onChange={(e) => setEditFormData({ ...editFormData, spotCode: e.target.value.toUpperCase() })}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-500 uppercase"
                />
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSpot(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm cursor-pointer transition disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}