import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../api/client.js';
import { recordTemperature, fetchRecentLogs } from '../api/temperatureApi.js';

export default function TemperatureEntryPage() {
  // 1. Core States
  const [firms, setFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 2. View Mode: 'initial' | 'scanning' | 'scanned' | 'manual'
  const [entryMode, setEntryMode] = useState('initial');

  // 3. Scanned Data & Reading State
  const [scannedSpot, setScannedSpot] = useState(null);
  const [temperature, setTemperature] = useState('');
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('');

  // 4. Manual Fallback Form State
  const [manualForm, setManualForm] = useState({
    shed: 'Shed 1',
    line: 'Line 1',
    position: 'Pad Side',
    temperature: '',
  });

  // 5. Recent Logs / Night Round Checklist
  const [recentLogs, setRecentLogs] = useState([]);

  // Scanner Reference & Camera State
  const html5QrCodeRef = useRef(null);
  const [cameraError, setCameraError] = useState('');

  // Auto-update live formatted time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const day = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      setCurrentTimeFormatted(`${day} · ${time}`);
    };
    updateTime();
    const timer = setInterval(updateTime, 30000);
    return () => clearInterval(timer);
  }, []);

  // Load farms on mount
  useEffect(() => {
    api('/firms')
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

  // Fetch recent round logs whenever selectedFirm changes
  const loadRecentLogs = async (firmId) => {
    if (!firmId) return;
    try {
      const res = await fetchRecentLogs(firmId);
      setRecentLogs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch recent logs:', err);
    }
  };

  useEffect(() => {
    if (selectedFirm) {
      loadRecentLogs(selectedFirm);
    }
  }, [selectedFirm]);

  // Start Camera Scanner
  const startCameraScanner = async () => {
    setError('');
    setCameraError('');
    setEntryMode('scanning');

    // Small delay to allow DOM element #qr-reader to mount
    setTimeout(async () => {
      try {
        const qrCodeScanner = new Html5Qrcode('qr-reader');
        html5QrCodeRef.current = qrCodeScanner;

        const config = {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1.0,
        };

        await qrCodeScanner.start(
          { facingMode: 'environment' }, // Prefer back camera on mobile
          config,
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {
            // Scanning in progress...
          }
        );
      } catch (err) {
        console.error('Unable to start camera:', err);
        setCameraError(err.message || 'Camera permission denied or camera not found');
      }
    }, 200);
  };

  // Stop Camera Scanner safely
  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        if (html5QrCodeRef.current.isScanning) {
          await html5QrCodeRef.current.stop();
        }
        await html5QrCodeRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        html5QrCodeRef.current = null;
      }
    }
  };

  // Close scanner modal
  const handleCloseScanner = async () => {
    await stopCameraScanner();
    setEntryMode('initial');
  };

  // Handle successful QR scan
  const handleScanSuccess = async (decodedText) => {
    try {
      // Audio or vibration feedback
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(100);
      }

      await stopCameraScanner();

      let spotData = null;
      try {
        spotData = JSON.parse(decodedText);
      } catch {
        // Fallback for simple spot code string
        spotData = { spotCode: decodedText.trim() };
      }

      setScannedSpot(spotData);
      setTemperature('');
      setEntryMode('scanned');
    } catch (err) {
      console.error('Scan parse error:', err);
      setError('Invalid QR code format. Please scan a valid thermometer sticker.');
    }
  };

  // Submit Scanned Reading
  const handleSaveScannedEntry = async (e) => {
    e.preventDefault();
    if (!scannedSpot || !temperature) return;

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        firm: scannedSpot.firm || selectedFirm,
        spotCode: scannedSpot.spotCode,
        shed: scannedSpot.shed,
        line: scannedSpot.line || 'Line 1',
        position: scannedSpot.position,
        temperature: parseFloat(temperature),
        verifiedByQr: true,
      };

      const res = await recordTemperature(payload);
      setSuccessMsg(res.message || 'Temperature recorded successfully!');
      setEntryMode('initial');
      setScannedSpot(null);
      setTemperature('');
      loadRecentLogs(selectedFirm);
    } catch (err) {
      console.error('Save entry error:', err);
      setError(err.message || 'Failed to record temperature');
    } finally {
      setSaving(false);
    }
  };

  // Submit Manual Reading
  const handleSaveManualEntry = async (e) => {
    e.preventDefault();
    if (!manualForm.temperature) return;

    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      const payload = {
        firm: selectedFirm,
        shed: manualForm.shed,
        line: manualForm.line,
        position: manualForm.position,
        temperature: parseFloat(manualForm.temperature),
        verifiedByQr: false,
      };

      const res = await recordTemperature(payload);
      setSuccessMsg(res.message || 'Manual temperature entry recorded');
      setEntryMode('initial');
      setManualForm((prev) => ({ ...prev, temperature: '' }));
      loadRecentLogs(selectedFirm);
    } catch (err) {
      console.error('Save manual entry error:', err);
      setError(err.message || 'Failed to record manual entry');
    } finally {
      setSaving(false);
    }
  };

  // Selected farm name
  const currentFirmName = firms.find((f) => f._id === selectedFirm)?.name || 'Select Farm';

  return (
    <div className="p-3 sm:p-6 max-w-xl mx-auto space-y-4 bg-slate-50 min-h-screen">
      {/* Top Header & Farm Selector */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌙</span>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
              Night Temperature Round
            </h1>
            <p className="text-[11px] text-slate-500">{currentTimeFormatted}</p>
          </div>
        </div>

        {/* Farm Selector */}
        <select
          value={selectedFirm}
          onChange={(e) => setSelectedFirm(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-900 font-semibold text-xs rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
        >
          {firms.map((f) => (
            <option key={f._id} value={f._id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      {/* Notifications */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-500 font-bold ml-2 text-xs">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3.5 py-2.5 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 font-bold ml-2 text-xs">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 1: NEW READING (Initial State)                                     */}
      {/* ========================================================================= */}
      {entryMode === 'initial' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-5 animate-in fade-in duration-150">
          <div>
            <h2 className="text-base font-bold text-slate-900">New reading</h2>
            <p className="text-xs text-slate-500">Temperature entry</p>
          </div>

          {/* Primary Action Button: Scan with Camera */}
          <button
            onClick={startCameraScanner}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-2xl shadow-md flex items-center justify-center gap-2 transition transform active:scale-98 cursor-pointer"
          >
            <span className="text-lg">📷</span>
            <span className="text-sm">Scan with camera</span>
          </button>

          <div className="text-center">
            <button
              onClick={() => setEntryMode('manual')}
              className="text-xs font-semibold text-slate-400 hover:text-slate-600 cursor-pointer underline transition"
            >
              or fill the form yourself
            </button>
          </div>

          {/* Summary Preview Table */}
          <div className="divide-y divide-slate-100 border-t border-b border-slate-100 text-xs">
            <div className="py-2.5 flex justify-between items-center text-slate-600">
              <span className="font-medium text-slate-500">Firm</span>
              <span className="font-semibold text-slate-800">{currentFirmName}</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-slate-600">
              <span className="font-medium text-slate-500">Shed</span>
              <span className="font-mono text-slate-400">—</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-slate-600">
              <span className="font-medium text-slate-500">Line</span>
              <span className="font-mono text-slate-400">—</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-slate-600">
              <span className="font-medium text-slate-500">Position</span>
              <span className="font-mono text-slate-400">—</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-slate-600">
              <span className="font-medium text-slate-500">Temperature</span>
              <span className="font-mono text-slate-400">—</span>
            </div>
            <div className="py-2.5 flex justify-between items-center text-slate-600">
              <span className="font-medium text-slate-500">Date and time</span>
              <span className="font-mono text-slate-400">—</span>
            </div>
          </div>

          {/* Disabled Save Button */}
          <button
            disabled
            className="w-full bg-slate-100 text-slate-400 font-bold py-3 rounded-2xl text-xs cursor-not-allowed"
          >
            Save entry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 2: SCANNING MODAL / VIEWFINDER                                     */}
      {/* ========================================================================= */}
      {entryMode === 'scanning' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 text-white shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  Scanning
                </h3>
                <p className="text-[11px] text-slate-400">Keep thermometer QR sticker in view</p>
              </div>
              <button
                onClick={handleCloseScanner}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 text-base font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Camera Viewfinder Box */}
            <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center min-h-[260px]">
              <div id="qr-reader" className="w-full h-full" />
              {cameraError && (
                <div className="p-4 text-center text-rose-400 text-xs font-medium">
                  {cameraError}
                </div>
              )}
            </div>

            {/* Scanning Guidance */}
            <div className="mt-4 text-center space-y-1">
              <p className="text-xs font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                <span>✓</span> Align camera with sticker beside thermometer
              </p>
              <p className="text-[11px] text-slate-400">
                Auto-detects Shed, Line, and Position
              </p>
            </div>

            <button
              onClick={handleCloseScanner}
              className="mt-4 w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer transition"
            >
              Cancel & Back
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 3: CHECK AND SAVE (Post-Scan)                                      */}
      {/* ========================================================================= */}
      {entryMode === 'scanned' && scannedSpot && (
        <form onSubmit={handleSaveScannedEntry} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in duration-150">
          <div>
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-slate-900">Check and save</h2>
                <p className="text-xs text-slate-500">Temperature entry</p>
              </div>
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                <span>⚡</span> Filled from scan
              </span>
            </div>
          </div>

          {/* Auto-filled details with [QR] badge */}
          <div className="divide-y divide-slate-100 border-t border-b border-slate-100 text-xs">
            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500 font-medium">Firm</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>{scannedSpot.firmName || currentFirmName}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">QR</span>
              </div>
            </div>

            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500 font-medium">Shed</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>{scannedSpot.shed}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">QR</span>
              </div>
            </div>

            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500 font-medium">Line</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>{scannedSpot.line || 'Line 1'}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">QR</span>
              </div>
            </div>

            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500 font-medium">Position</span>
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <span>{scannedSpot.position}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">QR</span>
              </div>
            </div>

            {/* Temperature Reading Input */}
            <div className="py-3 flex justify-between items-center gap-3">
              <div>
                <span className="text-slate-700 font-bold block">Temperature</span>
                <span className="text-[10px] text-slate-400">Read from analog spirit tube</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  required
                  autoFocus
                  placeholder="24.6"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="w-24 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-base font-bold text-slate-900 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <span className="text-sm font-bold text-slate-700">°C</span>
              </div>
            </div>

            <div className="py-2 flex justify-between items-center">
              <span className="text-slate-500 font-medium">Date and time</span>
              <div className="flex items-center gap-1.5 font-semibold text-slate-700 text-[11px]">
                <span>{currentTimeFormatted}</span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">Auto</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Scan Again / Save Entry */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={startCameraScanner}
              className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl cursor-pointer transition text-center"
            >
              Scan again
            </button>

            <button
              type="submit"
              disabled={saving || !temperature}
              className="py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-2xl shadow-md transition disabled:opacity-50 cursor-pointer text-center"
            >
              {saving ? 'Saving...' : 'Save entry'}
            </button>
          </div>
        </form>
      )}

      {/* ========================================================================= */}
      {/* SCREEN 4: MANUAL ENTRY (Fallback when physical scan unavailable)          */}
      {/* ========================================================================= */}
      {entryMode === 'manual' && (
        <form onSubmit={handleSaveManualEntry} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4 animate-in fade-in duration-150">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-base font-bold text-slate-900">Manual entry</h2>
              <p className="text-xs text-slate-500">Temperature entry</p>
            </div>
            <button
              type="button"
              onClick={() => setEntryMode('initial')}
              className="text-xs text-blue-600 font-semibold hover:underline cursor-pointer"
            >
              Back to scan
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Shed
              </label>
              <select
                value={manualForm.shed}
                onChange={(e) => setManualForm({ ...manualForm, shed: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="Shed 1">Shed 1</option>
                <option value="Shed 2">Shed 2</option>
                <option value="Shed 3">Shed 3</option>
                <option value="Shed 4">Shed 4</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Line
              </label>
              <select
                value={manualForm.line}
                onChange={(e) => setManualForm({ ...manualForm, line: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
              >
                <option value="Line 1">Line 1</option>
                <option value="Line 2">Line 2</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Position
            </label>
            <select
              value={manualForm.position}
              onChange={(e) => setManualForm({ ...manualForm, position: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="Pad Side">Pad Side (Front)</option>
              <option value="Middle">Middle (Center)</option>
              <option value="Fan Side">Fan Side (Back)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Temperature (°C)
            </label>
            <input
              type="number"
              step="0.1"
              required
              placeholder="e.g. 24.6"
              value={manualForm.temperature}
              onChange={(e) => setManualForm({ ...manualForm, temperature: e.target.value })}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Amber Warning Notice for Manual Entry */}
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs font-semibold flex items-center gap-2">
            <span>⚠️</span>
            <span>Marked as manual entry in the report</span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving || !manualForm.temperature}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-2xl text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save entry'}
          </button>
        </form>
      )}

      {/* ========================================================================= */}
      {/* SHED ROUND PROGRESS CHECKLIST (Live feedback for worker)                   */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <h3 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
            <span>📋</span> Recent Captured Readings
          </h3>
          <span className="text-[10px] text-slate-400 font-semibold">
            {recentLogs.length} saved
          </span>
        </div>

        {recentLogs.length === 0 ? (
          <p className="text-center py-4 text-xs text-slate-400">
            No readings recorded for this farm yet tonight.
          </p>
        ) : (
          <div className="space-y-2">
            {recentLogs.slice(0, 6).map((log) => (
              <div
                key={log._id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-800">
                    {log.shed} • {log.position}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(log.capturedAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                    {log.verifiedByqr ? (
                      <span className="text-emerald-600 font-semibold ml-1.5">⚡ QR Verified</span>
                    ) : (
                      <span className="text-amber-600 font-semibold ml-1.5">⚠️ Manual</span>
                    )}
                  </div>
                </div>

                <div className="font-mono font-bold text-sm text-emerald-700">
                  {log.temperature}°C
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

