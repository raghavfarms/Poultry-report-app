import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Intelligent Poultry Medicine Label & Barcode Parser
 * Tolerant to handwriting quirks, OCR misreads (BATU, BAICH, OO2, etc.),
 * spaces around date slashes (10 / 11 / 26), and em-dashes.
 */
export function cleanOcrText(text) {
  if (!text) return '';
  return text
    .replace(/[—–]/g, '-')
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/\|/g, '/')
    .trim();
}

export function parseLabelText(rawText, availableMedicines = []) {
  if (!rawText) return { batchNumber: '', expiryDate: '', medicineName: '', raw: '', candidates: [] };

  const cleaned = cleanOcrText(rawText);
  const lines = cleaned.split('\n').map((l) => l.trim()).filter(Boolean);

  let batchNumber = '';
  let expiryDate = '';
  let medicineName = '';
  const candidates = [];

  // 1. Batch Number parsing
  // Matches BATCH, BAICH, BATU, BATOH, 8ATCH, BTCH, B.NO, B NO, LOT, LOT NO, BNO
  const batchRegex = /(?:BATCH|BAICH|BATU|BATOH|8ATCH|BTCH|B\.?\s*NO\.?|LOT|LOT\.?\s*NO\.?|BNO)[\s\-:=_~]*([A-Za-z0-9_\-\/]+)/i;

  for (const line of lines) {
    const m = line.match(batchRegex);
    if (m && m[1]) {
      let val = m[1].trim();
      // Replace O's with 0's if it looks like a number: e.g. OO2 -> 002
      if (/^[oO0-9]+$/.test(val)) {
        val = val.replace(/o/gi, '0');
      }

      if (/^\d+$/.test(val)) {
        batchNumber = `BATCH-${val}`;
        // If handwriting loop turned a 0 into a 6 (e.g. 062 vs 002), provide alternate
        if (val.includes('6')) {
          candidates.push(`BATCH-${val.replace('6', '0')}`);
        }
      } else if (/^BATCH/i.test(val)) {
        batchNumber = val.toUpperCase();
      } else {
        batchNumber = val.toUpperCase();
      }
      break;
    }
  }

  // Fallback: check if any line starts with B- or BATCH or LOT
  if (!batchNumber) {
    for (const line of lines) {
      if (/^(?:B|BATCH|LOT)[\s\-:]*(\d+[A-Za-z0-9_\-\/]*)/i.test(line)) {
        const m = line.match(/^(?:B|BATCH|LOT)[\s\-:]*(\d+[A-Za-z0-9_\-\/]*)/i);
        if (m && m[1]) {
          batchNumber = `BATCH-${m[1].toUpperCase()}`;
          break;
        }
      }
    }
  }

  // 2. Expiry Date parsing:
  // Permissive with spaces around slashes, dashes, dots, or pipes (e.g. 10 / 11 / 26 or 10/11/26)
  const dateRegex = /(?:EXP|EXPIRY|EXPD|VALID|USE\s*BY|BEST\s*BEFORE)?[\s\-:=_~]*(\b\d{4}|\b\d{1,2})\s*[\/\-\.\|\\]\s*(\d{1,2})\s*[\/\-\.\|\\]\s*(\d{2,4}\b)/i;

  for (const line of lines) {
    const m = line.match(dateRegex);
    if (m) {
      const p1 = m[1];
      const p2 = m[2];
      const p3 = m[3];
      if (p1.length === 4) {
        // YYYY-MM-DD
        const yyyy = p1;
        const mm = p2.padStart(2, '0');
        const dd = p3.padStart(2, '0');
        expiryDate = `${yyyy}-${mm}-${dd}`;
      } else {
        // DD/MM/YY or DD/MM/YYYY
        let d = parseInt(p1, 10);
        let mVal = parseInt(p2, 10);
        let y = parseInt(p3, 10);
        if (y < 100) y = 2000 + y;
        if (mVal > 12 && d <= 12) {
          const t = d;
          d = mVal;
          mVal = t;
        }
        if (mVal >= 1 && mVal <= 12 && d >= 1 && d <= 31) {
          expiryDate = `${y}-${String(mVal).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }
      if (expiryDate) break;
    }
  }

  // Check 2-part MM/YYYY or MM/YY e.g. 11/26 or 10/2026
  if (!expiryDate) {
    const myRegex = /(?:EXP|EXPIRY|EXPD|VALID|USE\s*BY)?[\s\-:=_~]*(\b\d{1,2})\s*[\/\-\.\|\\]\s*(\d{2,4}\b)/i;
    for (const line of lines) {
      const m = line.match(myRegex);
      if (m) {
        const mVal = parseInt(m[1], 10);
        let yVal = parseInt(m[2], 10);
        if (mVal >= 1 && mVal <= 12) {
          if (yVal < 100) yVal = 2000 + yVal;
          expiryDate = `${yVal}-${String(mVal).padStart(2, '0')}-01`;
          break;
        }
      }
    }
  }

  // 3. Medicine Name parsing
  const nameRegex = /(?:NAME|MEDICINE|PRODUCT|DRUG)[\s\-:=_~]*([A-Za-z0-9\s]+)/i;
  for (const line of lines) {
    const m = line.match(nameRegex);
    if (m && m[1]) {
      medicineName = m[1].replace(/->.*$/, '').trim();
      break;
    }
  }

  // If medicineName is still empty, match against availableMedicines list
  if (!medicineName && availableMedicines.length > 0) {
    for (const med of availableMedicines) {
      const medName = (med.name || '').toLowerCase();
      if (medName.length >= 3 && cleaned.toLowerCase().includes(medName)) {
        medicineName = med.name;
        break;
      }
    }
  }

  return { batchNumber, expiryDate, medicineName, raw: rawText, candidates };
}

// Audio feedback on scan
function playSuccessBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    if (navigator.vibrate) navigator.vibrate(60);
  } catch (e) {
    // Ignore audio restrictions
  }
}

// Dynamically load Tesseract.js script
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('tesseract-cdn-script');
    if (existing) {
      const check = setInterval(() => {
        if (window.Tesseract) {
          clearInterval(check);
          resolve(window.Tesseract);
        }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.id = 'tesseract-cdn-script';
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.async = true;
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => reject(new Error('OCR engine script failed to load'));
    document.head.appendChild(script);
  });
}

export default function MedicineBarcodeScannerModal({ isOpen, onClose, onDetected, medicines = [] }) {
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState('environment');
  const [scannedResult, setScannedResult] = useState('');
  const [manualBatch, setManualBatch] = useState('');
  const [manualExpiry, setManualExpiry] = useState('');
  const [detectedMedicine, setDetectedMedicine] = useState('');
  const [ocrStatus, setOcrStatus] = useState('initializing'); // 'initializing' | 'active' | 'reading' | 'success'
  const [statusMessage, setStatusMessage] = useState('Initializing instant scanner...');
  const [lastDetectedRaw, setLastDetectedRaw] = useState('');
  const [batchCandidates, setBatchCandidates] = useState([]);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const isReadingRef = useRef(false);
  const workerRef = useRef(null);

  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  // Initialize persistent Tesseract Worker for INSTANT recognition
  const initOcrWorker = useCallback(async () => {
    try {
      if (workerRef.current) return workerRef.current;
      setStatusMessage('⚡ Starting instant OCR engine...');
      const Tesseract = await loadTesseract();
      const worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'loading language traineddata') {
            const pct = Math.round((m.progress || 0) * 100);
            setStatusMessage(`Loading OCR Model (${pct}%)...`);
          } else if (m.status === 'initializing tesseract') {
            setStatusMessage('Optimizing scanner...');
          }
        },
      });
      workerRef.current = worker;
      setOcrStatus('active');
      setStatusMessage('● Instant real-time scanner ready');
      return worker;
    } catch (err) {
      console.warn('Worker init error:', err);
      setStatusMessage('● Camera active (Barcode & text ready)');
      setOcrStatus('active');
      return null;
    }
  }, []);

  // Start Camera Stream
  const startCamera = async (mode = facingMode) => {
    try {
      setCameraError('');
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or environment.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
          focusMode: 'continuous',
        },
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      const track = mediaStream.getVideoTracks()[0];
      if (track) {
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        setHasTorch(Boolean(capabilities.torch));
      }

      setOcrStatus('active');
      setStatusMessage('● Real-time scanner active');
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError(
        err.message || 'Unable to access camera. Please allow camera permissions in your browser.'
      );
      setOcrStatus('ready');
    }
  };

  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const nextState = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Torch control not allowed:', e);
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (workerRef.current) {
      workerRef.current.terminate().catch(() => {});
      workerRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
      initOcrWorker();
    } else {
      stopCamera();
      setManualBatch('');
      setManualExpiry('');
      setDetectedMedicine('');
      setScannedResult('');
      setLastDetectedRaw('');
      setBatchCandidates([]);
    }
    return () => stopCamera();
  }, [isOpen]);

  const handleToggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Process raw barcode/QR string in real time (filter out noisy false-positives)
  const handleProcessRawBarcode = useCallback((rawString) => {
    if (!rawString || !rawString.trim()) return;
    const clean = rawString.trim();
    // Ignore false-positive 1D barcode glitches like "-3694" or single characters
    if (/^[-\s\d]{1,5}$/.test(clean) && !clean.includes('BATCH')) return;

    setScannedResult(clean);
    const parsed = parseLabelText(clean, medicines);
    if (parsed.batchNumber) {
      setManualBatch(parsed.batchNumber);
      playSuccessBeep();
      setStatusMessage(`✓ Detected: ${parsed.batchNumber}`);
    }
    if (parsed.expiryDate) {
      setManualExpiry(parsed.expiryDate);
    }
    if (parsed.medicineName) {
      setDetectedMedicine(parsed.medicineName);
    }
  }, [medicines]);

  // 1. Real-time Barcode / QR scanning loop (every animation frame)
  useEffect(() => {
    let animId;
    let detector = null;

    if ('BarcodeDetector' in window) {
      try {
        detector = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'data_matrix'],
        });
      } catch (e) {
        console.warn('BarcodeDetector error:', e);
      }
    }

    const checkBarcode = async () => {
      if (detector && videoRef.current && videoRef.current.readyState === 4) {
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0) {
            handleProcessRawBarcode(codes[0].rawValue);
          }
        } catch (e) {
          // ignore detection frame errors
        }
      }
      animId = requestAnimationFrame(checkBarcode);
    };

    if (isOpen && stream) {
      animId = requestAnimationFrame(checkBarcode);
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isOpen, stream, handleProcessRawBarcode]);

  // 2. Real-time OCR scanner: Wide-angle, optimized resolution, reusable worker
  const runOCR = useCallback(async (isManualSnap = false) => {
    if (isReadingRef.current || !videoRef.current || videoRef.current.readyState !== 4) return;
    if (!canvasRef.current) return;

    try {
      isReadingRef.current = true;
      if (isManualSnap) {
        setOcrStatus('reading');
        setStatusMessage('⚡ Instant scanning label...');
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      const vW = video.videoWidth || 640;
      const vH = video.videoHeight || 480;

      // Crop 85% width x 75% height centered to capture both Batch and Expiry without clipping
      const cropW = Math.floor(vW * 0.85);
      const cropH = Math.floor(vH * 0.75);
      const cropX = Math.floor((vW - cropW) / 2);
      const cropY = Math.floor((vH - cropH) / 2);

      // Scale to optimal OCR dimensions (max width 800px) for sub-second recognition
      const scale = Math.min(1, 800 / cropW);
      const outW = Math.floor(cropW * scale);
      const outH = Math.floor(cropH * scale);

      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      const worker = workerRef.current || (await initOcrWorker());
      if (!worker) return;

      const res = await worker.recognize(canvas);
      const text = res?.data?.text || '';

      if (text.trim()) {
        const cleanLines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join(' | ');
        setLastDetectedRaw(cleanLines);

        const parsed = parseLabelText(text, medicines);

        if (parsed.candidates && parsed.candidates.length > 0) {
          setBatchCandidates(parsed.candidates);
        }

        if (parsed.batchNumber || parsed.expiryDate || parsed.medicineName) {
          if (parsed.batchNumber) {
            setManualBatch(parsed.batchNumber);
            playSuccessBeep();
          }
          if (parsed.expiryDate) {
            setManualExpiry(parsed.expiryDate);
          }
          if (parsed.medicineName) {
            setDetectedMedicine(parsed.medicineName);
          }

          setScannedResult(parsed.batchNumber || text);
          setOcrStatus('success');
          setStatusMessage(
            `✓ Found: ${parsed.batchNumber || ''} ${parsed.expiryDate ? `(Exp: ${parsed.expiryDate})` : ''}`
          );
        } else if (isManualSnap) {
          setStatusMessage('Hold closer to text or tap "Take Photo"');
          setOcrStatus('active');
        } else {
          setOcrStatus('active');
          setStatusMessage('● Real-time scanner active');
        }
      } else {
        if (isManualSnap) {
          setStatusMessage('No text detected in box. Check lighting.');
        }
        setOcrStatus('active');
      }
    } catch (err) {
      console.warn('OCR error:', err);
      setStatusMessage('Scanner active');
      setOcrStatus('active');
    } finally {
      isReadingRef.current = false;
    }
  }, [initOcrWorker, medicines]);

  // Interval loop for background real-time OCR (runs every 1.2s for rapid real-time response)
  useEffect(() => {
    if (!isOpen || !stream) return;
    const intervalId = setInterval(() => {
      runOCR(false);
    }, 1200);

    return () => clearInterval(intervalId);
  }, [isOpen, stream, runOCR]);

  // Handle Manual Instant Snapshot Click
  const handleInstantScan = () => {
    runOCR(true);
  };

  // High-Resolution Native Photo Capture / File Upload Handler
  const handleImageFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setOcrStatus('reading');
      setStatusMessage('📸 Processing high-res photo...');

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = async () => {
        try {
          const canvas = canvasRef.current || document.createElement('canvas');
          const maxDim = 1200;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          const worker = workerRef.current || (await initOcrWorker());
          if (!worker) throw new Error('OCR worker unavailable');

          const res = await worker.recognize(canvas);
          const text = res?.data?.text || '';

          if (text.trim()) {
            const cleanLines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).join(' | ');
            setLastDetectedRaw(cleanLines);

            const parsed = parseLabelText(text, medicines);
            if (parsed.candidates) setBatchCandidates(parsed.candidates);

            if (parsed.batchNumber) {
              setManualBatch(parsed.batchNumber);
              playSuccessBeep();
            }
            if (parsed.expiryDate) {
              setManualExpiry(parsed.expiryDate);
            }
            if (parsed.medicineName) {
              setDetectedMedicine(parsed.medicineName);
            }

            setOcrStatus('success');
            setStatusMessage(`✓ Read: ${parsed.batchNumber || ''} ${parsed.expiryDate || ''}`);
          } else {
            setStatusMessage('⚠️ Could not read text on photo. Try typing below.');
            setOcrStatus('active');
          }
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      img.src = objectUrl;
    } catch (err) {
      console.error('File OCR error:', err);
      setStatusMessage('Error reading photo');
      setOcrStatus('active');
    }
  };

  // Confirm and send detected batch to form
  const handleConfirm = () => {
    if (!manualBatch.trim()) {
      alert('Please enter or scan a batch number');
      return;
    }

    onDetected({
      batchNumber: manualBatch.trim().toUpperCase(),
      expiryDate: manualExpiry,
      rawCode: scannedResult,
      medicineName: detectedMedicine,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-lg">📷</span>
            <div>
              <h3 className="text-xs sm:text-sm font-bold">Real-Time Medicine Scanner</h3>
              <p className="text-[10px] text-slate-400">Aim box at batch, expiry, label, or QR code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold leading-none p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Viewfinder Container */}
        <div className="relative bg-black h-64 sm:h-72 flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-4 text-center text-rose-300 text-xs max-w-xs space-y-2">
              <div>⚠️ {cameraError}</div>
              <p className="text-[10px] text-slate-400">
                You can still type the batch number manually or upload a photo below.
              </p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Real-time Status Overlay Pill */}
              <div className="absolute top-3 left-3 z-10">
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold shadow-md backdrop-blur-xs flex items-center gap-1.5 transition-all ${
                    ocrStatus === 'success'
                      ? 'bg-emerald-600 text-white'
                      : ocrStatus === 'reading'
                      ? 'bg-blue-600 text-white animate-pulse'
                      : 'bg-black/60 text-white'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ocrStatus === 'success'
                        ? 'bg-white'
                        : ocrStatus === 'reading'
                        ? 'bg-amber-300 animate-ping'
                        : 'bg-emerald-400'
                    }`}
                  />
                  {statusMessage}
                </span>
              </div>

              {/* Target Scan Reticle / Guide Box */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                <div
                  className={`w-72 h-40 border-2 rounded-xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-colors ${
                    ocrStatus === 'success'
                      ? 'border-emerald-400 shadow-emerald-500/20'
                      : ocrStatus === 'reading'
                      ? 'border-blue-400 shadow-blue-500/20'
                      : 'border-emerald-400/80'
                  }`}
                >
                  {/* Corner brackets */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />

                  {/* Laser scan line animation */}
                  <div className="w-full h-0.5 bg-emerald-400/90 shadow-xs shadow-emerald-400 absolute top-1/2 -translate-y-1/2 animate-pulse" />
                </div>
                <p className="text-[10px] text-white/90 font-medium mt-1.5 bg-black/60 px-2.5 py-0.5 rounded backdrop-blur-xs">
                  Place "Batch" & "Expiry" inside the green box
                </p>
              </div>

              {/* Camera Switch / Flip & Torch Buttons */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                {hasTorch && (
                  <button
                    type="button"
                    onClick={toggleTorch}
                    className={`p-2 rounded-full text-xs backdrop-blur-xs transition cursor-pointer ${
                      torchOn
                        ? 'bg-amber-400 text-slate-900 font-bold shadow-lg shadow-amber-500/50'
                        : 'bg-black/60 hover:bg-black/80 text-white'
                    }`}
                    title="Toggle Flashlight / Torch"
                  >
                    🔦 {torchOn ? 'ON' : 'OFF'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  className="p-2 bg-black/60 hover:bg-black/80 text-white rounded-full text-xs backdrop-blur-xs transition cursor-pointer"
                  title="Switch Camera (Front/Rear)"
                >
                  🔄 Flip
                </button>
              </div>

              {/* Instant Scan Controls Bar */}
              <div className="absolute bottom-2.5 flex items-center gap-2 z-10">
                <button
                  type="button"
                  onClick={handleInstantScan}
                  disabled={ocrStatus === 'reading'}
                  className="px-3 py-1.5 bg-white/95 hover:bg-white text-slate-900 font-bold text-[11px] rounded-full shadow-lg backdrop-blur-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <span>⚡</span>
                  {ocrStatus === 'reading' ? 'Scanning...' : 'Instant Fetch'}
                </button>

                {/* Native High-Res Photo Upload / Shutter */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-blue-600/95 hover:bg-blue-600 text-white font-bold text-[11px] rounded-full shadow-lg backdrop-blur-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>📸</span>
                  Take Photo
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageFileSelected}
                  className="hidden"
                />
              </div>
            </>
          )}
        </div>

        {/* Live Detected Text Strip */}
        {lastDetectedRaw && (
          <div className="px-4 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center gap-2 overflow-x-auto text-[10px] text-slate-600">
            <span className="font-bold text-slate-500 shrink-0">Live Text:</span>
            <span className="truncate italic text-slate-700">{lastDetectedRaw}</span>
          </div>
        )}

        {/* Live Form - Real Time Fetched Values */}
        <div className="p-4 space-y-3 bg-white overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Real-Time Extracted Values
            </span>
            {manualBatch && (
              <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <span>✓</span> Scanned in Real-Time
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="block text-[10px] font-bold text-slate-700 uppercase">
                  Batch Number *
                </label>
                {/* Alternate candidate chips (e.g. 062 vs 002 correction) */}
                {batchCandidates.length > 0 && (
                  <div className="flex items-center gap-1 text-[9px]">
                    <span className="text-slate-400">Did you mean:</span>
                    {batchCandidates.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setManualBatch(c)}
                        className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-bold hover:bg-amber-200 cursor-pointer"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="text"
                value={manualBatch}
                onChange={(e) => setManualBatch(e.target.value.toUpperCase())}
                placeholder="Aim camera at Batch or type here..."
                className={`w-full h-8 px-2.5 border rounded-lg text-xs font-bold text-slate-900 focus:outline-none uppercase transition-colors ${
                  manualBatch ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300'
                }`}
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-700 uppercase mb-0.5">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={manualExpiry}
                onChange={(e) => setManualExpiry(e.target.value)}
                className={`w-full h-8 px-2.5 border rounded-lg text-xs text-slate-800 focus:outline-none transition-colors ${
                  manualExpiry ? 'border-emerald-500 bg-emerald-50/30' : 'border-slate-300'
                }`}
              />
            </div>

            {detectedMedicine && (
              <div className="text-[11px] font-medium text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span>🏷️</span>
                  <span>Detected Medicine: <strong>{detectedMedicine}</strong></span>
                </div>
                <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Auto-Matched</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!manualBatch.trim()}
              className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>✓</span> Use This Batch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
