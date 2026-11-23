import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getRatingComparison } from '../services/performanceApi.js';
import { Spinner, Alert, secondaryButton } from '../../components/Ui.jsx';

function getTodayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function RatingComparisonTab({ firms, selectedFirmId, onFirmChange, refreshKey }) {
  const [date, setDate] = useState(getTodayIST());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  // Detail Modal State
  const [detailModal, setDetailModal] = useState({
    isOpen: false,
    worker: null,
  });

  // Horizontal Scrolling & Drag-to-Scroll Support matching Tab 1
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

  const fetchData = async () => {
    if (!selectedFirmId || selectedFirmId === 'all') return;
    setLoading(true);
    setError('');
    try {
      const res = await getRatingComparison({
        firmId: selectedFirmId,
        date,
      });
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load rating comparison data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedFirmId, date, refreshKey]);

  // Filtered workers list
  const displayedWorkers = useMemo(() => {
    if (!data?.workers) return [];
    let list = data.workers;

    if (search && search.trim()) {
      const term = search.toLowerCase().trim();
      list = list.filter((w) => {
        const name = (w.workerName || '').toLowerCase();
        const code = (w.workerCode || '').toLowerCase();
        const desig = (w.designationName || '').toLowerCase();
        return name.includes(term) || code.includes(term) || desig.includes(term);
      });
    }

    return list;
  }, [data, search]);

  // Group workers by attendance: Present -> Half Day -> Absent (Exact match to Tab 1)
  const workerGroups = useMemo(() => {
    if (!displayedWorkers) return [];
    const present = displayedWorkers.filter((w) => w.attendanceStatus === 'PRESENT');
    const halfDay = displayedWorkers.filter((w) => w.attendanceStatus === 'HALF_DAY');
    const absent = displayedWorkers.filter(
      (w) => w.attendanceStatus === 'ABSENT' || !['PRESENT', 'HALF_DAY'].includes(w.attendanceStatus)
    );

    return [
      { key: 'present', label: 'Present Workers', list: present, color: 'bg-emerald-600', badgeColor: 'bg-emerald-100 text-emerald-800' },
      { key: 'halfDay', label: 'Half Day Workers', list: halfDay, color: 'bg-sky-600', badgeColor: 'bg-sky-100 text-sky-800' },
      { key: 'absent', label: 'Absent Workers', list: absent, color: 'bg-slate-500', badgeColor: 'bg-red-100 text-red-800' },
    ];
  }, [displayedWorkers]);

  const totalWorkersCount = displayedWorkers.length;

  const getGradeBadge = (grade) => {
    switch (grade) {
      case 'A':
        return <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-black text-white shadow-2xs">A</span>;
      case 'B':
        return <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-amber-400 text-[9px] font-black text-slate-900 shadow-2xs">B</span>;
      case 'C':
        return <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[9px] font-black text-white shadow-2xs">C</span>;
      case 'D':
        return <span className="inline-flex items-center rounded-full bg-slate-950 px-1 py-0.2 text-[8px] font-black text-rose-300 border border-slate-800 shadow-2xs">D</span>;
      default:
        return <span className="text-slate-400 font-bold">—</span>;
    }
  };

  const hasAnyEvaluationsOnDate = (data?.workers || []).some((w) => w.evaluatorCount > 0);

  return (
    <div className="space-y-2 sm:space-y-3">
      {/* 1. FILTERS & VIEW MODE CONTROLS */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:px-4 sm:py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* LEFT: Search Bar */}
          <div className="relative w-full sm:w-[220px] md:w-[260px]">
            <span className="pointer-events-none absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            <input
              type="text"
              placeholder="Search worker…"
              className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-7 text-xs font-medium text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* RIGHT: Firm, Date, Filter Mode, Scroll */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2.5 ml-auto">
            {/* Firm Selector */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Firm:
              </span>
              <select
                className="h-8 rounded-lg border border-slate-200 bg-slate-50/60 px-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white"
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
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Date:
              </span>
              <input
                type="date"
                className="h-8 rounded-lg border border-slate-200 bg-slate-50/60 px-2 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white"
                value={date}
                max={getTodayIST()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Quick Scroll Left/Right Buttons */}
            <div className="hidden sm:inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollColumns('left')}
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-2xs hover:bg-slate-100 transition cursor-pointer"
                title="Scroll Left"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => scrollColumns('right')}
                className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 shadow-2xs hover:bg-slate-100 transition cursor-pointer"
                title="Scroll Right"
              >
                ▶
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* HELPER JUMP BANNER: If selected date is empty but previous dates have evaluations */}
      {!hasAnyEvaluationsOnDate && data?.latestEvaluationDate && data.latestEvaluationDate !== date && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3.5 py-2 text-xs text-indigo-950 shadow-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">💡</span>
            <p>
              No evaluations for <strong>{date}</strong>. Latest ratings were recorded on{' '}
              <strong>{data.latestEvaluationDate}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDate(data.latestEvaluationDate)}
            className="rounded-lg bg-indigo-600 px-3 py-1 font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer shrink-0"
          >
            Jump to {data.latestEvaluationDate} →
          </button>
        </div>
      )}

      {/* 3. TRANSPOSED MATRIX VIEW (EXACTLY MATCHING TAB 1 LAYOUT) */}
      {loading ? (
        <Spinner label="Loading rating comparison matrix…" />
      ) : !data || totalWorkersCount === 0 || !data?.questions?.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-xs">
          No evaluations or workers found for this date.
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
                    Comparison Matrix
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
                    Workers ({totalWorkersCount})
                  </th>
                  {workerGroups.map((group) =>
                    group.list.map((w) => (
                      <th
                        key={w.workerId}
                        className="p-1 sm:p-2.5 w-[90px] min-w-[85px] max-w-[100px] sm:w-[150px] sm:min-w-[140px] sm:max-w-[170px] text-center border-r border-slate-200 align-top"
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
              </thead>

              {/* QUESTIONS AS VERTICAL ROWS (Sticky Left Column) */}
              <tbody className="divide-y divide-slate-200">
                {data?.questions?.map((q, idx) => (
                  <tr key={q._id} className="hover:bg-slate-50/60 transition">
                    {/* Fixed / Sticky Question Column - Matches Tab 1 */}
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
                              <span className="rounded bg-rose-100 px-1 py-0.2 font-bold text-rose-700">
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
                        const isLeaveQ = q.isLeaveQuestion || q.displayOrder === 4 || q.questionText?.includes('छुट्टी');
                        const isApplicable = isAbsent ? isLeaveQ : !isLeaveQ;
                        const qId = String(q._id);

                        if (!isApplicable) {
                          return (
                            <td
                              key={w.workerId}
                              className="p-1 sm:p-2 text-center border-r border-slate-200 align-middle bg-slate-50/70"
                            >
                              <span className="inline-block rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                                N/A
                              </span>
                            </td>
                          );
                        }

                        if (w.evaluatorCount === 0) {
                          return (
                            <td
                              key={w.workerId}
                              className="p-1 sm:p-2 text-center border-r border-slate-200 align-middle text-slate-300 text-[10px] italic"
                            >
                              Unrated
                            </td>
                          );
                        }

                        // Collect evaluator answers for this question
                        const evaluatorRatings = w.evaluations.map((ev) => {
                          const matched = ev.answers.find((a) => String(a.questionId) === qId);
                          return {
                            evaluatorName: ev.evaluatorName,
                            evaluatorRole: ev.evaluatorRole,
                            answer: matched?.answer || 'YES',
                          };
                        });

                        // Check if evaluators have conflicting answers on this question
                        const isConflict =
                          evaluatorRatings.length >= 2 &&
                          evaluatorRatings.some((r) => r.answer !== evaluatorRatings[0].answer);

                        return (
                          <td
                            key={w.workerId}
                            className={`p-1 sm:p-2 text-center border-r border-slate-200 align-middle transition ${
                              isConflict ? 'bg-rose-50/90 ring-1 ring-rose-300' : ''
                            }`}
                          >
                            <div className="flex flex-col items-center gap-1">
                              {/* Evaluator Answers Stack */}
                              {evaluatorRatings.map((ans, aIdx) => (
                                <div
                                  key={aIdx}
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] sm:text-[9px] font-bold shadow-2xs ${
                                    ans.answer === 'YES'
                                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                      : 'bg-rose-100 text-rose-800 border border-rose-300 font-black'
                                  }`}
                                  title={`${ans.evaluatorName} (${ans.evaluatorRole}): ${ans.answer === 'YES' ? 'हाँ (YES)' : 'ना (NO)'}`}
                                >
                                  <span className="truncate max-w-[42px] sm:max-w-[55px] text-[8px] font-medium text-slate-600">
                                    {ans.evaluatorName.split(' ')[0]}:
                                  </span>
                                  <span className={ans.answer === 'YES' ? 'text-emerald-700' : 'text-rose-700 font-extrabold'}>
                                    {ans.answer === 'YES' ? 'हाँ' : 'ना'}
                                  </span>
                                </div>
                              ))}

                              {/* Conflict Badge */}
                              {isConflict && (
                                <span className="rounded bg-rose-600 px-1 py-0.2 text-[7px] sm:text-[8px] font-black text-white shadow-xs">
                                  ⚠️ Conflict
                                </span>
                              )}
                            </div>
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

      {/* 4. QUESTION-BY-QUESTION FULL-SCREEN MODAL */}
      {detailModal.isOpen && detailModal.worker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 backdrop-blur-xs">
          <div className="w-full max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Rating Comparison: {detailModal.worker.workerName} ({detailModal.worker.workerCode})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Date: {date} • {detailModal.worker.designationName} • Evaluators: {detailModal.worker.evaluatorCount}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal({ isOpen: false, worker: null })}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-50 border-b border-slate-200 text-xs shrink-0">
              {detailModal.worker.evaluations.map((ev) => (
                <div key={ev.evaluatorId} className="rounded-lg bg-white border border-slate-200 p-2 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800 truncate" title={ev.evaluatorName}>
                      {ev.evaluatorName}
                    </p>
                    {getGradeBadge(ev.dailyGrade)}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{ev.evaluatorRole}</span>
                    <span className="font-black text-slate-900 text-xs">{ev.dailyScore} pts</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-y-auto p-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2 min-w-[200px]">Question</th>
                    {detailModal.worker.evaluations.map((ev) => (
                      <th key={ev.evaluatorId} className="p-2 text-center whitespace-nowrap">
                        {ev.evaluatorName}
                        <br />
                        <span className="text-[8px] font-normal text-slate-400">({ev.evaluatorRole})</span>
                      </th>
                    ))}
                    <th className="p-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.questions?.map((q, idx) => {
                    const qId = String(q._id);
                    const answers = detailModal.worker.evaluations.map((ev) => {
                      const matched = ev.answers.find((a) => String(a.questionId) === qId);
                      return matched?.answer || 'YES';
                    });

                    const isConflict = answers.some((a) => a !== answers[0]);

                    return (
                      <tr
                        key={qId}
                        className={`transition ${
                          isConflict ? 'bg-rose-50/70 font-semibold' : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="p-2 text-slate-800">
                          <span className="font-bold text-slate-400 mr-1.5">{idx + 1}.</span>
                          <span>{q.questionText}</span>
                          {q.isCriticalViolation && (
                            <span className="ml-1.5 rounded bg-rose-100 px-1 py-0.2 text-[8px] font-black text-rose-700">
                              CRITICAL
                            </span>
                          )}
                        </td>

                        {answers.map((ans, aIdx) => (
                          <td key={aIdx} className="p-2 text-center">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                ans === 'YES'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border border-rose-200 font-black'
                              }`}
                            >
                              {ans === 'YES' ? '✅ YES' : '❌ NO'}
                            </span>
                          </td>
                        ))}

                        <td className="p-2 text-center">
                          {isConflict ? (
                            <span className="rounded bg-rose-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow-2xs">
                              Conflict
                            </span>
                          ) : (
                            <span className="text-[9px] text-emerald-700 font-bold">Match</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end p-3 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => setDetailModal({ isOpen: false, worker: null })}
                className={secondaryButton}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
