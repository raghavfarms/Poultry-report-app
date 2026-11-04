import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { api } from '../../api/client.js';
import { recordTemperature, fetchRecentLogs, scanThermometerWithAi, fetchSpots } from '../api/temperatureApi.js';

export default function TemperatureEntryPage() {
  // 1. Core States
  const [firms, setFirms] = useState([]);
  const [selectedFirm, setSelectedFirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 2. Entry Mode: 'fast' (1-Tap Industrial Mode, default) | 'scanning_qr' | 'scanned_qr'
  const [entryMode, setEntryMode] = useState('fast');

  // 3. Form / Current Spot Selection
  const [currentShed, setCurrentShed] = useState('Shed 1');
  const [currentLine, setCurrentLine] = useState('Line 1');
  const [currentPosition, setCurrentPosition] = useState('Pad Side'); // 'Pad Side' | 'Middle' | 'Fan Side'
  const [temperature, setTemperature] = useState('');
  const [baseTemperature, setBaseTemperature] = useState(null);
  const [currentTimeFormatted, setCurrentTimeFormatted] = useState('');

  // 4. Configured Sheds from Backend
  const [availableSheds, setAvailableSheds] = useState([
    'Shed 1', 'Shed 2', 'Shed 3', 'Shed 4', 'Shed 5', 'Shed 6', 'Shed 7', 'Shed 8'
  ]);

  // 5. Scanned Spot from QR
  const [scannedSpot, setScannedSpot] = useState(null);

  // 6. Recent Logs / Checklist for Current Round
  const [recentLogs, setRecentLogs] = useState([]);

  // QR Scanner Ref
  const html5QrCodeRef = useRef(null);
  const [cameraError, setCameraError] = useState('');

  // 7. AI Vision Thermometer Scanner States
  const [thermometerCameraOpen, setThermometerCameraOpen] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiVerified, setAiVerified] = useState(false);
  const [aiDetails, setAiDetails] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraFacing, setCameraFacing] = useState('environment');
  const [cameraModalError, setCameraModalError] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaStreamRef = useRef(null);

  // Auto-update live time in IST
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

  // Load farms on mount (strictly excluding Head Office)
  useEffect(() => {
    api('/firms?module=temperature')
      .then((data) => {
        const rawList = data.firms || (Array.isArray(data) ? data : data?.data || []);
        const filtered = rawList.filter((f) => f.code !== 'OFFICE' && !/office/i.test(f.name));
        setFirms(filtered);
        if (filtered.length > 0 && !selectedFirm) {
          setSelectedFirm(filtered[0]._id);
        }
      })
      .catch((err) => {
        console.error('Failed to load farms:', err);
        setError('Failed to load farm list');
      });
  }, []);

  // Load configured sheds & recent round logs when farm changes
  useEffect(() => {
    if (!selectedFirm) return;
    loadRecentLogs(selectedFirm);

    fetchSpots(selectedFirm)
      .then((res) => {
        const spotsList = res.data || [];
        const shedSet = new Set();
        spotsList.forEach((s) => {
          if (s.shed && s.active !== false) shedSet.add(s.shed);
        });
        if (shedSet.size > 0) {
          const sorted = Array.from(shedSet).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true })
          );
          setAvailableSheds(sorted);
          if (!shedSet.has(currentShed)) {
            setCurrentShed(sorted[0]);
          }
        }
      })
      .catch((err) => console.error('Failed to load sheds for farm:', err));
  }, [selectedFirm]);

  const loadRecentLogs = async (firmId) => {
    if (!firmId) return;
    try {
      const res = await fetchRecentLogs(firmId);
      setRecentLogs(res.data || []);
    } catch (err) {
      console.error('Failed to fetch recent logs:', err);
    }
  };

  // =========================================================================
  // ULTRA-FAST OPTIMISTIC SAVE & AUTO-ADVANCE
  // =========================================================================
  const handleSaveEntry = async (customTemp = null) => {
    const rawTemp = customTemp !== null ? customTemp : temperature;
    if (rawTemp === '' || rawTemp === null || isNaN(rawTemp)) {
      setError('Please select or enter a temperature reading');
      return;
    }

    const tempNum = Math.round(Number(rawTemp));
    if (tempNum < -10 || tempNum > 55) {
      setError('Temperature must be between -10°C and 55°C');
      return;
    }

    const targetFirm = scannedSpot?.firm || selectedFirm;
    const targetShed = scannedSpot?.shed || currentShed;
    const targetLine = scannedSpot?.line || currentLine || 'Line 1';
    const targetPos = scannedSpot?.position || currentPosition;

    // 1. Instant Haptic Feedback (Phone Vibration)
    if (typeof window !== 'undefined' && window.navigator?.vibrate) {
      window.navigator.vibrate(50);
    }

    // 2. Instant Optimistic UI Update (Zero Delay)
    setSuccessMsg(`✓ Saved: ${targetShed} · ${targetPos} (${tempNum}°C)`);
    setError('');

    const optimisticLog = {
      _id: 'temp_' + Date.now(),
      shed: targetShed,
      line: targetLine,
      position: targetPos,
      temperature: tempNum,
      capturedAt: new Date().toISOString(),
      verifiedByqr: Boolean(scannedSpot),
      verifiedByAi,
    };
    setRecentLogs((prev) => [optimisticLog, ...prev.filter((l) => l._id !== optimisticLog._id)]);

    // 3. Auto-Advance to Next Spot (Pad -> Middle -> Fan -> Next Shed Pad)
    if (!scannedSpot) {
      if (targetPos === 'Pad Side') {
        setCurrentPosition('Middle');
      } else if (targetPos === 'Middle') {
        setCurrentPosition('Fan Side');
      } else if (targetPos === 'Fan Side') {
        setCurrentPosition('Pad Side');
        const curIdx = availableSheds.indexOf(targetShed);
        if (curIdx >= 0 && curIdx < availableSheds.length - 1) {
          setCurrentShed(availableSheds[curIdx + 1]);
        }
      }
    }

    // Reset current temperature input
    setTemperature('');
    setBaseTemperature(null);
    setAiVerified(false);
    setAiDetails(null);
    setCapturedImage(null);
    setScannedSpot(null);
    if (entryMode === 'scanned_qr') {
      setEntryMode('fast');
    }

    // 4. Asynchronous Cloud Save in Background (Does not block UI)
    try {
      const payload = {
        firm: targetFirm,
        shed: targetShed,
        line: targetLine,
        position: targetPos,
        temperature: tempNum,
        verifiedByQr: Boolean(scannedSpot),
        verifiedByAi,
        aiConfidence: aiDetails?.confidence || null,
        spotCode: scannedSpot?.spotCode || null,
        // Send small thumbnail to prevent database bloat
        thermometerImageUrl: capturedImage ? capturedImage.slice(0, 15000) : null,
      };

      await recordTemperature(payload);
      // Silently refresh server logs
      fetchRecentLogs(selectedFirm)
        .then((res) => {
          if (res.data) setRecentLogs(res.data);
        })
        .catch(() => {});
    } catch (saveErr) {
      console.error('Save error:', saveErr);
      setError(`Failed to save: ${saveErr.message || 'Network error'}. Please check internet.`);
    }
  };

  // =========================================================================
  // HARDWARE-ACCELERATED QR SCANNER
  // =========================================================================
  const startCameraScanner = async () => {
    setError('');
    setCameraError('');
    setEntryMode('scanning_qr');

    setTimeout(async () => {
      try {
        if (html5QrCodeRef.current) {
          try {
            await html5QrCodeRef.current.stop();
          } catch (_) {}
        }

        const qrCodeScanner = new Html5Qrcode('qr-reader', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = qrCodeScanner;

        const qrBoxFunction = (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.85);
          return { width: size, height: size };
        };

        await qrCodeScanner.start(
          { facingMode: 'environment' },
          {
            fps: 30,
            qrbox: qrBoxFunction,
            aspectRatio: 1.0,
          },
          (decodedText) => handleScanSuccess(decodedText),
          () => {}
        );
      } catch (err) {
        console.error('Camera QR start error:', err);
        setCameraError('Camera access required. Please check browser permissions.');
      }
    }, 100);
  };

  const stopCameraScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (_) {}
      html5QrCodeRef.current = null;
    }
  };

  const handleCloseScanner = async () => {
    await stopCameraScanner();
    setEntryMode('fast');
  };

  const handleScanSuccess = async (decodedText) => {
    try {
      if (typeof window !== 'undefined' && window.navigator?.vibrate) {
        window.navigator.vibrate(80);
      }
      await stopCameraScanner();

      let spotData = null;
      try {
        spotData = JSON.parse(decodedText);
      } catch {
        spotData = { spotCode: decodedText.trim() };
      }

      setScannedSpot(spotData);
      if (spotData.shed) setCurrentShed(spotData.shed);
      if (spotData.position) setCurrentPosition(spotData.position);
      if (spotData.line) setCurrentLine(spotData.line);

      setEntryMode('scanned_qr');
      setBaseTemperature(null);
      setTemperature('');
      setAiVerified(false);
      setAiDetails(null);
    } catch (err) {
      console.error('Scan parse error:', err);
      setError('Invalid QR code format.');
    }
  };

  // =========================================================================
  // AI VISION THERMOMETER CAMERA (CROP-TO-ROI & SUB-2S RESPONSE)
  // =========================================================================
  const startThermometerCamera = async () => {
    setError('');
    setCameraModalError('');
    setThermometerCameraOpen(true);
    setAiScanning(false);

    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints = {
        video: {
          facingMode: { ideal: cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities();
        setTorchSupported(Boolean(caps?.torch));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn('Thermometer camera stream error:', err);
      setCameraModalError('Camera stream could not start. Please check camera permissions.');
    }
  };

  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error('Flip camera failed:', err);
    }
  };

  const toggleTorch = async () => {
    try {
      if (!mediaStreamRef.current) return;
      const track = mediaStreamRef.current.getVideoTracks()[0];
      if (track) {
        const next = !torchOn;
        await track.applyConstraints({ advanced: [{ torch: next }] });
        setTorchOn(next);
      }
    } catch (e) {
      console.warn('Torch error:', e);
    }
  };

  const stopThermometerCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
    setThermometerCameraOpen(false);
    setCameraModalError('');
  };

  // High-Speed ROI Snapshot: Crop center viewfinder & compress to ~25KB
  const captureAndScanThermometer = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    if (video.readyState < 2 || !video.videoWidth) {
      setCameraModalError('Camera stream is still starting, please wait a moment...');
      return;
    }
    setCameraModalError('');

    const canvas = canvasRef.current || document.createElement('canvas');
    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;

    // Viewfinder ROI: Crop central 60% width and 75% height where thermometer sits
    const cropW = Math.round(vWidth * 0.60);
    const cropH = Math.round(vHeight * 0.75);
    const cropX = Math.round((vWidth - cropW) / 2);
    const cropY = Math.round((vHeight - cropH) / 2);

    // Scale to max 400px width for ultra-fast <25KB network transmission
    const targetW = 400;
    const targetH = Math.round((cropH * targetW) / cropW);

    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);

    // Clean JPEG at 0.68 quality (<25KB)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.68);
    processThermometerImageWithAi(dataUrl);
  };

  const processThermometerImageWithAi = async (dataUrl) => {
    setAiScanning(true);
    setCameraModalError('');
    setError('');

    try {
      setCapturedImage(dataUrl);
      const res = await scanThermometerWithAi(dataUrl);

      if (res.success && res.data && typeof res.data.temperature === 'number') {
        const detectedTempNum = Math.round(res.data.temperature);
        const detectedTempStr = detectedTempNum.toString();

        setBaseTemperature(detectedTempNum);
        setTemperature(detectedTempStr);
        setAiVerified(true);
        setAiDetails(res.data);

        if (typeof window !== 'undefined' && window.navigator?.vibrate) {
          window.navigator.vibrate([80, 50, 80]);
        }
        stopThermometerCamera();
      } else {
        const errMsg = res.message || 'Could not clearly read thermometer. Please take a closer photo with good lighting.';
        setCameraModalError(errMsg);
      }
    } catch (err) {
      console.error('AI Scan Error:', err);
      setCameraModalError(err.message || 'Failed to read thermometer image');
    } finally {
      setAiScanning(false);
    }
  };

  // Active Farm Display Name
  const currentFirmName = firms.find((f) => String(f._id) === String(selectedFirm))?.name || 'Farm';

  // Common poultry temperatures for 1-tap rapid selection
  const quickTemperatures = [22, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];

  // Map recent logs for the current hour's round
  const currentRoundMap = useMemo(() => {
    const map = {};
    recentLogs.forEach((log) => {
      const key = `${log.shed}_${log.position}`;
      if (!map[key]) {
        map[key] = log.temperature;
      }
    });
    return map;
  }, [recentLogs]);

  return (
    <div className="p-2 sm:p-4 max-w-[440px] mx-auto space-y-3 font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & FARM SELECTOR                                             */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🌡️</span>
          <div>
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">
              Temperature Round
            </h1>
            <p className="text-[10px] text-slate-500 font-medium">{currentTimeFormatted}</p>
          </div>
        </div>

        {/* Farm Selector (Raghav / Sanjana) */}
        <select
          value={selectedFirm}
          onChange={(e) => setSelectedFirm(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-900 font-bold text-xs rounded-xl px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none cursor-pointer"
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
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-500 font-bold ml-2 text-xs">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 px-3 py-2 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-1.5 text-xs font-bold">
            <span className="text-emerald-600">✓</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-600 font-bold ml-2 text-xs">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. INDUSTRIAL RAPID ENTRY CARD                                            */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm space-y-4">
        {/* Spot Context Header: Shed & Line */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shed:</span>
            <select
              value={currentShed}
              onChange={(e) => setCurrentShed(e.target.value)}
              className="bg-emerald-50 text-emerald-900 font-black text-sm rounded-xl px-2.5 py-1 border border-emerald-200 focus:outline-none cursor-pointer"
            >
              {availableSheds.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Scanner Action Pills */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={startThermometerCamera}
              className="px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer active:scale-95"
              title="Read thermometer via AI Camera"
            >
              <span>📸</span>
              <span>AI Scan</span>
            </button>
            <button
              type="button"
              onClick={startCameraScanner}
              className="px-2 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold text-[11px] flex items-center gap-1 transition cursor-pointer active:scale-95"
              title="Scan Spot QR sticker"
            >
              <span>🔲</span>
              <span>QR</span>
            </button>
          </div>
        </div>

        {/* 3-Position Quick Switcher (Pad Side | Middle | Fan Side) */}
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Spot Position
          </label>
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl">
            {['Pad Side', 'Middle', 'Fan Side'].map((pos) => {
              const isSelected = currentPosition === pos;
              const hasReading = currentRoundMap[`${currentShed}_${pos}`] !== undefined;
              return (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setCurrentPosition(pos)}
                  className={`py-2 px-1 text-xs font-bold rounded-xl transition cursor-pointer relative text-center ${
                    isSelected
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white/80'
                  }`}
                >
                  <span>{pos === 'Pad Side' ? 'Pad' : pos === 'Middle' ? 'Middle' : 'Fan'}</span>
                  {hasReading && (
                    <span className={`block text-[9px] font-black leading-tight ${isSelected ? 'text-emerald-200' : 'text-emerald-600'}`}>
                      {currentRoundMap[`${currentShed}_${pos}`]}°C ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Temperature Reading Display & Stepper */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-center space-y-2">
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider px-1">
            <span>Reading (°C)</span>
            {aiVerified && (
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-300">
                AI Verified ✓
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-3">
            {/* Rapid Decrement (-) */}
            <button
              type="button"
              onClick={() => {
                const cur = parseInt(temperature, 10) || 28;
                setTemperature(String(Math.max(-10, cur - 1)));
              }}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-300 text-slate-800 font-black text-2xl shadow-xs active:scale-90 transition cursor-pointer select-none flex items-center justify-center hover:bg-slate-100"
            >
              −
            </button>

            {/* Direct Number Input */}
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="--"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className="w-24 h-12 text-center text-3xl font-black text-slate-900 bg-white border border-slate-300 rounded-2xl focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500 focus:outline-none shadow-xs"
              />
              <span className="absolute right-2 top-2 text-xs font-bold text-slate-400 pointer-events-none">
                °C
              </span>
            </div>

            {/* Rapid Increment (+) */}
            <button
              type="button"
              onClick={() => {
                const cur = parseInt(temperature, 10) || 27;
                setTemperature(String(Math.min(55, cur + 1)));
              }}
              className="w-12 h-12 rounded-2xl bg-white border border-slate-300 text-slate-800 font-black text-2xl shadow-xs active:scale-90 transition cursor-pointer select-none flex items-center justify-center hover:bg-slate-100"
            >
              +
            </button>
          </div>

          {/* 1-Tap Quick Temperature Chips */}
          <div className="pt-2 border-t border-slate-200">
            <span className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase">
              1-Tap Quick Pick (°C)
            </span>
            <div className="grid grid-cols-6 gap-1.5">
              {quickTemperatures.map((qTemp) => (
                <button
                  key={qTemp}
                  type="button"
                  onClick={() => setTemperature(String(qTemp))}
                  className={`py-1.5 rounded-xl font-black text-xs transition cursor-pointer active:scale-95 border ${
                    temperature === String(qTemp)
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {qTemp}°
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Big Industrial Save & Auto-Advance Button */}
        <button
          type="button"
          onClick={() => handleSaveEntry()}
          disabled={!temperature}
          className="w-full bg-emerald-700 hover:bg-emerald-800 active:scale-98 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black text-sm py-3.5 px-4 rounded-2xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>⚡</span>
          <span>
            {temperature ? `Save ${currentShed} ${currentPosition} (${temperature}°C) & Next ➔` : 'Select or Tap Temperature'}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 3. CURRENT SHED ROUND PROGRESS CHECKLIST                                   */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>📋 Current Round Overview</span>
          <span className="text-[11px] font-medium text-slate-400">Tap spot to jump</span>
        </div>

        <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
          {availableSheds.map((s) => {
            const pad = currentRoundMap[`${s}_Pad Side`];
            const mid = currentRoundMap[`${s}_Middle`];
            const fan = currentRoundMap[`${s}_Fan Side`];
            const isAllDone = pad !== undefined && mid !== undefined && fan !== undefined;

            return (
              <div
                key={s}
                className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${
                  currentShed === s ? 'bg-emerald-50/50 border-emerald-300' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setCurrentShed(s)}
                  className="font-black text-slate-800 text-xs hover:text-emerald-700 cursor-pointer"
                >
                  {s}
                </button>

                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentShed(s);
                      setCurrentPosition('Pad Side');
                    }}
                    className={`px-1.5 py-0.5 rounded-lg font-bold border transition cursor-pointer ${
                      pad !== undefined
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    P: {pad !== undefined ? `${pad}°` : '—'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentShed(s);
                      setCurrentPosition('Middle');
                    }}
                    className={`px-1.5 py-0.5 rounded-lg font-bold border transition cursor-pointer ${
                      mid !== undefined
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    M: {mid !== undefined ? `${mid}°` : '—'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentShed(s);
                      setCurrentPosition('Fan Side');
                    }}
                    className={`px-1.5 py-0.5 rounded-lg font-bold border transition cursor-pointer ${
                      fan !== undefined
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-white text-slate-400 border-slate-200'
                    }`}
                  >
                    F: {fan !== undefined ? `${fan}°` : '—'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODAL: HARDWARE-ACCELERATED QR SCANNER                                  */}
      {/* ========================================================================= */}
      {entryMode === 'scanning_qr' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-4 text-white shadow-2xl relative my-auto mx-auto animate-in fade-in zoom-in-95">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Scan Spot QR
                  </h3>
                  <p className="text-[10px] text-slate-400">Align camera with spot barcode</p>
                </div>
                <button
                  onClick={handleCloseScanner}
                  className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 text-sm font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center w-full min-h-[240px] mx-auto">
                <div id="qr-reader" className="w-full h-full" />
                {cameraError && (
                  <div className="p-4 text-center text-rose-400 text-xs font-medium">
                    {cameraError}
                  </div>
                )}
              </div>

              <button
                onClick={handleCloseScanner}
                className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer transition"
              >
                Cancel & Close
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* 5. MODAL: AI THERMOMETER CAMERA (GEMINI 3.5 FLASH LITE SUB-2S)            */}
      {/* ========================================================================= */}
      {thermometerCameraOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-[340px] w-full p-4 text-white shadow-2xl relative my-auto mx-auto animate-in fade-in zoom-in-95">
              <div className="flex justify-between items-center mb-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>🌡️</span>
                  <span>AI Thermometer Scan</span>
                </h3>
                <div className="flex items-center gap-1.5">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition cursor-pointer ${
                        torchOn ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                      title="Toggle Torch"
                    >
                      🔦
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 text-xs transition cursor-pointer"
                    title="Flip Camera"
                  >
                    🔄
                  </button>
                  <button
                    type="button"
                    onClick={stopThermometerCamera}
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Viewfinder with Visual Center Guide */}
              <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center w-full aspect-square mx-auto">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Target Viewfinder Guide */}
                <div className="absolute inset-4 border-2 border-emerald-400/80 rounded-2xl pointer-events-none flex items-center justify-center">
                  <div className="w-px h-3/4 border-l border-dashed border-emerald-400/50" />
                </div>

                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-white/10 px-2.5 py-0.5 rounded-full text-[10px] text-emerald-300 font-semibold pointer-events-none select-none tracking-wide shadow-sm flex items-center gap-1 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Align red liquid line in center</span>
                </div>

                {/* Instant Analysis Spinner */}
                {aiScanning && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-3 text-center z-10 animate-in fade-in">
                    <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <h4 className="text-xs font-bold text-white">AI Reading (1-2s)...</h4>
                  </div>
                )}
              </div>

              <p className="mt-2 text-center text-[10px] text-slate-400">
                Hold 6–10 inches away · Keep red line clear
              </p>

              {cameraModalError && (
                <div className="mt-2 bg-rose-950/90 border border-rose-500/60 rounded-xl p-2.5 text-left space-y-1.5 animate-in fade-in">
                  <p className="text-[11px] text-rose-200 leading-tight font-medium">
                    {cameraModalError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCameraModalError('')}
                    className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Try Again 📸
                  </button>
                </div>
              )}

              <div className="mt-3">
                <button
                  type="button"
                  onClick={captureAndScanThermometer}
                  disabled={aiScanning}
                  className="w-full bg-blue-600 hover:bg-blue-500 active:scale-98 disabled:opacity-50 text-white font-bold py-2.5 px-3 rounded-xl shadow-lg flex items-center justify-center gap-2 transition cursor-pointer text-xs sm:text-sm"
                >
                  <span>📸</span>
                  <span>{aiScanning ? 'Analyzing...' : 'Capture & Read'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
