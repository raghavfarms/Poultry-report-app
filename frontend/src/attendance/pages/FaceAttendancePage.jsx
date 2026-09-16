import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';
import { attendancePath, fetchFirmFaceDescriptors, recordAttendanceEvent } from '../services/adminApi.js';
import { loadFaceModels, detectAndRecognizeFaces } from '../services/faceModelLoader.js';
import { captureLocation } from '../services/captureLocation.js';
import TransferModal from '../components/TransferModal.jsx';

// Subtle audio feedback using Web Audio API (no external asset needed)
function playBeep(type = 'success') {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.setValueAtTime(200, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // AudioContext might be blocked before user interaction; ignore silently
  }
}

export default function FaceAttendancePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryFirmId = searchParams.get('firmId') || searchParams.get('firm') || '';
  const queryDate = searchParams.get('date') || '';

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const processingRef = useRef(false);
  const lastUnknownRef = useRef(0);
  const matchConsensusRef = useRef({ workerId: null, count: 0, lastSeen: 0 });
  const nextTimeoutRef = useRef(null);

  const [firms, setFirms] = useState([]);
  const [selectedFirmId, setSelectedFirmId] = useState(queryFirmId);
  const [enrolledWorkers, setEnrolledWorkers] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  const [mode, setMode] = useState('AUTO'); // 'AUTO' | 'DUTY_IN' | 'DUTY_OUT'
  const [facingMode, setFacingMode] = useState('user');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const todayString = new Date().toISOString().split('T')[0];
  const [attendanceDate, setAttendanceDate] = useState(queryDate || todayString);
  const [statusPill, setStatusPill] = useState('Initializing Face Scanner...');
  const [activeResult, setActiveResult] = useState(null); // { type: 'SUCCESS' | 'DUPLICATE' | 'ERROR', data, message }
  const [locationStatus, setLocationStatus] = useState('IDLE'); // 'CAPTURED' | 'DENIED' | 'UNAVAILABLE'
  const [showTransferModal, setShowTransferModal] = useState(false);

  // 1. Determine firms available to user
  useEffect(() => {
    api(attendancePath('firms'))
      .then(({ firms: list = [] }) => {
        setFirms(list);
        if (queryFirmId && list.some((f) => String(f._id || f) === String(queryFirmId))) {
          setSelectedFirmId(queryFirmId);
        } else if (list[0]) {
          setSelectedFirmId(list[0]._id || list[0]);
        }
      })
      .catch(() => {
        const fallback = user?.firms || [];
        setFirms(fallback);
        if (queryFirmId && fallback.some((f) => String(f._id || f) === String(queryFirmId))) {
          setSelectedFirmId(queryFirmId);
        } else if (fallback[0]) {
          setSelectedFirmId(fallback[0]._id || fallback[0]);
        }
      });
  }, [user, queryFirmId]);

  // 2. Load face descriptors whenever firm changes
  useEffect(() => {
    if (!selectedFirmId) return;

    let mounted = true;
    async function loadDescriptors() {
      setLoadingWorkers(true);
      setEnrolledWorkers([]);
      try {
        const res = await fetchFirmFaceDescriptors(selectedFirmId);
        if (mounted) {
          setEnrolledWorkers(res.descriptors || []);
          setStatusPill(`Loaded ${res.total || 0} enrolled faces for this firm.`);
        }
      } catch (err) {
        console.error('Failed to load descriptors:', err);
        if (mounted) setStatusPill('Could not sync face profiles. Check connection.');
      } finally {
        if (mounted) setLoadingWorkers(false);
      }
    }

    loadDescriptors();
    return () => {
      mounted = false;
    };
  }, [selectedFirmId]);

  // 3. Start Camera and Face Detection Loop
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setStatusPill('Loading neural vision models...');
        await loadFaceModels();
        if (!mounted) return;
        await startCamera(facingMode);
      } catch (err) {
        if (!mounted) return;
        setCameraError(err.message || 'Failed to initialize models.');
      }
    }

    init();

    return () => {
      mounted = false;
      stopCamera();
      if (loopRef.current) cancelAnimationFrame(loopRef.current);
      if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
    };
  }, []);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }

  async function startCamera(mode) {
    stopCamera();
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setCameraActive(true);
          setStatusPill('Ready · Scanning face...');
        };
      }
    } catch (err) {
      console.error('Camera access failed:', err);
      setCameraError('Camera access required for face attendance. Please enable camera in browser settings.');
    }
  }

  function toggleCamera() {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  }

  // Controlled transition: Resume scanner for the next worker
  function handleNextWorker() {
    if (nextTimeoutRef.current) {
      clearTimeout(nextTimeoutRef.current);
      nextTimeoutRef.current = null;
    }
    matchConsensusRef.current = { workerId: null, count: 0, lastSeen: 0 };
    lastUnknownRef.current = Date.now();
    setActiveResult(null);
    setStatusPill('Ready · Scanning face...');
    processingRef.current = false;
  }

  // Handle detected face that is not registered/enrolled
  function handleUnknownFace() {
    const now = Date.now();
    if (now - lastUnknownRef.current < 3500 || processingRef.current) return;
    lastUnknownRef.current = now;
    processingRef.current = true;
    playBeep('error');
    setActiveResult({
      type: 'UNKNOWN',
      title: 'UNKNOWN',
      message: 'No matching face found. Face the camera in good light and check that the correct firm is selected.',
    });
    setStatusPill('⚠️ Face not matched · Tap Try Again / Next Person');
  }

  // Continuous scanner recognition loop
  useEffect(() => {
    if (!cameraActive || loadingWorkers || enrolledWorkers.length === 0) return;
    let cancelled = false;
    let lastScanTime = 0;

    async function scan(timestamp) {
      if (cancelled) return;
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        loopRef.current = requestAnimationFrame(scan);
        return;
      }

      // Scan every 250ms if not actively submitting an attendance transaction, no modal, and no active result
      if (timestamp - lastScanTime > 250 && !processingRef.current && !activeResult && !showTransferModal) {
        lastScanTime = timestamp;

        try {
          const { faces, bestMatch } = await detectAndRecognizeFaces(
            videoRef.current,
            enrolledWorkers,
            0.42
          );
          // Discard frames from an old firm, date, mode, or stopped camera.
          if (cancelled) return;

          if (faces.length === 0) {
            matchConsensusRef.current = { workerId: null, count: 0, lastSeen: 0 };
            if (!activeResult) setStatusPill('Position face in camera view');
          } else if (bestMatch) {
            const now = Date.now();
            const candidateWorkerId = String(bestMatch.worker.workerId);

            // Multi-frame consensus: require 2 consecutive frames of the same worker within 1200ms
            if (
              matchConsensusRef.current.workerId === candidateWorkerId &&
              now - matchConsensusRef.current.lastSeen < 1200
            ) {
              matchConsensusRef.current.count += 1;
              matchConsensusRef.current.lastSeen = now;
            } else {
              matchConsensusRef.current = {
                workerId: candidateWorkerId,
                count: 1,
                lastSeen: now,
              };
            }

            if (matchConsensusRef.current.count >= 2) {
              // Confirmed genuine match across multiple frames!
              matchConsensusRef.current = { workerId: null, count: 0, lastSeen: 0 };
              await handleRecognizedWorker(bestMatch.worker);
            } else {
              setStatusPill(`Verifying: ${bestMatch.worker.fullName}... hold still`);
            }
          } else {
            // Face detected but distance > 0.42 (Not matched to any registered worker)
            matchConsensusRef.current = { workerId: null, count: 0, lastSeen: 0 };
            handleUnknownFace();
          }
        } catch (e) {
          // Catch frame errors gracefully
        }
      }

      if (!cancelled) loopRef.current = requestAnimationFrame(scan);
    }

    loopRef.current = requestAnimationFrame(scan);
    return () => {
      cancelled = true;
      cancelAnimationFrame(loopRef.current);
    };
  }, [cameraActive, loadingWorkers, enrolledWorkers, selectedFirmId, attendanceDate, mode, activeResult, showTransferModal]);

  // Handle recognized worker: capture location and post to backend attendance service
  async function handleRecognizedWorker(worker) {
    if (processingRef.current) return;
    processingRef.current = true;

    setStatusPill(`Recognized: ${worker.fullName} (${worker.workerCode})`);

    try {
      // 1. Non-blocking scan-time location capture
      let loc = null;
      try {
        loc = await captureLocation({ timeoutMs: 3500 });
        setLocationStatus(loc.status || 'CAPTURED');
      } catch (locErr) {
        setLocationStatus('UNAVAILABLE');
      }

      // 2. Call unified backend attendance service
      const payload = {
        workerId: worker.workerId,
        eventType: mode, // 'AUTO' | 'DUTY_IN' | 'DUTY_OUT'
        source: 'FACE',
        location: loc,
        date: attendanceDate,
      };

      const res = await recordAttendanceEvent(payload);

      // Play success chime!
      playBeep('success');

      setActiveResult({
        type: 'SUCCESS',
        event: res.event,
        session: res.session,
        workedDuration: res.workedDuration,
        workerId: res.event?.workerId || worker.workerId || worker._id,
        workerName: res.event?.workerNameSnapshot || worker.fullName,
        workerCode: res.event?.workerCodeSnapshot || worker.workerCode,
        message: res.message,
      });

      // Pause scanning: user/operator presses "Next Person" (never auto-resumes until clicked)
      if (nextTimeoutRef.current) {
        clearTimeout(nextTimeoutRef.current);
        nextTimeoutRef.current = null;
      }
    } catch (err) {
      playBeep('error');
      console.warn('Attendance scan error:', err);

      const isDuplicate =
        err.message &&
        (err.message.toLowerCase().includes('duplicate') ||
          err.message.toLowerCase().includes('2 times not allowed') ||
          err.message.toLowerCase().includes('already marked') ||
          err.message.toLowerCase().includes('already checked') ||
          err.message.toLowerCase().includes('already completed'));
      setActiveResult({
        type: isDuplicate ? 'DUPLICATE' : 'ERROR',
        workerName: worker.fullName,
        workerCode: worker.workerCode,
        workerId: worker.workerId || worker._id,
        worker: worker,
        message: err.message || 'Unable to record attendance.',
      });

      // Keep warning card displayed until operator explicitly clicks Continue / Next Person
      if (nextTimeoutRef.current) {
        clearTimeout(nextTimeoutRef.current);
        nextTimeoutRef.current = null;
      }
    }
  }

  return (
    <div className="attendance-page attendance-scanner relative flex min-h-screen flex-col bg-slate-950 text-white font-sans">
      {/* Top Navbar */}
      <header className="flex items-center justify-between gap-1.5 border-b border-slate-800 bg-slate-900/95 px-2.5 py-2 sm:px-4 sm:py-3 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/reports/attendance'))}
            className="flex min-h-[36px] sm:min-h-[42px] items-center rounded-xl border border-slate-700 bg-slate-800 px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition shrink-0 cursor-pointer"
          >
            ← <span className="hidden xs:inline ml-1">Exit Scanner</span><span className="xs:hidden ml-1">Exit</span>
          </button>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-wide uppercase text-emerald-400 truncate">
              Face Attendance
            </h1>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate hidden xs:block">Raghav Farms Live Scanner</p>
          </div>
        </div>

        {/* Firm selector & Location badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {firms.length > 1 && (
            <select
              value={selectedFirmId}
              onChange={(e) => setSelectedFirmId(e.target.value)}
              className="min-h-[34px] sm:min-h-[38px] rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white cursor-pointer max-w-[110px] sm:max-w-[160px] truncate"
            >
              {firms.map((f) => (
                <option key={f._id || f} value={f._id || f}>
                  {f.name || f}
                </option>
              ))}
            </select>
          )}

          <div
            title={`Scan Location Status: ${locationStatus}`}
            className="flex min-h-[34px] sm:min-h-[38px] items-center gap-1.5 rounded-lg bg-slate-800 px-2 sm:px-2.5 py-1 text-[11px] font-medium"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                locationStatus === 'CAPTURED'
                  ? 'bg-emerald-400'
                  : locationStatus === 'DENIED'
                  ? 'bg-amber-400'
                  : 'bg-slate-400'
              }`}
            />
            <span className="hidden sm:inline text-slate-300">
              {locationStatus === 'CAPTURED' ? 'GPS Active' : 'GPS Optional'}
            </span>
          </div>
        </div>
      </header>

      {/* Attendance Date / Test Mode Selector */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 sm:px-6 py-1.5 sm:py-2 bg-slate-950/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <label
            htmlFor="scanner-attendance-date"
            onClick={() => {
              try { document.getElementById('scanner-attendance-date')?.showPicker(); } catch {}
            }}
            className="text-slate-400 font-semibold text-[11px] flex items-center gap-1 cursor-pointer hover:text-slate-300 select-none shrink-0"
          >
            <span>📅</span>
            <span className="hidden xs:inline">Date:</span>
          </label>
          <input
            id="scanner-attendance-date"
            type="date"
            value={attendanceDate}
            onChange={(e) => setAttendanceDate(e.target.value)}
            onClick={(e) => {
              try { e.target.showPicker(); } catch {}
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                try { e.target.showPicker(); } catch {}
              }
            }}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-bold text-white focus:border-emerald-500 focus:outline-none cursor-pointer [color-scheme:dark]"
          />
          {attendanceDate !== todayString && (
            <button
              type="button"
              onClick={() => setAttendanceDate(todayString)}
              className="rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-600 px-2 py-1 text-[10px] sm:text-[11px] font-medium text-slate-300 transition cursor-pointer whitespace-nowrap"
            >
              Today
            </button>
          )}
          {/* Transfer Worker Button - Just Adjacent to Date */}
          <button
            type="button"
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-1 rounded-lg border border-cyan-500/50 bg-cyan-950/70 hover:bg-cyan-900/90 active:scale-95 px-2 sm:px-2.5 py-1 text-[11px] font-bold text-cyan-300 hover:text-cyan-100 transition shadow-sm cursor-pointer whitespace-nowrap"
            title="Transfer worker to another shed or farm"
          >
            <span className="text-xs">⇄</span>
            <span>Transfer</span>
          </button>
        </div>

        {attendanceDate !== todayString ? (
          <div className="flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-500/40 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-[11px] font-bold text-amber-300 animate-pulse">
            <span>⚡ Test Date:</span>
            <span className="font-mono underline">{attendanceDate}</span>
            <span className="font-normal text-amber-200/80 hidden md:inline">(Scans mark attendance for this date)</span>
          </div>
        ) : (
          <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
            Live Mode · {todayString}
          </span>
        )}
      </div>

      {/* Mode Selector Tabs - Mobile Responsive Grid */}
      <div className="w-full bg-slate-900/70 px-2 py-1.5 sm:py-2 border-b border-slate-800/60 flex justify-center">
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 w-full max-w-2xl rounded-xl bg-slate-800 p-1">
          {[
            { id: 'AUTO', icon: '⚡', short: 'Auto', full: 'Auto' },
            { id: 'LUNCH', icon: '🍱', short: 'Lunch', full: 'Lunch' },
            { id: 'DUTY_IN', icon: '🟢', short: 'IN', full: 'Duty IN' },
            { id: 'DUTY_OUT', icon: '🔴', short: 'OUT', full: 'Duty OUT' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setMode(item.id)}
              className={`flex min-h-[36px] sm:min-h-[42px] min-w-0 items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-1 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold transition text-center cursor-pointer whitespace-nowrap ${
                mode === item.id
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <span className="shrink-0 text-xs sm:text-sm">{item.icon}</span>
              <span className="sm:hidden">{item.short}</span>
              <span className="hidden sm:inline">{item.full}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Scanner Viewport */}
      <main className="relative flex flex-1 flex-col items-center justify-center p-3 sm:p-5 overflow-hidden">
        {cameraError ? (
          <div className="max-w-md rounded-2xl border border-red-500/30 bg-red-950/40 p-6 text-center backdrop-blur-md">
            <span className="text-3xl">📷</span>
            <h2 className="mt-2 text-base font-bold text-red-200">Camera Permission Required</h2>
            <p className="mt-1 text-xs text-red-300">{cameraError}</p>
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="mt-4 flex min-h-[44px] items-center justify-center rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-500"
            >
              Retry Camera
            </button>
          </div>
        ) : (
          <div className="relative flex aspect-3/4 max-h-[58vh] sm:max-h-[68vh] w-full max-w-sm items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-800 bg-slate-900 shadow-2xl">
            {/* Live Video Feed */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
            />

            {/* Oval Alignment Frame */}
            <div className="pointer-events-none absolute h-56 sm:h-64 w-44 sm:w-48 rounded-[50%] border-2 border-dashed border-emerald-400/60 shadow-[0_0_25px_rgba(16,185,129,0.15)]" />

            {/* Switch Camera Button */}
            <button
              type="button"
              onClick={toggleCamera}
              title="Flip Camera"
              className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900/70 text-white backdrop-blur-md hover:bg-slate-900"
            >
              🔄
            </button>

            {/* Enrolled profiles counter badge */}
            <div className="absolute top-4 left-4 rounded-lg bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 backdrop-blur-md">
              {loadingWorkers ? 'Loading faces...' : `${enrolledWorkers.length} Enrolled`}
            </div>

            {/* Status notification pill */}
            {!activeResult && (
              <div className="absolute bottom-4 inset-x-4 rounded-xl bg-slate-900/85 px-3 py-2 text-center text-xs font-semibold text-emerald-300 backdrop-blur-md shadow-lg border border-slate-700/50">
                {statusPill}
              </div>
            )}

            {/* Instant Confirmation Card Overlay */}
            {activeResult && activeResult.type === 'SUCCESS' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/85 p-6 text-center backdrop-blur-sm animate-fade-in">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl text-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.4)]">
                  ✓
                </div>
                <h2 className="mt-3 text-xl font-bold text-white">
                  {activeResult.event?.workerNameSnapshot}
                </h2>
                <p className="text-xs font-mono text-emerald-400">
                  {activeResult.event?.workerCodeSnapshot}
                </p>
                <div className="mt-1 flex items-center justify-center gap-2 text-[11px] font-medium text-emerald-300">
                  <span>📅 Date: {activeResult.event?.attendanceDate || attendanceDate}</span>
                </div>

                <div className="mt-3 rounded-xl bg-slate-800/80 px-4 py-2 text-xs text-slate-300 border border-slate-700">
                  <p className="font-semibold text-white">
                    {activeResult.event?.workLocationNameSnapshot}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {activeResult.event?.designationNameSnapshot}
                  </p>
                </div>

                <div
                  className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white shadow-lg ${
                    activeResult.event?.eventType === 'LUNCH_OUT'
                      ? 'bg-amber-600'
                      : activeResult.event?.eventType === 'LUNCH_IN'
                      ? 'bg-teal-600'
                      : activeResult.event?.eventType === 'DUTY_IN'
                      ? 'bg-emerald-600'
                      : 'bg-indigo-600'
                  }`}
                >
                  <span>
                    {activeResult.event?.eventType === 'DUTY_IN'
                      ? '☀️ DUTY IN'
                      : activeResult.event?.eventType === 'LUNCH_OUT'
                      ? '🍱 LUNCH OUT (Break)'
                      : activeResult.event?.eventType === 'LUNCH_IN'
                      ? '🍱 LUNCH IN (Returned)'
                      : '🌙 DUTY OUT'}
                  </span>
                  <span className="text-white/80">
                    {activeResult.event?.timestamp ? new Intl.DateTimeFormat('en-IN', {
                      timeStyle: 'short',
                      timeZone: 'Asia/Kolkata',
                    }).format(new Date(activeResult.event.timestamp)) : ''}
                  </span>
                </div>

                {activeResult.workedDuration && (
                  <p className="mt-2 text-xs font-semibold text-emerald-300">
                    {activeResult.event?.eventType === 'LUNCH_IN'
                      ? `Lunch Break: ${activeResult.workedDuration}`
                      : `Worked: ${activeResult.workedDuration}`}
                  </p>
                )}

                {/* Controlled Next Worker Button */}
                <button
                  type="button"
                  onClick={handleNextWorker}
                  className="mt-4 w-full max-w-xs inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] py-2.5 sm:py-3 px-5 text-xs sm:text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/30 transition cursor-pointer"
                >
                  <span>➡️</span>
                  <span>Next Person / Scan Next</span>
                </button>
              </div>
            )}

            {/* UNKNOWN Face Warning Card Overlay */}
            {activeResult && activeResult.type === 'UNKNOWN' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center backdrop-blur-md animate-fade-in">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-3xl text-red-400 border-2 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.4)]">
                  ❓
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-wider uppercase text-red-400">
                  UNKNOWN
                </h2>
                <p className="mt-1 text-xs font-bold text-slate-200 uppercase tracking-wide">
                  Face Not Registered
                </p>
                <div className="mt-3 rounded-xl bg-red-950/50 px-3.5 py-2 text-xs text-red-200 border border-red-500/30 max-w-xs">
                  {activeResult.message}
                </div>
                <button
                  type="button"
                  onClick={handleNextWorker}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/40 bg-red-900/60 hover:bg-red-800 px-4 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <span>🔄</span>
                  <span>Try Again / Next Person</span>
                </button>
              </div>
            )}

            {/* Duplicate / 2 Times Not Allowed Overlay */}
            {activeResult && activeResult.type === 'DUPLICATE' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center backdrop-blur-md animate-fade-in">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20 text-3xl text-amber-400 border-2 border-amber-500/50 shadow-[0_0_30px_rgba(245,158,11,0.4)]">
                  ⚠️
                </div>
                <h2 className="mt-3 text-lg font-black uppercase tracking-wide text-amber-400">
                  2 Times Not Allowed
                </h2>
                <p className="mt-1 text-base font-bold text-white">
                  {activeResult.workerName}
                </p>
                {activeResult.workerCode && (
                  <p className="text-xs font-mono text-amber-300">{activeResult.workerCode}</p>
                )}
                <div className="mt-3 rounded-xl bg-amber-950/50 px-3.5 py-2.5 text-xs text-amber-200 border border-amber-500/30 max-w-xs leading-relaxed font-medium">
                  {activeResult.message}
                </div>
                <button
                  type="button"
                  onClick={handleNextWorker}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 px-4 py-2 text-xs font-bold text-slate-950 shadow transition cursor-pointer"
                >
                  <span>➡️</span>
                  <span>Continue / Next Person</span>
                </button>
              </div>
            )}

            {/* General Error Overlay */}
            {activeResult && activeResult.type === 'ERROR' && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center backdrop-blur-sm">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-3xl text-red-400">
                  ✕
                </div>
                <h2 className="mt-3 text-base font-bold text-white">
                  {activeResult.workerName || 'Attention'}
                </h2>
                {activeResult.workerCode && (
                  <p className="text-xs font-mono text-slate-400">{activeResult.workerCode}</p>
                )}
                <p className="mt-3 text-xs text-red-300 max-w-xs">{activeResult.message}</p>
                <button
                  type="button"
                  onClick={handleNextWorker}
                  className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                >
                  <span>🔄</span>
                  <span>Continue / Next</span>
                </button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Worker Transfer Modal */}
      {showTransferModal && (
        <TransferModal
          firms={firms}
          firmId={selectedFirmId}
          defaultDate={attendanceDate}
          fallbackWorkers={enrolledWorkers}
          worker={
            activeResult?.workerId || activeResult?.event?.workerId
              ? {
                  _id: activeResult.workerId || activeResult.event?.workerId,
                  fullName: activeResult.workerName || activeResult.event?.workerNameSnapshot,
                  workerCode: activeResult.workerCode || activeResult.event?.workerCodeSnapshot,
                  firm: selectedFirmId,
                }
              : null
          }
          currentDeployment={
            activeResult?.workLocationId || activeResult?.event?.workLocationIdSnapshot
              ? {
                  workLocation: activeResult.workLocationId || activeResult.event?.workLocationIdSnapshot,
                  workLocationNameSnapshot: activeResult.workLocationName || activeResult.event?.workLocationNameSnapshot,
                  firmNameSnapshot: firms.find((f) => String(f._id || f) === String(selectedFirmId))?.name || '',
                }
              : null
          }
          onClose={() => setShowTransferModal(false)}
          onSuccess={(msg) => {
            setShowTransferModal(false);
            setStatusPill(`✓ ${msg}`);
            if (selectedFirmId) {
              fetchFirmFaceDescriptors(selectedFirmId)
                .then((res) => {
                  setEnrolledWorkers(res.descriptors || []);
                })
                .catch(() => {});
            }
          }}
        />
      )}

      {/* Bottom Footer Info */}
      <footer className="border-t border-slate-900 bg-slate-950 px-4 py-2 text-center text-[11px] text-slate-500">
        Hands-free continuous recognition · Raghav Farms Poultry Attendance Module
      </footer>
    </div>
  );
}
