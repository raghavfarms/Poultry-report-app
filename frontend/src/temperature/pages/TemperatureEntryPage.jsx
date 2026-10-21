import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
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
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
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

  // Start Camera Scanner (Ultra-Fast QR Scanning with hardware acceleration)
  const startCameraScanner = async () => {
    setError('');
    setCameraError('');
    setEntryMode('scanning');

    setTimeout(async () => {
      try {
        if (html5QrCodeRef.current) {
          try {
            await html5QrCodeRef.current.stop();
          } catch (_) {}
        }

        // Hardware-accelerated BarcodeDetector with QR_CODE filter only
        const qrCodeScanner = new Html5Qrcode('qr-reader', {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = qrCodeScanner;

        // Dynamic large scan box covering 85% of viewfinder for instant trigger
        const qrBoxFunction = (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const size = Math.floor(minEdge * 0.85);
          return { width: size, height: size };
        };

        const config = {
          fps: 30, // 30 fps for instantaneous frame capture and decoding
          qrbox: qrBoxFunction,
          aspectRatio: 1.0,
          disableFlip: false,
        };

        // Instant startup: Try environment camera directly without device enumeration lag
        let started = false;
        try {
          await qrCodeScanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText) => {
              handleScanSuccess(decodedText);
            },
            () => {}
          );
          started = true;
        } catch (envErr) {
          console.warn('Environment facing camera failed, falling back to front/webcam:', envErr);
        }

        if (!started) {
          try {
            // Fallback for laptops and desktop webcams
            await qrCodeScanner.start(
              { facingMode: 'user' },
              config,
              (decodedText) => {
                handleScanSuccess(decodedText);
              },
              () => {}
            );
            started = true;
          } catch (userErr) {
            // Final fallback to enumerated device
            const cameras = await Html5Qrcode.getCameras();
            if (cameras && cameras.length > 0) {
              await qrCodeScanner.start(
                cameras[0].id,
                config,
                (decodedText) => {
                  handleScanSuccess(decodedText);
                },
                () => {}
              );
            } else {
              throw userErr;
            }
          }
        }
      } catch (err) {
        console.error('Unable to start camera:', err);
        setCameraError(err.message || 'Camera permission denied or camera not found');
      }
    }, 60);
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
      // Temperature must be scanned from thermometer - do NOT pre-fill
      setBaseTemperature(null);
      setTemperature('');
      setAiVerified(false);
      setAiDetails(null);
      setCapturedImage(null);
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

  // Toggle Flashlight / Torch for dim shed lighting
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
      console.warn('Torch toggle error:', e);
    }
  };

  // Stop AI Thermometer Camera
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

    // Instantaneous Canvas snapshot: Grab frame directly from active video stream (takes <5ms, ~45KB payload)
    const canvas = canvasRef.current || document.createElement('canvas');

    const vWidth = video.videoWidth || 1280;
    const vHeight = video.videoHeight || 720;
    const maxDim = 1000;
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

    // Optimized 0.82 quality produces ~80KB payload for sub-second upload over mobile 4G
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    processThermometerImageWithAi(dataUrl);
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
        temperature: Math.round(parseFloat(temperature)),
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
        temperature: Math.round(parseFloat(manualForm.temperature)),
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
      {entryMode === 'scanning' &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-5 text-white shadow-2xl relative my-auto mx-auto animate-in fade-in zoom-in-95 duration-150">
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
              <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center w-full min-h-[260px] mx-auto">
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
          </div>,
          document.body
        )}

      {/* ========================================================================= */}
      {/* AI THERMOMETER CAMERA SCANNER MODAL (Gemini Vision)                       */}
      {/* ========================================================================= */}
      {thermometerCameraOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-[340px] w-full p-4 text-white shadow-2xl relative my-auto mx-auto animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>🌡️</span>
                  <span>Scan Thermometer</span>
                </h3>
                <div className="flex items-center gap-2">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition cursor-pointer ${torchOn ? 'bg-amber-400 text-slate-950 font-bold shadow-xs' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                      title="Toggle Flashlight / Torch"
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
                    className="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 text-sm font-bold transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Video Viewfinder - 3:4 portrait view so full thermometer fits without cutting off */}
              <div className="relative overflow-hidden rounded-2xl bg-black border border-slate-800 flex items-center justify-center w-full aspect-[3/4] max-h-[410px] mx-auto">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Professional Thermometer Stencil Guide Overlay */}
                <div className="absolute inset-3 pointer-events-none flex flex-col items-center justify-between border-2 border-dashed border-emerald-400/60 rounded-2xl p-2 bg-emerald-500/[0.02]">
                  {/* Top scale guide */}
                  <div className="w-full flex justify-between items-center px-1 text-[9px] font-bold text-emerald-300/80 uppercase">
                    <span>50°C</span>
                    <span className="text-[10px] bg-slate-900/70 px-1.5 py-0.2 rounded">▲ TOP</span>
                    <span>120°F</span>
                  </div>

                  {/* Center capillary hairline + Meniscus target box */}
                  <div className="relative flex-1 w-full flex items-center justify-center my-1">
                    <div className="w-0.5 h-full bg-gradient-to-b from-transparent via-emerald-400/50 to-transparent" />
                    <div className="absolute w-28 h-20 border border-emerald-400/80 rounded-xl bg-emerald-400/10 flex items-center justify-center shadow-xs">
                      <span className="text-[9px] font-bold text-emerald-200 tracking-wider uppercase bg-slate-900/90 px-2 py-0.5 rounded shadow">
                        Liquid Tip Here
                      </span>
                    </div>
                  </div>

                  {/* Bottom scale guide */}
                  <div className="w-full flex justify-between items-center px-1 text-[9px] font-bold text-emerald-300/80 uppercase">
                    <span>0°C</span>
                    <span className="text-[10px] bg-slate-900/70 px-1.5 py-0.2 rounded">▼ BULB</span>
                    <span>32°F</span>
                  </div>
                </div>

                {/* Top Badge: Alignment guidance */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xs border border-white/10 px-2.5 py-0.5 rounded-full text-[10px] text-emerald-300 font-semibold pointer-events-none select-none tracking-wide shadow-sm flex items-center gap-1 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Align liquid tip inside target box</span>
                </div>

                {/* Analyzing Spinner during processing */}
                {aiScanning && (
                  <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-3 text-center z-10 animate-in fade-in duration-150">
                    <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    <h4 className="text-xs font-bold text-white">Reading temperature...</h4>
                  </div>
                )}
              </div>

              {/* Worker Camera Guidance Tip */}
              <div className="mt-2 text-center">
                <p className="text-[10px] text-slate-400 font-medium">
                  Hold 6–10 inches away · Avoid overhead light glare
                </p>
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
                  <div className="pt-1 border-t border-rose-800/50">
                    <button
                      type="button"
                      onClick={() => setCameraModalError('')}
                      className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer text-center shadow-sm"
                    >
                      Retry Photo 📸
                    </button>
                  </div>
                </div>
              )}

              {/* Camera Actions */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={captureAndScanThermometer}
                  disabled={aiScanning}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-3 rounded-2xl shadow-lg flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer disabled:opacity-50 text-sm"
                >
                  <span className="text-base">📸</span>
                  <span>{aiScanning ? 'Scanning...' : 'Capture'}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
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

            {/* Temperature Reading Row */}
            <div className="py-2.5 flex justify-between items-center gap-2">
              <span className="text-slate-500 font-medium">Temperature</span>

              {baseTemperature === null ? (
                /* Before scan: Clean Scan button */
                <button
                  type="button"
                  onClick={startThermometerCamera}
                  disabled={aiScanning}
                  className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs py-1.5 px-3 rounded-xl shadow-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                >
                  <span>📷</span>
                  <span>{aiScanning ? 'Scanning...' : 'Scan'}</span>
                </button>
              ) : (
                /* Strictly scanned temperature from camera - no manual editing or stepper */
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={startThermometerCamera}
                    disabled={aiScanning}
                    className="bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 font-semibold text-xs py-1.5 px-2 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                    title="Rescan"
                  >
                    <span>🔄</span>
                    <span className="text-[10px]">Rescan</span>
                  </button>

                  <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 rounded-xl px-3 py-1">
                    <span className="text-sm font-black text-emerald-950">
                      {temperature}°C
                    </span>
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                      ✓ Scanned
                    </span>
                  </div>
                </div>
              )}
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
              disabled={saving || !temperature || baseTemperature === null}
              className="py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold text-xs rounded-2xl shadow-md transition cursor-pointer text-center"
            >
              {saving ? 'Saving...' : baseTemperature === null ? 'Scan thermometer to save' : 'Save entry'}
            </button>
          </div>
        </form>
      )}

    </div>
  );
}

