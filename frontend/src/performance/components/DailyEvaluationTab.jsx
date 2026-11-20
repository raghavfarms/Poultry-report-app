import { useState, useEffect, useMemo, useRef } from 'react';
import { getDailyEvaluationMatrix, submitDailyEvaluation } from '../services/performanceApi.js';
import { Spinner, Alert, primaryButton, secondaryButton } from '../../components/Ui.jsx';

function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function DailyEvaluationTab({ firms, selectedFirmId, onFirmChange, refreshKey }) {
  const [date, setDate] = useState(getTodayIST());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
      ];

      for (const w of allWorkers) {
        initial[w.workerId] = {};
        for (const q of res.questions || []) {
          // If already evaluated today, restore saved answer
          const savedAnswer = w.answers?.find((a) => String(a.questionId) === String(q._id))?.answer;
          // If not evaluated today, carry forward previous day's answer if available
          const carriedAnswer = w.previousAnswers?.find((a) => String(a.questionId) === String(q._id))?.answer;

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

  // Set all answers for a single worker to YES
  const handleSetAllYes = (workerId) => {
    if (!data?.questions) return;
    setEvalAnswers((prev) => {
      const workerAns = { ...(prev[workerId] || {}) };
      for (const q of data.questions) {
        workerAns[q._id] = 'YES';
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

  const evaluableWorkersCount = (data?.workers?.present?.length || 0) + (data?.workers?.halfDay?.length || 0);

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

          {/* Date Picker */}
          <div className="flex items-center gap-1">
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

        {/* Submit Button */}
        <div>
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={loading || submitting || evaluableWorkersCount === 0}
            className="inline-flex h-7 sm:h-8 items-center justify-center rounded-md sm:rounded-lg bg-emerald-600 px-2.5 sm:px-4 text-[11px] sm:text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? 'Saving…' : `Submit (${evaluableWorkersCount})`}
          </button>
        </div>
      </div>

    

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

                {/* ROW 3: Attendance Status & Grade Preview */}
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px]">
                  <th className="sticky left-0 z-30 bg-slate-50/90 p-2 sm:p-3 font-semibold text-slate-600 border-r border-slate-300 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] text-[10px] sm:text-[11px]">
                    Status & Grade
                  </th>
                  {workerGroups.map((group) =>
                    group.list.map((w) => (
                      <td key={w.workerId} className="p-1 sm:p-2 text-center border-r border-slate-200">
                        <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold ${group.badgeColor}`}>
                          {w.attendanceStatus}
                        </span>
                        {w.dailyGrade && (
                          <div className="mt-0.5 sm:mt-1 flex items-center justify-center gap-1">
                            {w.dailyScore !== null && (
                              <span className="rounded bg-slate-200 px-1 py-0.2 text-[8px] sm:text-[9px] font-black text-slate-700">
                                {w.dailyScore}
                              </span>
                            )}
                            <span className={`rounded px-1 sm:px-1.5 py-0.2 text-[8px] sm:text-[10px] font-bold text-white ${
                              w.dailyGrade === 'A' ? 'bg-emerald-600' : w.dailyGrade === 'B' ? 'bg-sky-600' : 'bg-amber-600'
                            }`}>
                              {w.dailyGrade}
                            </span>
                          </div>
                        )}
                        {!w.isEvaluated && w.previousEvaluationDate && (
                          <span
                            className="inline-block mt-0.5 rounded bg-amber-50 px-1 py-0.2 text-[8px] font-semibold text-amber-700 border border-amber-200/60"
                            title={`Carried forward from ${w.previousEvaluationDate}`}
                          >
                            Last Day
                          </span>
                        )}
                        {group.key !== 'absent' && (
                          <button
                            type="button"
                            onClick={() => handleSetAllYes(w.workerId)}
                            className="block mx-auto mt-0.5 sm:mt-1 text-[8px] sm:text-[9px] font-semibold text-emerald-700 hover:underline"
                          >
                            All Yes
                          </button>
                        )}
                      </td>
                    ))
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
                        const currentAnswer = evalAnswers[w.workerId]?.[q._id] || 'YES';

                        return (
                          <td
                            key={w.workerId}
                            className={`p-1 sm:p-2 text-center border-r border-slate-200 align-middle ${
                              isAbsent ? 'bg-slate-50 opacity-50' : ''
                            }`}
                          >
                            {isAbsent ? (
                              <span className="inline-block rounded bg-slate-200 px-1 py-0.5 text-[9px] font-semibold text-slate-500">
                                Disabled 
                              </span>
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
              <button onClick={handleSubmit} className={primaryButton}>
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
