import { useState, useEffect, useMemo, useRef } from 'react';
import { getDailyEvaluationMatrix, submitDailyEvaluation, setWorkerBaselineGrade } from '../services/performanceApi.js';
import { Spinner, Alert, primaryButton, secondaryButton } from '../../components/Ui.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function getYesterdayIST() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

// Helpers: Detect non-shed general roles (Driver, Night Guard) and shed-only questions
function isDriverOrNightGuard(designationName) {
  const d = (designationName || '').toLowerCase();
  return (
    d.includes('driver') ||
    d.includes('ड्राइवर') ||
    d.includes('night') ||
    d.includes('नाईट') ||
    d.includes('security') ||
    d.includes('सिक्योरिटी') ||
    d.includes('guard') ||
    d.includes('गार्ड')
  );
}

function isNonApplicableForDriverOrNight(q) {
  const text = q?.questionText || q?.questionTextSnapshot || '';
  return text.includes('लंच') ||
         text.includes('दाना') ||
         text.includes('AI') ||
         text.includes('अंडा');
}

export default function DailyEvaluationTab({ firms, selectedFirmId, onFirmChange, refreshKey }) {
  const { user } = useAuth();
  const userRole = String(user?.role?.name || user?.role || '').toLowerCase();
  const isAdmin = ['admin', 'developer', 'superadmin'].includes(userRole);

  // Default date is Yesterday so incharge evaluates finalized Day & Night shifts with zero manual clicks
  const [date, setDate] = useState(getYesterdayIST());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Admin Baseline / Last Month Grade Setting Modal state
  const [gradeModal, setGradeModal] = useState({
    isOpen: false,
    worker: null,
    selectedGrade: 'A',
    saving: false,
  });

  const handleOpenGradeModal = (worker) => {
    if (!isAdmin) return;
    setGradeModal({
      isOpen: true,
      worker,
      selectedGrade: worker.lastMonthGrade || 'B',
      saving: false,
    });
  };

  const handleSaveBaselineGrade = async () => {
    if (!gradeModal.worker) return;
    setGradeModal((prev) => ({ ...prev, saving: true }));
    try {
      await setWorkerBaselineGrade({
        workerId: gradeModal.worker.workerId,
        firmId: selectedFirmId,
        grade: gradeModal.selectedGrade,
      });

      // Update worker's lastMonthGrade in local state instantly
      setData((prev) => {
        if (!prev || !prev.workers) return prev;
        const updateList = (list) =>
          (list || []).map((w) =>
            w.workerId === gradeModal.worker.workerId
              ? { ...w, lastMonthGrade: gradeModal.selectedGrade }
              : w
          );
        return {
          ...prev,
          workers: {
            ...prev.workers,
            present: updateList(prev.workers.present),
            halfDay: updateList(prev.workers.halfDay),
            absent: updateList(prev.workers.absent),
          },
        };
      });

      setSuccess(`Grade updated to Grade ${gradeModal.selectedGrade} for ${gradeModal.worker.workerName}!`);
      setGradeModal({ isOpen: false, worker: null, selectedGrade: 'A', saving: false });
    } catch (err) {
      setError(err.message || 'Failed to update worker grade.');
      setGradeModal((prev) => ({ ...prev, saving: false }));
    }
  };

  // In-memory evaluation state: { [workerId]: { [questionId]: 'YES' | 'NO' } }
  const [evalAnswers, setEvalAnswers] = useState({});

  // Horizontal Scrolling & Drag-to-Scroll Support for Laptop / Phone / Desktop Mouse
  const tableContainerRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragScrollLeft, setDragScrollLeft] = useState(0);

  // Convert mouse vertical wheel to smooth horizontal scroll on worker area
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) return;
      if (el.scrollWidth > el.clientWidth) {
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const maxScroll = el.scrollWidth - el.clientWidth;
        if ((delta > 0 && el.scrollLeft < maxScroll) || (delta < 0 && el.scrollLeft > 0)) {
          el.scrollLeft += delta * 1.2;
          e.preventDefault();
        }
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [data]);

  // Click & Drag-to-scroll handlers
  const handleMouseDown = (e) => {
    if (['BUTTON', 'INPUT', 'SELECT', 'A'].includes(e.target.tagName)) return;
    if (!tableContainerRef.current) return;
    setIsDragging(true);
    setDragStartX(e.pageX - tableContainerRef.current.offsetLeft);
    setDragScrollLeft(tableContainerRef.current.scrollLeft);
  };

  const handleMouseMove = (e) => {
    if (!isDragging || !tableContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - tableContainerRef.current.offsetLeft;
    const walk = (x - dragStartX) * 1.5;
    tableContainerRef.current.scrollLeft = dragScrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  const scrollColumns = (direction) => {
    if (!tableContainerRef.current) return;
    const scrollAmount = direction === 'left' ? -380 : 380;
    tableContainerRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const fetchMatrix = async () => {
    if (!selectedFirmId || selectedFirmId === 'all') return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await getDailyEvaluationMatrix({ firmId: selectedFirmId, date });
      setData(res);

      // Initialize answers: default is 'YES' for all active questions
      const initial={};
      const allWorkers = [
        ...(res.workers?.present || []),
        ...(res.workers?.halfDay || []),     
        ...(res.workers?.absent || []),
      ];

      for (const w of allWorkers) {
        initial[w.workerId] = {};
        for (const q of res.questions || []) {
          const isDutyInQ = q.automatedType === 'DUTY_IN' || q.displayOrder === 1;
          const isLunchInQ = q.automatedType === 'LUNCH_IN' || q.displayOrder === 3;
          const isAutoQ = isDutyInQ || isLunchInQ;

          let autoAns = null;
          if (isDutyInQ) autoAns = w.attendancePunctuality?.dutyIn?.answer || 'NO';
          else if (isLunchInQ) autoAns = w.attendancePunctuality?.lunchIn?.answer || 'YES';

          // If already evaluated today, restore saved answer
          const savedAnswer = w.answers?.find((a) => String(a.questionId) === String(q._id))?.answer;
          // If not evaluated today, carry forward previous day's answer if available
          const carriedAnswer = w.previousAnswers?.find((a) => String(a.questionId) === String(q._id))?.answer;

          if (isAutoQ) {
            // For automated attendance questions:
            // Admin can use saved override if present, else auto punctuality
            // Non-admin (incharge/supervisor) ALWAYS gets automated punctuality
            if (isAdmin && savedAnswer !== undefined) {
              initial[w.workerId][q._id] = savedAnswer;
            } else {
              initial[w.workerId][q._id] = autoAns;
            }
          } else {
            if (savedAnswer !== undefined) {
              initial[w.workerId][q._id] = savedAnswer;
            } else if (carriedAnswer !== undefined) {
              initial[w.workerId][q._id] = carriedAnswer;
            } else {
              // First day deployment, new worker, or newly added question: default to 'YES'
              initial[w.workerId][q._id] = 'YES';
            }
          }
        }
      }
      setEvalAnswers(initial);
    } catch (err) {
      setError(err.message || 'Failed to load evaluation matrix.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [selectedFirmId, date, refreshKey]);

  // Handle single question toggle for a worker
  const handleAnswerToggle = (workerId, questionId, value) => {
    setEvalAnswers((prev) => ({
      ...prev,
      [workerId]: {
        ...(prev[workerId] || {}),
        [questionId]: value,
      },
    }));
  };

  // Set all answers for a single worker to YES (preserving automated answers for non-admins)
  const handleSetAllYes = (workerId) => {
    if (!data?.questions) return;
    const workerObj = [
      ...(data.workers?.present || []),
      ...(data.workers?.halfDay || []),
    ].find((w) => String(w.workerId) === String(workerId));

    const isDriverOrNight = isDriverOrNightGuard(workerObj?.designationName);

    setEvalAnswers((prev) => {
      const workerAns = { ...(prev[workerId] || {}) };
      for (const q of data.questions) {
        const isDutyInQ = q.automatedType === 'DUTY_IN' || q.displayOrder === 1;
        const isLunchInQ = q.automatedType === 'LUNCH_IN' || q.displayOrder === 3;
        const isAutoQ = isDutyInQ || isLunchInQ;
        const isNonApplicable = isNonApplicableForDriverOrNight(q);

        if (isDriverOrNight && isNonApplicable) {
          workerAns[q._id] = 'N/A';
          continue;
        }

        if (isAutoQ && !isAdmin) {
          // Keep automatic attendance calculation for non-admin
          if (isDutyInQ) workerAns[q._id] = workerObj?.attendancePunctuality?.dutyIn?.answer || 'NO';
          else if (isLunchInQ) workerAns[q._id] = workerObj?.attendancePunctuality?.lunchIn?.answer || 'YES';
        } else {
          workerAns[q._id] = 'YES';
        }
      }
      return { ...prev, [workerId]: workerAns };
    });
  };

  // Flattened ordered list of workers: Present -> Half Day -> Absent
  const workerGroups = useMemo(() => {
    if (!data?.workers) return [];
    return [
      { key: 'present', label: 'Present Workers ', list: data.workers.present || [], color: 'bg-emerald-600', badgeColor: 'bg-emerald-100 text-emerald-800' },
      { key: 'halfDay', label: 'Half Day Workers', list: data.workers.halfDay || [], color: 'bg-sky-600', badgeColor: 'bg-sky-100 text-sky-800' },
      { key: 'absent', label: 'Absent Workers', list: data.workers.absent || [], color: 'bg-slate-500', badgeColor: 'bg-red-100 text-red-800' },
    ];
  }, [data]);

  const evaluableWorkersCount = (data?.workers?.present?.length || 0) + (data?.workers?.halfDay?.length || 0 ) + (data?.workers?.absent?.length || 0);

  // Submit Handler
  const handleSubmit = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const allEvaluableWorkers = [
        ...(data.workers?.present || []),
        ...(data.workers?.halfDay || []),
        ...(data.workers?.absent|| []),
      ];

      const payload = allEvaluableWorkers.map((w) => {
        const answersForWorker = data.questions.map((q) => ({
          questionId: q._id,
          answer: evalAnswers[w.workerId]?.[q._id] || 'YES',
        }));

        return {
          workerId: w.workerId,
          workerCode: w.workerCode,
          workerName: w.workerName,
          attendanceStatus: w.attendanceStatus,
          answers: answersForWorker,
        };
      });

      const res = await submitDailyEvaluation({
        firmId: selectedFirmId,
        date,
        evaluations: payload,
      });

      setSuccess(`Daily evaluation successfully saved for ${res.count} workers!`);
      await fetchMatrix();
    } catch (err) {
      setError(err.message || 'Failed to submit daily evaluations.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-1.5 sm:space-y-3">
      {/* Filters & Actions Bar - Ultra-compact on mobile to bring matrix to the top */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-3 rounded-lg sm:rounded-xl border border-slate-200 bg-white p-1.5 sm:px-4 sm:py-2 shadow-xs">
        <div className="flex items-center gap-1.5 sm:gap-3">
          {/* Firm Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase">
              Firm:
            </span>
            <select
              className="h-7 sm:h-8 rounded-md sm:rounded-lg border border-slate-300 bg-white px-1 sm:px-2 text-[11px] sm:text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
              value={selectedFirmId}
              onChange={(e) => onFirmChange(e.target.value)}
            >
              {firms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div> 

          {/* Date Picker (Default: Yesterday) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase">
              Date:
            </span>
            <input
              type="date"
              className="h-7 sm:h-8 rounded-md sm:rounded-lg border border-slate-300 bg-white px-1 sm:px-2 text-[11px] sm:text-xs font-semibold text-slate-800 outline-none focus:border-emerald-600"
              value={date}
              max={getTodayIST()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        {/* Submit / Update Button */}
        <div>
          {!isAdmin && data?.isAlreadySubmitted ? (
            <span
              className="inline-flex h-7 sm:h-8 items-center rounded-md sm:rounded-lg bg-slate-100 border border-slate-300 px-2.5 sm:px-3 text-[11px] sm:text-xs font-bold text-slate-600 shadow-2xs"
              title="Ratings have already been submitted. Ratings cannot be re-submitted."
            >
              🔒 Submitted (Locked)
            </span>
          ) : (
            <button
              onClick={() => setShowConfirmModal(true)}
              disabled={loading || submitting || evaluableWorkersCount === 0}
              className="inline-flex h-7 sm:h-8 items-center justify-center rounded-md sm:rounded-lg bg-emerald-600 px-2.5 sm:px-4 text-[11px] sm:text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting
                ? 'Saving…'
                : data?.evaluatedCount > 0 && isAdmin
                ? `Update Ratings (${evaluableWorkersCount})`
                : `Submit (${evaluableWorkersCount})`}
            </button>
          )}
        </div>
      </div>

      {!isAdmin && data?.isAlreadySubmitted && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-medium text-amber-800 flex items-center gap-2">
          <span>🔒</span>
          <span>
            <strong>Ratings Already Submitted:</strong> Daily ratings for this date have already been submitted. Ratings are locked and cannot be re-submitted.
          </span>
        </div>
      )}

      {isAdmin && data?.evaluatedCount > 0 && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-medium text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>🔓</span>
            <span>
              <strong>Admin Mode:</strong> You can edit ratings and re-submit for this date anytime.
            </span>
          </div>
          <span className="text-[11px] bg-emerald-200/60 text-emerald-900 font-bold px-2 py-0.5 rounded">
            {data.evaluatedCount} Ratings Saved
          </span>
        </div>
      )}

    

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* TRANSPOSED EXCEL-STYLE MATRIX TABLE */}
      {loading ? (
        <Spinner label="Loading workers and attendance matrix…" />
      ) : !data || (data.questions?.length === 0) ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          No questions or workers found for this date.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-300 bg-white shadow-md overflow-hidden">
          {/* Scrollable table container with Mouse Wheel & Drag-to-Scroll */}
          <div
            ref={tableContainerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            className={`overflow-x-auto max-w-full touch-pan-x touch-pan-y overscroll-x-contain select-none scroll-smooth ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                {/* ROW 1: Attendance Groups Header */}
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="sticky left-0 z-30 bg-slate-100 p-2 sm:p-3 w-[130px] min-w-[125px] max-w-[140px] sm:w-[280px] sm:min-w-[280px] sm:max-w-[320px] font-black text-slate-700 uppercase tracking-wider border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-[11px] sm:text-xs">
                    Evaluation Matrix
                  </th>
                  {workerGroups.map((group) =>
                    group.list.length > 0 ? (
                      <th
                        key={group.key}
                        colSpan={group.list.length}
                        className={`text-center py-1.5 sm:py-2 px-1 sm:px-3 text-[10px] sm:text-xs font-bold text-white tracking-wide border-r border-slate-400/30 ${group.color}`}
                      >
                        {group.label} ({group.list.length})
                      </th>
                    ) : null
                  )}
                </tr>

                {/* ROW 2: Worker Names & Designation */}
                <tr className="bg-white border-b border-slate-200">
                  <th className="sticky left-0 z-30 bg-slate-50 p-2 sm:p-3 font-bold text-slate-700 border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-[11px] sm:text-xs">
                    Workers
                  </th>
                  {workerGroups.map((group) =>
                    group.list.map((w) => (
                      <th
                        key={w.workerId}
                        className="p-1 sm:p-3 w-[72px] min-w-[70px] max-w-[76px] sm:w-[160px] sm:min-w-[150px] sm:max-w-[190px] text-center border-r border-slate-200 align-top"
                      >
                        <p className="font-extrabold text-slate-900 text-[11px] sm:text-xs truncate" title={w.workerName}>
                          {w.workerName}
                        </p>
                        <p className="text-[9px] font-mono text-slate-500">{w.workerCode}</p>
                        <p className="text-[9px] text-slate-400 truncate hidden sm:block">{w.designationName}</p>
                      </th>
                    ))
                  )}
                </tr>

                {/* ROW 3: Last Month Grade */}
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px]">
                  <th className="sticky left-0 z-30 bg-slate-50/90 p-2 sm:p-3 font-semibold text-slate-600 border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-[10px] sm:text-[11px]">
                    Last Month Grade
                  </th>
                  {workerGroups.map((group) =>
                    group.list.map((w) => {
                      const grade = w.lastMonthGrade;

                      return (
                        <td key={w.workerId} className="p-1 sm:p-2 text-center border-r border-slate-200 align-middle">
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            {/* Last Month Grade Badge */}
                            {grade ? (
                              <button
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => handleOpenGradeModal(w)}
                                className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-black shadow-2xs transition ${
                                  grade === 'A'
                                    ? 'bg-emerald-600 text-white'
                                    : grade === 'B'
                                    ? 'bg-amber-400 text-slate-900'
                                    : grade === 'C'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-slate-950 text-rose-300 border border-slate-800'
                                } ${
                                  isAdmin
                                    ? 'hover:scale-105 cursor-pointer hover:ring-2 hover:ring-emerald-400'
                                    : 'cursor-default'
                                }`}
                                title={isAdmin ? `Grade ${grade} (Click to change)` : `Last Month Grade: ${grade}`}
                              >
                                {grade === 'D' ? 'D' : `Grade ${grade}`}
                                {isAdmin && <span className="ml-1 text-[8px] opacity-75">✏️</span>}
                              </button>
                            ) : isAdmin ? (
                              <button
                                type="button"
                                onClick={() => handleOpenGradeModal(w)}
                                className="inline-flex items-center rounded border border-dashed border-emerald-500 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 hover:bg-emerald-100 transition shadow-2xs cursor-pointer"
                                title="Click to set initial/last month grade"
                              >
                                + Set Grade
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">—</span>
                            )}

                            {/* All Yes action button */}
                            {group.key !== 'absent' && (
                              (w.isEvaluated || data?.isAlreadySubmitted) ? (
                                <span className="block mt-0.5 text-[8px] font-semibold text-slate-400">
                                  Locked
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleSetAllYes(w.workerId)}
                                  className="block mt-0.5 text-[8px] sm:text-[9px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                                >
                                  All Yes
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      );
                    })
                  )}
                </tr>
              </thead>

              {/* QUESTIONS AS VERTICAL ROWS */}
              <tbody className="divide-y divide-slate-200">
                {data.questions.map((q, idx) => (
                  <tr key={q._id} className="hover:bg-slate-50/60 transition">
                    {/* Fixed / Sticky Question Column - Compact on Mobile, Full Text Wrapped */}
                    <td className="sticky left-0 z-20 bg-white p-1.5 sm:p-3 w-[130px] min-w-[125px] max-w-[140px] sm:w-[280px] sm:min-w-[280px] sm:max-w-[320px] border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] align-middle">
                      <div className="flex items-start gap-1 sm:gap-2">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5 shrink-0">{idx + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p 
                            className="font-bold text-slate-900 text-[11px] sm:text-sm leading-snug break-words whitespace-normal"
                            title={q.questionText}
                          >
                            {q.questionText}
                          </p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[9px] sm:text-[10px]">
                            {(q.automatedType || q.displayOrder === 1 || q.displayOrder === 3) && (
                              <span className="rounded bg-sky-100 px-1 py-0.2 font-bold text-sky-800 border border-sky-200" title="Automatic from Attendance module">
                                ⚡ Auto (Attendance)
                              </span>
                            )}
                            {q.isCriticalViolation && (
                              <span className="rounded bg-red-100 px-1 py-0.2 font-bold text-red-700">
                                Critical
                              </span>
                            )}
                            <span className="text-slate-400 font-medium">Wt:{q.weight || 1}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Worker Columns for this Question */}
                    {workerGroups.map((group) =>
                      group.list.map((w) => {
                        const isAbsent = group.key === 'absent';
                        const isLeaveQ = q.displayOrder === 4 || q.questionText?.includes('छुट्टी');
                        const isDriverOrNight = isDriverOrNightGuard(w.designationName);
                        const isNonApplicable = isNonApplicableForDriverOrNight(q);
                        const isApplicable = isAbsent ? isLeaveQ : (!isLeaveQ && !(isDriverOrNight && isNonApplicable));
                        const currentAnswer = evalAnswers[w.workerId]?.[q._id] || 'YES';
                        const isDutyInQ = q.automatedType === 'DUTY_IN' || q.displayOrder === 1;
                        const isLunchInQ = q.automatedType === 'LUNCH_IN' || q.displayOrder === 3;
                        const isAutoQ = isDutyInQ || isLunchInQ;

                        return (
                          <td
                            key={w.workerId}
                            className={`p-1 sm:p-2 text-center border-r border-slate-200 align-middle ${
                              isAbsent ? 'bg-slate-50/60' : ''
                            }`}
                          >
                            {!isApplicable ? (
                              <span className="inline-block rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold text-slate-400">
                                N/A
                              </span>
                            ) : isAutoQ && !isAdmin ? (
                              <div className="inline-flex flex-col items-center">
                                <span
                                  className={`inline-block rounded px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold ${
                                    currentAnswer === 'YES'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                      : 'bg-red-100 text-red-800 border border-red-300'
                                  }`}
                                  title={`System Auto (Attendance): ${
                                    isDutyInQ
                                      ? `Punch In ${w.attendancePunctuality?.dutyIn?.timeText || 'N/A'}`
                                      : `Lunch In ${w.attendancePunctuality?.lunchIn?.timeText || 'N/A'}`
                                  }`}
                                >
                                  {currentAnswer === 'YES' ? 'हाँ (Auto)' : 'ना (Auto)'}
                                </span>
                              </div>
                            ) : (!isAdmin && (w.isEvaluated || data?.isAlreadySubmitted)) ? (
                              <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-100 opacity-75">
                                <span
                                  className={`rounded px-1.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold ${
                                    currentAnswer === 'YES'
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'bg-red-600 text-white shadow-xs'
                                  }`}
                                  title="Submitted rating (Locked)"
                                >
                                  {currentAnswer === 'YES' ? 'हाँ' : 'ना'}
                                </span>
                              </div>
                            ) : (
                              <div className="inline-flex rounded-md border border-slate-200 p-0.5 bg-slate-100 shadow-inner">
                                <button
                                  type="button"
                                  onClick={() => handleAnswerToggle(w.workerId, q._id, 'YES')}
                                  className={`rounded px-1.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold transition ${
                                    currentAnswer === 'YES'
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-emerald-700'
                                  }`}
                                >
                                  हाँ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAnswerToggle(w.workerId, q._id, 'NO')}
                                  className={`rounded px-1.5 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold transition ${
                                    currentAnswer === 'NO'
                                      ? 'bg-red-600 text-white shadow-xs'
                                      : 'text-slate-600 hover:text-red-700'
                                  }`}
                                >
                                  ना
                                </button>
                              </div>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Confirm Daily Evaluation Submission</h3>
            <p className="text-sm text-slate-600">
              You are about to submit evaluations for <strong>{evaluableWorkersCount} present/half-day workers</strong> on{' '}
              <strong>{date}</strong>.
            </p>
            <p className="text-xs text-slate-500">
              All question answers and daily grades will be saved as immutable snapshots.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button onClick={() => setShowConfirmModal(false)} className={secondaryButton}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`${primaryButton} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {submitting ? 'Submitting…' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Set Worker Baseline / Last Month Grade Modal */}
      {gradeModal.isOpen && gradeModal.worker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Set Worker Grade
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set initial / last month grade for <strong>{gradeModal.worker.workerName}</strong> ({gradeModal.worker.workerCode})
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Select Grade:</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'A', label: 'Grade A', color: 'bg-emerald-600 text-white border-emerald-700' },
                  { id: 'B', label: 'Grade B', color: 'bg-amber-400 text-slate-900 border-amber-500' },
                  { id: 'C', label: 'Grade C', color: 'bg-red-600 text-white border-red-700' },
                  { id: 'D', label: 'Grade D', color: 'bg-slate-950 text-rose-300 border-slate-800' },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGradeModal((prev) => ({ ...prev, selectedGrade: g.id }))}
                    className={`rounded-lg py-2 text-center text-xs font-bold border transition ${g.color} ${
                      gradeModal.selectedGrade === g.id
                        ? 'ring-2 ring-emerald-500 ring-offset-2 scale-102 shadow'
                        : 'opacity-60 hover:opacity-100 cursor-pointer'
                    }`}
                  >
                    {g.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGradeModal({ isOpen: false, worker: null, selectedGrade: 'A', saving: false })}
                disabled={gradeModal.saving}
                className={secondaryButton + ' !h-8 !px-3 text-xs'}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBaselineGrade}
                disabled={gradeModal.saving}
                className={primaryButton + ' !h-8 !px-4 text-xs font-bold'}
              >
                {gradeModal.saving ? 'Saving…' : 'Save Grade'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
