import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../api/client.js';
import { recordTemperature, fetchRecentLogs, scanThermometerWithAi } from '../api/temperatureApi.js';

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
  const [baseTemperature, setBaseTemperature] = useState(null); // The original AI/scanned value
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

  // QR Scanner Reference & Camera State
  const html5QrCodeRef = useRef(null);
  const [cameraError, setCameraError] = useState('');

  // 6. AI Vision Thermometer Scanner States
  const [thermometerCameraOpen, setThermometerCameraOpen] = useState(false);
  const [aiScanning, setAiScanning] = useState(false);
  const [aiVerified, setAiVerified] = useState(false);
  const [aiDetails, setAiDetails] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraFacing, setCameraFacing] = useState('environment'); // 'environment' | 'user'
  const [cameraModalError, setCameraModalError] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaStreamRef = useRef(null);

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

  // Load farms on mount (strictly respecting user module permissions)
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
      setEntryMode('scanned');
      // If not yet scanned with thermometer AI, default base temp to 26
      setBaseTemperature(26);
      setTemperature('26');
    } catch (err) {
      console.error('Scan parse error:', err);
      setError('Invalid QR code format. Please scan a valid thermometer sticker.');
    }
  };

  // =========================================================================
  // AI VISION THERMOMETER CAMERA SCANNING
  // =========================================================================

  // Start AI Thermometer Camera Stream
  const startThermometerCamera = async () => {
    setError('');
    setCameraModalError('');
    setThermometerCameraOpen(true);
    setAiScanning(false);

    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // Strictly prioritize back camera (environment facing) on phones
      const constraints = {
        video: {
          facingMode: { exact: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (exactErr) {
        // Fallback for laptop webcams or devices that don't support { exact: 'environment' }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
          audio: false,
        });
      }

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.warn('Live stream camera not accessible directly:', err);
    }
  };

  // Flip Camera between back and front
  const toggleCameraFacing = async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
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

  // Stop AI Thermometer Camera
  const stopThermometerCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setThermometerCameraOpen(false);
    setCameraModalError('');
  };

  // Capture current frame at high resolution (using ImageCapture if supported, or HD canvas)
  const captureAndScanThermometer = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;

    // Verify video stream is active and has rendered dimensions
    if (video.readyState < 2 || !video.videoWidth) {
      setCameraModalError('Camera stream is still starting, please wait a moment and try again.');
      return;
    }
    setCameraModalError('');

    // Try native ImageCapture API on mobile Chrome for maximum sensor focus & resolution
    try {
      const track = mediaStreamRef.current?.getVideoTracks()?.[0];
      if (typeof window !== 'undefined' && 'ImageCapture' in window && track) {
        try {
          const imageCapture = new window.ImageCapture(track);
          const blob = await imageCapture.takePhoto();
          const reader = new FileReader();
          reader.onload = () => {
            if (reader.result) {
              processThermometerImageWithAi(reader.result);
            }
          };
          reader.readAsDataURL(blob);
          return;
        } catch (icErr) {
          console.warn('ImageCapture takePhoto fallback to canvas:', icErr);
        }
      }
    } catch (e) {
      console.warn('ImageCapture error:', e);
    }

    // Optimized Canvas snapshot with crisp resolution and quality for instant upload & AI scan
    const canvas = canvasRef.current || document.createElement('canvas');

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    const maxDim = 1280;
    let width = vWidth;
    let height = vHeight;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    processThermometerImageWithAi(dataUrl);
  };

  // Handle image selected via native camera app or file input
  const handleNativeImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        processThermometerImageWithAi(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Send image to backend Gemini Vision API
  const processThermometerImageWithAi = async (dataUrl) => {
    setAiScanning(true);
    setCameraModalError('');
    setError('');

    try {
      setCapturedImage(dataUrl);
      const res = await scanThermometerWithAi(dataUrl);

      if (res.success && res.data && typeof res.data.temperature === 'number') {
        const detectedTempNum = Math.round(res.data.temperature);
        const detectedTemp = detectedTempNum.toString();
        setBaseTemperature(detectedTempNum);
        setTemperature(detectedTemp);
        setManualForm((prev) => ({ ...prev, temperature: detectedTemp }));
        setAiVerified(true);
        setAiDetails(res.data);
        setSuccessMsg(
          `✨ Gemini AI successfully read ${detectedTemp}°C (${Math.round((res.data.confidence || 0.9) * 100)}% match)! You can adjust by ±4°C if needed.`
        );
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
      let errMsg = err.message || 'Failed to analyze thermometer image with AI';
      if (err.message?.includes('GEMINI_API_KEY')) {
        errMsg = 'Google Gemini API Key is missing in backend/.env. Please configure GEMINI_API_KEY.';
      }
      setCameraModalError(errMsg);
    } finally {
      setAiScanning(false);
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
        verifiedByAi: aiVerified,
        aiConfidence: aiDetails?.confidence || null,
        thermometerImageUrl: capturedImage || null,
      };

      const res = await recordTemperature(payload);
      setSuccessMsg(res.message || 'Temperature recorded successfully!');
      setEntryMode('initial');
      setScannedSpot(null);
      setTemperature('');
      setAiVerified(false);
      setAiDetails(null);
      setCapturedImage(null);
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
        verifiedByAi: aiVerified,
        aiConfidence: aiDetails?.confidence || null,
        thermometerImageUrl: capturedImage || null,
      };

      const res = await recordTemperature(payload);
      setSuccessMsg(res.message || 'Manual temperature entry recorded');
      setEntryMode('initial');
      setManualForm((prev) => ({ ...prev, temperature: '' }));
      setAiVerified(false);
      setAiDetails(null);
      setCapturedImage(null);
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
    <div className="p-2 sm:p-4 max-w-[440px] mx-auto space-y-4">
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

          {/* Primary Action Button: Scan Spot QR (reduced width by 30%) */}
          <div className="flex justify-center">
            <button
              onClick={startCameraScanner}
              className="w-[70%] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-3 rounded-2xl shadow-md flex items-center justify-center gap-2 transition transform active:scale-98 cursor-pointer text-xs sm:text-sm"
            >
              <span className="text-base">⚡</span>
              <span>Scan Spot QR</span>
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
      {/* AI THERMOMETER CAMERA SCANNER MODAL (Gemini Vision)                       */}
      {/* ========================================================================= */}
      {thermometerCameraOpen && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-3">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-[340px] w-full p-4 text-white shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span className="text-indigo-400">🤖</span>
                  Thermometer AI Vision
                </h3>
                <p className="text-[10px] text-slate-400">Google Gemini Vision auto-reader</p>
              </div>
              <button
                type="button"
                onClick={stopThermometerCamera}
                className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Video Viewfinder with Alignment Reticle */}
            <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center aspect-[4/5] max-h-[300px]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Target Box Overlay */}
              <div className="absolute inset-5 border-2 border-indigo-400/70 rounded-2xl pointer-events-none flex flex-col justify-between p-2 shadow-[0_0_20px_rgba(99,102,241,0.25)]">
                <div className="flex justify-between text-[9px] text-indigo-300 font-mono">
                  <span>┌ SCALE</span>
                  <span>┐</span>
                </div>

                {/* Target Guide */}
                <div className="w-full border-t border-dashed border-indigo-400/60 relative">
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] bg-indigo-950/90 px-1.5 py-0.5 rounded text-indigo-300 font-semibold tracking-wider uppercase">
                    Align Meniscus / Display
                  </span>
                </div>

                <div className="flex justify-between text-[9px] text-indigo-300 font-mono">
                  <span>└ °C</span>
                  <span>┘</span>
                </div>
              </div>

              {/* Analyzing Spinner during Gemini processing */}
              {aiScanning && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-3 text-center z-10 animate-in fade-in duration-150">
                  <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <div>
                    <h4 className="text-xs font-bold text-white">Gemini Vision Analyzing</h4>
                    <p className="text-[10px] text-indigo-300 mt-0.5">Reading spirit tube / digits...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Real-time Error & Fallback Banner inside Modal */}
            {cameraModalError && (
              <div className="mt-2.5 bg-rose-950/90 border border-rose-500/60 rounded-2xl p-3 text-left space-y-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <span className="text-sm">⚠️</span>
                  <p className="text-[11px] text-rose-200 leading-tight font-medium">
                    {cameraModalError}
                  </p>
                </div>
                <div className="flex items-center gap-2 pt-1 border-t border-rose-800/50">
                  <button
                    type="button"
                    onClick={() => {
                      setBaseTemperature(26);
                      setTemperature('26');
                      setAiVerified(false);
                      setAiDetails({ explanation: 'Adjusted within ±4°C' });
                      setCameraModalError('');
                      stopThermometerCamera();
                    }}
                    className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-xl transition cursor-pointer text-center shadow-sm"
                  >
                    Use 26°C & adjust (±4°C) →
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraModalError('')}
                    className="py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded-xl transition cursor-pointer"
                  >
                    Retry 📸
                  </button>
                </div>
              </div>
            )}

            {/* Hidden native camera file input for phone capture */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleNativeImageUpload}
              className="hidden"
            />

            {/* Camera Actions */}
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={captureAndScanThermometer}
                disabled={aiScanning}
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-2.5 px-3 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50 text-xs"
              >
                <span className="text-base">📸</span>
                <span>{aiScanning ? 'Analyzing with AI...' : 'Capture & Read'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={aiScanning}
                  className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                  title="Take photo with native camera app"
                >
                  <span>📱</span>
                  <span>Phone Photo</span>
                </button>

                <button
                  type="button"
                  onClick={toggleCameraFacing}
                  className="py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <span>🔄</span>
                  <span>Flip Camera</span>
                </button>
              </div>

              <p className="text-[10px] text-center text-slate-400">
                Hold still • Auto-detects spirit tube liquid level & digital numbers
              </p>
            </div>
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

            {/* Temperature Reading Input with inline Scan button and + / - adjusters */}
            <div className="py-3 flex justify-between items-center gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-700 font-bold block">Temperature</span>
                  {aiVerified && (
                    <span
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200"
                      title={aiDetails?.explanation || 'AI Verified'}
                    >
                      {aiDetails?.modelUsed?.includes('Gemini') ? 'Gemini ✓' : 'AI ✓'}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400">
                  {aiVerified && aiDetails?.confidence
                    ? `${Math.round(aiDetails.confidence * 100)}% match · ${aiDetails?.modelUsed || 'AI'}`
                    : 'Read from analog spirit tube'}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Small AI Scan Button */}
                <button
                  type="button"
                  onClick={startThermometerCamera}
                  disabled={aiScanning}
                  className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-[10px] py-1.5 px-2 rounded-lg shadow-sm flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                  title="Scan thermometer with AI"
                >
                  <span className="text-xs">📷</span>
                  <span className="font-semibold text-[10px]">{aiScanning ? '...' : 'Scan'}</span>
                </button>

                {/* Stepper Buttons [ - ] [ input ] [ + ] °C with strict ±4°C limit */}
                <div className="flex items-center gap-0.5 bg-slate-50 border border-slate-300 rounded-xl p-0.5">
                  {/* Minus button (limited to base - 4) */}
                  <button
                    type="button"
                    onClick={() => {
                      const base = baseTemperature !== null ? baseTemperature : (parseInt(temperature, 10) || 26);
                      const minAllowed = base - 4;
                      const cur = parseInt(temperature, 10) || base;
                      if (cur > minAllowed) {
                        setTemperature(String(cur - 1));
                      }
                    }}
                    disabled={(() => {
                      const base = baseTemperature !== null ? baseTemperature : (parseInt(temperature, 10) || 26);
                      const cur = parseInt(temperature, 10) || base;
                      return cur <= base - 4;
                    })()}
                    className="w-6 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 font-bold text-sm shadow-2xs active:scale-90 transition cursor-pointer select-none"
                    title="Decrease by 1°C (Max -4°C allowed)"
                  >
                    −
                  </button>

                  <input
                    type="text"
                    readOnly
                    required
                    placeholder="26"
                    value={temperature ? `${temperature}` : '26'}
                    className="w-8 bg-transparent text-center text-sm font-black text-slate-900 select-none cursor-default focus:outline-none"
                    title={`Scanned: ${baseTemperature || 26}°C (Adjustment allowed: ±4°C)`}
                  />

                  {/* Plus button (limited to base + 4) */}
                  <button
                    type="button"
                    onClick={() => {
                      const base = baseTemperature !== null ? baseTemperature : (parseInt(temperature, 10) || 26);
                      const maxAllowed = base + 4;
                      const cur = parseInt(temperature, 10) || base;
                      if (cur < maxAllowed) {
                        setTemperature(String(cur + 1));
                      }
                    }}
                    disabled={(() => {
                      const base = baseTemperature !== null ? baseTemperature : (parseInt(temperature, 10) || 26);
                      const cur = parseInt(temperature, 10) || base;
                      return cur >= base + 4;
                    })()}
                    className="w-6 h-7 flex items-center justify-center rounded-lg bg-white hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed text-slate-700 font-bold text-sm shadow-2xs active:scale-90 transition cursor-pointer select-none"
                    title="Increase by 1°C (Max +4°C allowed)"
                  >
                    +
                  </button>
                </div>
                <span className="text-xs font-bold text-slate-700">°C</span>
              </div>
            </div>

            {/* Small helper text showing the ±4°C limitation */}
            {baseTemperature !== null && (
              <div className="flex justify-between items-center text-[10px] text-slate-400 px-0.5">
                <span>Scanned: {baseTemperature}°C</span>
                <span className="font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                  Allowed range: {baseTemperature - 4}°C to {baseTemperature + 4}°C
                </span>
              </div>
            )}

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

    </div>
  );
}

