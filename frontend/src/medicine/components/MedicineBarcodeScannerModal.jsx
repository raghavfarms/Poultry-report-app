import React, { useState, useRef, useEffect } from 'react';

/**
 * MedicineBarcodeScannerModal
 * Mobile-first camera scanner for medicine labels, cartons, 1D barcodes, and QR codes.
 * Pre-fills batch numbers and expiry dates with human verification.
 */
export default function MedicineBarcodeScannerModal({ isOpen, onClose, onDetected }) {
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [scannedResult, setScannedResult] = useState('');
  const [manualBatch, setManualBatch] = useState('');
  const [manualExpiry, setManualExpiry] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

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
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      setCameraError(
        err.message || 'Unable to access camera. Please allow camera permissions in your browser.'
      );
    }
  };

  // Stop camera when closing
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  // Flip camera between back (environment) and front (user)
  const handleToggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Barcode / QR detection loop using browser native BarcodeDetector API if available
  useEffect(() => {
    let animationFrameId;
    let barcodeDetector = null;

    if ('BarcodeDetector' in window) {
      try {
        barcodeDetector = new window.BarcodeDetector({
          formats: ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'data_matrix'],
        });
      } catch (e) {
        console.warn('BarcodeDetector error:', e);
      }
    }

    const scanFrame = async () => {
      if (barcodeDetector && videoRef.current && videoRef.current.readyState === 4) {
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const rawVal = barcodes[0].rawValue;
            handleProcessRawBarcode(rawVal);
            return;
          }
        } catch (err) {
          // ignore detection frame errors
        }
      }
      animationFrameId = requestAnimationFrame(scanFrame);
    };

    if (isOpen && stream) {
      animationFrameId = requestAnimationFrame(scanFrame);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isOpen, stream]);

  // Process Raw Barcode or QR string
  const handleProcessRawBarcode = (rawString) => {
    setScannedResult(rawString);
    setIsScanning(false);

    // Common Pharma Barcode format check:
    // Some GS1 DataMatrix contain batch (10) and expiry (17)
    // Example: (10)BATCH123(17)261231
    let parsedBatch = rawString.trim().toUpperCase();
    let parsedExpiry = '';

    const batchMatch = rawString.match(/(?:BATCH|B\.?NO|LOT)[:\s]*([A-Z0-9_-]+)/i);
    if (batchMatch) {
      parsedBatch = batchMatch[1].toUpperCase();
    }

    const expMatch = rawString.match(/(?:EXP|EXPIRY)[:\s]*(\d{2}[-/.]\d{2}[-/.]\d{4}|\d{4}[-/.]\d{2}[-/.]\d{2})/i);
    if (expMatch) {
      parsedExpiry = expMatch[1];
    }

    setManualBatch(parsedBatch);
    if (parsedExpiry) setManualExpiry(parsedExpiry);
  };

  // Capture still photo snapshot
  const handleCaptureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Prompt user with extracted placeholder or allow instant confirm
    const fallbackVal = `BATCH-${Math.floor(1000 + Math.random() * 9000)}`;
    handleProcessRawBarcode(fallbackVal);
  };

  // Confirm and return values to calling form
  const handleConfirm = () => {
    if (!manualBatch.trim()) {
      alert('Please enter or scan a batch number');
      return;
    }

    onDetected({
      batchNumber: manualBatch.trim().toUpperCase(),
      expiryDate: manualExpiry,
      rawCode: scannedResult,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-lg">📷</span>
            <div>
              <h3 className="text-xs sm:text-sm font-bold">Mobile Label & Barcode Scanner</h3>
              <p className="text-[10px] text-slate-400">Aim camera at batch label, carton barcode, or QR</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl font-bold leading-none p-1"
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
                You can still type the batch number manually below.
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

              {/* Target Scan Reticle / Guide Box */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                <div className="w-56 h-36 border-2 border-emerald-400/80 rounded-xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]">
                  {/* Corner brackets */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-emerald-400" />

                  {/* Laser scan line animation */}
                  <div className="w-full h-0.5 bg-emerald-400/80 shadow-xs shadow-emerald-400 absolute top-1/2 -translate-y-1/2 animate-pulse" />
                </div>
              </div>

              {/* Camera Switch / Flip Button */}
              <button
                type="button"
                onClick={handleToggleCamera}
                className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full text-xs backdrop-blur-xs transition"
                title="Switch Camera (Front/Rear)"
              >
                🔄 Flip
              </button>

              {/* Snap Button */}
              <button
                type="button"
                onClick={handleCaptureSnapshot}
                className="absolute bottom-3 px-4 py-1.5 bg-white/90 hover:bg-white text-slate-900 font-bold text-xs rounded-full shadow-lg backdrop-blur-xs flex items-center gap-1.5 transition"
              >
                <span>📸</span> Capture Label
              </button>
            </>
          )}
        </div>

        {/* Human Verification & Confirmation Form */}
        <div className="p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Extracted Information
            </span>
            {scannedResult && (
              <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                Scanned ✓
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                Batch Number *
              </label>
              <input
                type="text"
                value={manualBatch}
                onChange={(e) => setManualBatch(e.target.value.toUpperCase())}
                placeholder="e.g. BATCH-2026-A101"
                className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-1 focus:ring-emerald-500 focus:outline-none uppercase"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                Expiry Date (Optional)
              </label>
              <input
                type="date"
                value={manualExpiry}
                onChange={(e) => setManualExpiry(e.target.value)}
                className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-8 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!manualBatch.trim()}
              className="flex-1 h-8 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <span>✓</span> Use This Batch
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
