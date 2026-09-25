import SupervisorAttendancePanel from '../components/SupervisorAttendancePanel.jsx';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';
import { Alert, Spinner } from '../../components/Ui.jsx';
import { loadFaceModels, detectFaceForEnrolment } from '../services/faceModelLoader.js';
import { captureLocation } from '../services/captureLocation.js';

function playChime(success = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (success) {
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // Audio may be blocked before interaction
  }
}

export default function WorkerAttendancePortal() {
  const { user, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState('');
  const [punchNotice, setPunchNotice] = useState('');

  // Camera & Face Scanner state
  const [showScanner, setShowScanner] = useState(false);
  const [scannerFeedback, setScannerFeedback] = useState('Initializing camera...');
  const [cameraFacing, setCameraFacing] = useState('user'); // front camera by default
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const isScanningActiveRef = useRef(false);
  const processingRef = useRef(false);

  // 1. Fetch Worker Profile & Today's Attendance
  async function loadProfile() {
    setLoading(true);
    try {
      const data = await api('/attendance/worker/me');
      setProfileData(data);
      setError('');
    } catch (err) {
      setError(err?.message || 'Failed to load profile. Please check network.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
    return () => {
      stopStream();
    };
  }, []);

  // Determine attendance status for today
  const todaySession = profileData?.todaySession;
  const isCheckedIn = Boolean(todaySession && todaySession.dutyIn && !todaySession.dutyOut);
  const isCompleted = Boolean(todaySession && todaySession.dutyIn && todaySession.dutyOut);
  const nextPunchType = isCheckedIn ? 'DUTY_OUT' : 'DUTY_IN';

  // 2. Camera Stream Lifecycle
  function stopStream() {
    isScanningActiveRef.current = false;
    processingRef.current = false;

    if (scanLoopRef.current) {
      clearTimeout(scanLoopRef.current);
      scanLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera(facing = cameraFacing) {
    stopStream();
    setScannerFeedback('Opening camera...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      isScanningActiveRef.current = true;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = async () => {
          try {
            await videoRef.current.play();
            setScannerFeedback('Loading facial recognition models...');
            await loadFaceModels();
            setScannerFeedback('Position your face inside the circle.');
            runScanCycle();
          } catch (playErr) {
            console.error('Video play/model error:', playErr);
          }
        };
      }
    } catch (err) {
      setScannerFeedback('Camera access denied or unavailable: ' + (err?.message || 'Error'));
    }
  }

  function toggleCamera() {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user';
    setCameraFacing(nextFacing);
    startCamera(nextFacing);
  }

  // 3. Robust Scanning Loop with Real-Time Feedback
  function runScanCycle() {
    if (!isScanningActiveRef.current) return;

    scanLoopRef.current = setTimeout(async () => {
      if (!isScanningActiveRef.current) return;

      const video = videoRef.current;
      if (!video || video.paused || video.ended || processingRef.current) {
        runScanCycle();
        return;
      }

      // Check if video is actually streaming frames
      if (video.readyState < 2 || video.videoWidth === 0) {
        runScanCycle();
        return;
      }

      try {
        const detection = await detectFaceForEnrolment(video);

        if (detection?.status === 'SUCCESS' && detection.descriptor) {
          // Face detected! Perform punch
          setScannerFeedback('Face detected! Verifying...');
          await handlePunchWithFace(detection.descriptor);
          return;
        } else if (detection?.status === 'TOO_FAR') {
          setScannerFeedback('Please move a little closer to the camera.');
        } else if (detection?.status === 'MULTIPLE_FACES') {
          setScannerFeedback('Only 1 person allowed in camera view.');
        } else {
          setScannerFeedback('Looking for your face... Hold still in good light.');
        }
      } catch (scanErr) {
        // Continue scanning cycle
      }

      runScanCycle();
    }, 400);
  }

  // Manual Trigger: User taps "Capture Face & Clock IN/OUT"
  async function handleManualCapture() {
    if (processingRef.current) return;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) {
      setScannerFeedback('Camera is not ready yet.');
      return;
    }

    setScannerFeedback('Capturing face image...');
    setIsProcessing(true);
    processingRef.current = true;

    try {
      const detection = await detectFaceForEnrolment(video);
      if (detection?.status === 'SUCCESS' && detection.descriptor) {
        await handlePunchWithFace(detection.descriptor);
      } else {
        setScannerFeedback(detection?.message || 'No clear face found. Please face the camera and try again.');
        processingRef.current = false;
        setIsProcessing(false);
        runScanCycle();
      }
    } catch (e) {
      setScannerFeedback('Failed to capture face: ' + (e.message || 'Error'));
      processingRef.current = false;
      setIsProcessing(false);
      runScanCycle();
    }
  }

  // 4. Submit Punch to Backend
  async function handlePunchWithFace(descriptorArray) {
    if (processingRef.current && !isProcessing) {
      return;
    }
    processingRef.current = true;
    setIsProcessing(true);
    isScanningActiveRef.current = false; // pause background loop during submit

    setScannerFeedback('Face detected! Getting your GPS location...');

    try {
      let location = null;
      try {
        location = await captureLocation({ timeoutMs: 2000, preferCache: true });
      } catch (locErr) {
        console.warn('Location capture error (proceeding):', locErr);
      }

      setScannerFeedback('Verifying biometrics and marking attendance...');

      const payload = {
        eventType: nextPunchType,
        punchType: nextPunchType,
        liveDescriptor: Array.from(descriptorArray),
        faceDescriptor: Array.from(descriptorArray),
        location: location || undefined,
      };

      const res = await api('/attendance/worker/punch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      playChime(true);
      setPunchNotice(
        res?.message || (nextPunchType === 'DUTY_IN' ? 'Checked in successfully! Have a great day.' : 'Checked out successfully! Have a good rest.')
      );
      stopStream();
      setShowScanner(false);
      setIsProcessing(false);
      await loadProfile();
    } catch (err) {
      playChime(false);
      const isGeofence = err?.message && (err.message.includes('boundary') || err.message.includes('Location access') || err.message.includes('GPS'));
      setScannerFeedback(err?.message || 'Face verification failed. Please try again.');
      // Keep scanner open for retry
      setTimeout(() => {
        processingRef.current = false;
        setIsProcessing(false);
        isScanningActiveRef.current = true;
        setScannerFeedback('Position your face inside the circle.');
        runScanCycle();
      }, isGeofence ? 4500 : 2500);
    }
  }

  function openScannerModal() {
    setPunchNotice('');
    setShowScanner(true);
    setIsProcessing(false);
    processingRef.current = false;
    setTimeout(() => {
      startCamera(cameraFacing);
    }, 150);
  }

  function closeScannerModal() {
    stopStream();
    setShowScanner(false);
    setIsProcessing(false);
    processingRef.current = false;
  }

  // Formatting helpers
  const worker = profileData?.worker || user;
  const deployment = profileData?.deployment;
  const recentSessions = profileData?.recentSessions || [];

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Top Mobile Bar */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-lg text-white font-black shadow-xs">
              P
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Self Attendance</p>
              <h1 className="text-sm font-extrabold text-slate-900 leading-none">Poultry Portal</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-lg px-4 pt-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Spinner className="h-8 w-8 text-emerald-600" />
            <p className="mt-3 text-xs font-bold text-slate-500">Loading your profile...</p>
          </div>
        ) : error ? (
          <div className="py-6">
            <Alert variant="danger">{error}</Alert>
            <button
              type="button"
              onClick={loadProfile}
              className="mt-3 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-white shadow-xs"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {worker.isSupervisor && <SupervisorAttendancePanel />}
            {punchNotice && (
              <Alert variant="success" className="animate-fade-in shadow-xs">
                {punchNotice}
              </Alert>
            )}

            {/* Worker Identity Card */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <div className="flex items-start justify-between">
                <div>
                  <span className="inline-block rounded-lg bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wider text-emerald-700 border border-emerald-100">
                    {worker?.workerCode || 'Worker'}
                  </span>
                  <h2 className="mt-2 text-xl font-black text-slate-900 leading-tight">
                    {worker?.fullName || worker?.name}
                  </h2>
                  <p className="text-xs font-semibold text-slate-500">
                    {worker?.mobileNumber ? `+91 ${worker.mobileNumber}` : 'Personal Phone'}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl font-black text-slate-600">
                  {worker?.fullName ? worker.fullName.charAt(0).toUpperCase() : 'W'}
                </div>
              </div>

              {/* Deployment Info */}
              <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 text-xs space-y-1.5 border border-slate-100">
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400">Assigned Location:</span>
                  <span className="font-bold text-slate-700">
                    {deployment?.workLocationName || deployment?.farmId?.name || 'Assigned Farm'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-slate-400">Designation / Role:</span>
                  <span className="font-bold text-slate-700">{worker?.roleTitle || deployment?.designationName || 'Worker'}</span>
                </div>
              </div>
            </div>

            {/* Today's Punch Action Card */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Today's Status</span>

              <div className="mt-2">
                {isCompleted ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700">
                    <span className="h-2 w-2 rounded-full bg-slate-500" />
                    Completed for Today
                  </div>
                ) : isCheckedIn ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-1.5 text-xs font-black text-emerald-800">
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                    Clocked IN (Duty Active)
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-4 py-1.5 text-xs font-bold text-amber-700 border border-amber-200">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Not Clocked IN Yet
                  </div>
                )}
              </div>

              {/* Duty IN / OUT Times if available */}
              {todaySession && (
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-left border border-slate-100">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">Duty IN</span>
                    <p className="font-bold text-slate-800 text-sm">
                      {todaySession.dutyIn
                        ? new Date(todaySession.dutyIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400">Duty OUT</span>
                    <p className="font-bold text-slate-800 text-sm">
                      {todaySession.dutyOut
                        ? new Date(todaySession.dutyOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                        : isCheckedIn ? 'Working...' : '—'}
                    </p>
                  </div>
                </div>
              )}

              {/* Big Action Button */}
              {isCompleted ? (
                <p className="mt-4 text-xs font-semibold text-slate-500">
                  Your work for today has been logged ({todaySession?.workedHoursFormatted}). Have a good rest!
                </p>
              ) : (
                <button
                  type="button"
                  onClick={openScannerModal}
                  className={`mt-4 w-full rounded-2xl py-4 text-base font-black text-white shadow-md transition active:scale-[0.98] ${
                    isCheckedIn
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/20'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xl">📷</span>
                    <span>{isCheckedIn ? 'Scan Face to Clock OUT' : 'Scan Face to Clock IN'}</span>
                  </div>
                </button>
              )}
            </div>

            {/* Recent 7-Day History Card */}
            <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                My Recent Attendance (Last 7 Days)
              </h2>

              {recentSessions.length === 0 ? (
                <p className="mt-3 text-center text-xs text-slate-400 py-4">No attendance history recorded yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100">
                  {recentSessions.map((s) => (
                    <div key={s._id} className="flex items-center justify-between py-3 text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{s.date}</p>
                        <p className="text-[11px] font-medium text-slate-400">
                          {s.dutyIn
                            ? `${new Date(s.dutyIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} → `
                            : ''}
                          {s.dutyOut
                            ? new Date(s.dutyOut).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
                            : s.dutyIn ? 'In Progress' : 'Absent'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                            s.status === 'PRESENT'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : s.status === 'HALF_DAY'
                              ? 'bg-amber-50 text-amber-700 border border-amber-100'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {s.status}
                        </span>
                        {s.workedHoursFormatted && (
                          <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{s.workedHoursFormatted}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Face Scanner Modal */}
      {showScanner && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs cursor-pointer"
          onMouseDown={closeScannerModal}
        >
          <div
            className="relative w-full max-w-sm rounded-3xl bg-slate-900 p-5 text-white shadow-2xl cursor-default"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold">Self Face Verification</h3>
                <p className="text-[11px] text-slate-400">
                  {nextPunchType === 'DUTY_IN' ? 'Marking Duty IN' : 'Marking Duty OUT'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeScannerModal}
                className="h-8 w-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Video Viewport */}
            <div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-black border-2 border-emerald-500/50 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`h-full w-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
              />

              {/* Scanning Target Box Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-48 w-48 rounded-full border-2 border-dashed border-emerald-400/80 animate-pulse" />
              </div>

              {/* Busy Indicator */}
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs">
                  <Spinner className="h-9 w-9 text-emerald-400" />
                  <p className="mt-2 text-xs font-bold text-white">Verifying Biometrics & GPS...</p>
                </div>
              )}
            </div>

            {/* Live Feedback Status */}
            <div className="mt-3 rounded-xl bg-slate-800/80 p-3 text-center border border-slate-700/50">
              <p className="text-xs font-bold text-emerald-400">{scannerFeedback}</p>
            </div>

            {/* Tap to Punch Action Button */}
            <button
              type="button"
              onClick={handleManualCapture}
              disabled={isProcessing}
              className={`mt-3 w-full rounded-2xl py-3.5 text-sm font-black text-white shadow-lg transition active:scale-[0.98] ${
                isCheckedIn
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <span>⚡</span>
                <span>{isCheckedIn ? 'Tap to Capture & Clock OUT' : 'Tap to Capture & Clock IN'}</span>
              </div>
            </button>

            {/* Modal Controls */}
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={toggleCamera}
                disabled={isProcessing}
                className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                🔄 Flip Camera
              </button>
              <button
                type="button"
                onClick={closeScannerModal}
                disabled={isProcessing}
                className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
