import { useState, useEffect, useMemo } from 'react';
import { getMonthlySalarySummary, updateWorkerGrade } from '../services/performanceApi.js';
import { Spinner, Alert, primaryButton, secondaryButton } from '../../components/Ui.jsx';

function getCurrentMonthString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()).slice(0, 7);
}

export default function WorkersSalaryTab({ firms, selectedFirmId, onFirmChange, refreshKey }) {
  const [month, setMonth] = useState(getCurrentMonthString());
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('ALL');
  const [workers, setWorkers] = useState([]);
  const [totalMaxPoints, setTotalMaxPoints] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Edit Grade Modal State
  const [gradeModal, setGradeModal] = useState({
    isOpen: false,
    worker: null,
    selectedGrade: 'A',
    remarks: '',
    saving: false,
  });

  const fetchSummary = async () => {
    if (!selectedFirmId || selectedFirmId === 'all') return;
    setLoading(true);
    setError('');
    try {
      const res = await getMonthlySalarySummary({
        firmId: selectedFirmId,
        month,
        search,
        gradeFilter,
      });
      setWorkers(res.workers || []);
      if (res.totalMaxPoints) {
        setTotalMaxPoints(res.totalMaxPoints);
      }
    } catch (err) {
      setError(err.message || 'Failed to load workers summary.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [selectedFirmId, month, gradeFilter, refreshKey]);

  // Real-time live word filter as user types (Worker Name, Code, Designation)
  const displayedWorkers = useMemo(() => {
    if (!search || !search.trim()) return workers;
    const term = search.toLowerCase().trim();
    return workers.filter((w) => {
      const name = (w.workerName || '').toLowerCase();
      const code = (w.workerCode || '').toLowerCase();
      const desig = (w.designationName || '').toLowerCase();
      return name.includes(term) || code.includes(term) || desig.includes(term);
    });
  }, [workers, search]);

  // Open Edit Grade Modal
  const openEditGrade = (w) => {
    const validGrades = ['A', 'B', 'C', 'D'];
    const initialGrade = validGrades.includes(w.finalGrade) ? w.finalGrade : 'A';
    setGradeModal({
      isOpen: true,
      worker: w,
      selectedGrade: initialGrade,
      remarks: w.gradeRemarks || '',
      saving: false,
    });
  };

  const handleSaveGrade = async () => {
    setGradeModal((prev) => ({ ...prev, saving: true }));
    setError('');
    setSuccess('');
    try {
      await updateWorkerGrade({
        workerId: gradeModal.worker.workerId,
        month,
        grade: gradeModal.selectedGrade,
        remarks: gradeModal.remarks,
      });
      setSuccess(`Grade updated successfully to Grade ${gradeModal.selectedGrade} for ${gradeModal.worker.workerName}!`);
      setGradeModal((prev) => ({ ...prev, isOpen: false }));
      await fetchSummary();
    } catch (err) {
      setError(err.message || 'Failed to update grade.');
      setGradeModal((prev) => ({ ...prev, saving: false }));
    }
  };

  // Grade badge styling helper - Vibrant Traffic Signal & Blacklist Colors:
  // A = Green, B = Yellow/Amber, C = Red, D = BlackList
  const getGradeBadge = (grade) => {
    switch (grade) {
      case 'A':
        return (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white shadow">
            A
          </span>
        );
      case 'B':
        return (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-black text-slate-900 shadow">
            B
          </span>
        );
      case 'C':
        return (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white shadow">
            C
          </span>
        );
      case 'D':
        return (
          <span
            className="inline-flex items-center justify-center rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-black text-rose-300 border border-slate-800 shadow"
            title="Grade D (BlackList - Score below 50%)"
          >
            D (BlackList)
          </span>
        );
      default:
        return <span className="font-bold text-slate-400 text-sm">—</span>;
    }
  };

  return (
    <div className="space-y-2.5 sm:space-y-4">
      {/* Filters Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:px-4 sm:py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* LEFT: Search Bar */}
          <div className="relative w-full sm:w-[320px] md:w-[370px]">
            <span className="pointer-events-none absolute left-3 top-2.5 text-xs text-slate-400">
              🔍
            </span>
            <input
              type="text"
              placeholder="Search worker name, code, designation…"
              className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-7 text-xs font-medium text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* RIGHT: Firm, Month, Grade */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-auto">
            {/* Firm Selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Firm:
              </span>
              <select
                className="h-8.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-200"
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

            {/* Month & Year Picker */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Month:
              </span>
              <input
                type="month"
                className="h-8.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-200"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>

            {/* Grade Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Grade:
              </span>
              <select
                className="h-8.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-xs font-semibold text-slate-800 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-200"
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
              >
                <option value="ALL">All Grades</option>
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
                <option value="D">Grade D (BlackList)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* DIRECT WORKERS TABLE (Salary column hidden) */}
      {loading ? (
        <Spinner label="Calculating monthly grades…" />
      ) : displayedWorkers.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          {search ? `No workers found matching "${search}".` : 'No workers found for this firm and month.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  {/* Steady Sticky Worker Header */}
                  <th className="sticky left-0 z-20 bg-slate-50 px-3 py-2.5 sm:px-4 sm:py-3 font-bold text-slate-700 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[120px] sm:min-w-[160px]">
                    Worker ({displayedWorkers.length})
                  </th>
                  <th className="px-3 py-3">Designation</th>
                  <th className="px-2 py-3 text-center text-emerald-700">P Days</th>
                  <th className="px-2 py-3 text-center text-sky-700">HD Days</th>
                  <th className="px-2 py-3 text-center text-red-600">A Days</th>
                  <th className="px-3 py-3 text-center">Monthly Avg</th>
                  <th className="px-3 py-3 text-center">Grade</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedWorkers.map((w) => (
                  <tr key={w.workerId} className="hover:bg-slate-50/70 transition">
                    {/* Steady Sticky Worker Info Cell */}
                    <td className="sticky left-0 z-10 bg-white px-3 py-2.5 sm:px-4 sm:py-3 font-semibold text-slate-900 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] min-w-[120px] sm:min-w-[160px]">
                      <p className="text-xs sm:text-sm font-bold truncate" title={w.workerName}>{w.workerName}</p>
                      <span className="font-mono text-[10px] text-slate-500">{w.workerCode}</span>
                    </td>

                    <td className="px-3 py-3 text-slate-600">{w.designationName}</td>

                    {/* Attendance Days */}
                    <td className="px-2 py-3 text-center font-bold text-emerald-700">{w.presentDays}</td>
                    <td className="px-2 py-3 text-center font-bold text-sky-700">{w.halfDays}</td>
                    <td className="px-2 py-3 text-center font-bold text-red-600">{w.absentDays}</td>

                    {/* Numerical Average Score */}
                    <td className="px-3 py-3 text-center">
                      {w.evaluationDays > 0 ? (
                        <div className="flex flex-col items-center justify-center">
                          <span className="font-black text-slate-800 text-sm leading-tight">
                            {w.averageScore} / {totalMaxPoints}
                          </span>
                          <span
                            className="text-[10px] font-semibold text-slate-500 mt-0.5 tracking-tight"
                            title={`${w.totalEarnedPoints} points earned out of ${w.totalPossiblePoints} max points across ${w.evaluationDays} evaluated days`}
                          >
                            ({w.totalEarnedPoints} / {w.totalPossiblePoints} pts • {w.evaluationDays}d)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-bold">—</span>
                      )}
                    </td>

                    {/* Final Monthly Grade */}
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex flex-col items-center gap-0.5">
                        {getGradeBadge(w.finalGrade)}
                        {w.isGradeOverridden && (
                          <span className="text-[8px] font-bold text-amber-700 bg-amber-50 rounded px-1 border border-amber-200/60" title={w.gradeRemarks || 'Manual override'}>
                            Edited
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions: Edit Grade */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditGrade(w)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                      >
                        <span>✏️</span>
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EDIT WORKER GRADE MODAL */}
      {gradeModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Worker Grade</h3>
                <p className="text-xs text-slate-500">
                  {gradeModal.worker?.workerName} ({gradeModal.worker?.workerCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGradeModal({ ...gradeModal, isOpen: false })}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Performance Summary */}
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span>Designation:</span>
                <span className="font-semibold text-slate-800">{gradeModal.worker?.designationName}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Monthly Avg Score:</span>
                <span className="font-black text-slate-900">
                  {gradeModal.worker?.evaluationDays > 0 ? (
                    <span>
                      {gradeModal.worker.averageScore} / {totalMaxPoints}{' '}
                      <span className="text-[11px] font-medium text-slate-500">
                        ({gradeModal.worker.totalEarnedPoints} / {gradeModal.worker.totalPossiblePoints} pts • {gradeModal.worker.evaluationDays}d)
                      </span>
                    </span>
                  ) : (
                    '—'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Current Grade:</span>
                <span>{getGradeBadge(gradeModal.worker?.finalGrade)}</span>
              </div>
            </div>

            {/* Grade Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Select Grade to Assign
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { grade: 'A', label: 'Grade A', badgeBg: 'bg-emerald-600 text-white', activeRing: 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-500' },
                  { grade: 'B', label: 'Grade B', badgeBg: 'bg-amber-400 text-slate-900', activeRing: 'border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-400' },
                  { grade: 'C', label: 'Grade C', badgeBg: 'bg-red-600 text-white', activeRing: 'border-red-600 bg-red-50 text-red-950 ring-2 ring-red-500' },
                  { grade: 'D', label: 'BlackList', badgeBg: 'bg-slate-950 text-rose-300 border border-slate-800', activeRing: 'border-slate-900 bg-slate-950 text-white ring-2 ring-slate-800' },
                ].map((item) => {
                  const isSelected = gradeModal.selectedGrade === item.grade;
                  return (
                    <button
                      key={item.grade}
                      type="button"
                      onClick={() => setGradeModal((prev) => ({ ...prev, selectedGrade: item.grade }))}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border-2 transition cursor-pointer ${
                        isSelected ? item.activeRing : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-black shadow-xs ${item.badgeBg}`}>
                        {item.grade}
                      </span>
                      <span className="mt-1 text-[11px] font-bold text-center leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Remarks */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarks / Reason (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Performance review override"
                className="h-9 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                value={gradeModal.remarks}
                onChange={(e) => setGradeModal((prev) => ({ ...prev, remarks: e.target.value }))}
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setGradeModal({ ...gradeModal, isOpen: false })}
                className={secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGrade}
                disabled={gradeModal.saving}
                className={primaryButton}
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
