import { useState, useEffect, useMemo } from 'react';
import { getMonthlySalarySummary, updateSalaryRevision } from '../services/performanceApi.js';
import { Spinner, Alert, inputClass, primaryButton, secondaryButton } from '../../components/Ui.jsx';

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

  // Edit Salary Modal State
  const [revisionModal, setRevisionModal] = useState({
    isOpen: false,
    worker: null,
    approvedSalary: 0,
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
      setError(err.message || 'Failed to load workers and salary summary.');
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

  // Open Edit Salary Modal
  const openEditSalary = (w) => {
    setRevisionModal({
      isOpen: true,
      worker: w,
      approvedSalary: w.proposedSalary || 0,
      remarks: '',
      saving: false,
    });
  };

  const handleSaveSalary = async () => {
    setRevisionModal((prev) => ({ ...prev, saving: true }));
    setError('');
    setSuccess('');
    try {
      await updateSalaryRevision({
        workerId: revisionModal.worker.workerId,
        month,
        action: 'APPROVE',
        approvedSalary: Number(revisionModal.approvedSalary),
        remarks: revisionModal.remarks,
      });
      setSuccess(`Salary updated successfully for ${revisionModal.worker.workerName}!`);
      setRevisionModal((prev) => ({ ...prev, isOpen: false }));
      await fetchSummary();
    } catch (err) {
      setError(err.message || 'Failed to update salary.');
      setRevisionModal((prev) => ({ ...prev, saving: false }));
    }
  };

  // Grade badge styling helper - Vibrant Traffic Signal Colors:
  // A = Green (Pass / Top), B = Yellow (Warning / Mid), C = Red (Stop / Low)
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
      default:
        return <span className="font-bold text-slate-400 text-sm">—</span>;
    }
  };

  // Salary text color matches Grade traffic signal colors:
  // Grade A -> Green (emerald-700)
  // Grade B -> Yellow/Amber (amber-600)
  // Grade C -> Red (red-600)
  const getSalaryColorClass = (grade) => {
    switch (grade) {
      case 'A':
        return 'text-emerald-700';
      case 'B':
        return 'text-amber-600';
      case 'C':
        return 'text-red-600';
      default:
        return 'text-slate-800';
    }
  };

  return (
    <div className="space-y-2.5 sm:space-y-4">
      {/* Filters Bar - Search Bar FIRST on Left (+30% wider), Other controls on EXTREME RIGHT */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 sm:px-4 sm:py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* 1. LEFT SIDE: Search Bar (Increased by 30% width: w-[340px] md:w-[380px] + Real-time Typing Word Filter) */}
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

          {/* 2. EXTREME RIGHT: All Other Fields (Firm, Month, Grade) */}
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
              </select>
            </div>
          </div>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* DIRECT WORKERS & SALARY TABLE - Steady Worker Column */}
      {loading ? (
        <Spinner label="Calculating monthly grades and salary figures…" />
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
                  <th className="px-4 py-3 text-right font-bold text-slate-700">Salary</th>
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

                    {/* Numerical Average Score (Dynamic Variable Points) */}
                    <td className="px-3 py-3 text-center font-black text-slate-800 text-sm">
                      {w.evaluationDays > 0 ? `${w.averageScore} / ${totalMaxPoints}` : '—'}
                    </td>

                    {/* Final Monthly Grade */}
                    <td className="px-3 py-3 text-center">{getGradeBadge(w.finalGrade)}</td>

                    {/* Salary (Matches Grade Traffic Signal Color) */}
                    <td className="px-4 py-3 text-right">
                      <span className={`font-extrabold text-sm ${getSalaryColorClass(w.finalGrade)}`}>
                        ₹{w.proposedSalary.toLocaleString('en-IN')}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditSalary(w)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
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

      {/* EDIT WORKER SALARY MODAL */}
      {revisionModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Worker Salary</h3>
                <p className="text-xs text-slate-500">
                  {revisionModal.worker?.workerName} ({revisionModal.worker?.workerCode})
                </p>
              </div>
              <button
                onClick={() => setRevisionModal({ ...revisionModal, isOpen: false })}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs">
              <span className="text-slate-500 font-medium">Grade:</span>
              <span>{getGradeBadge(revisionModal.worker?.finalGrade)}</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Salary (₹)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  min="0"
                  step="500"
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white pl-7 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                  value={revisionModal.approvedSalary ?? ''}
                  onChange={(e) => setRevisionModal({ ...revisionModal, approvedSalary: e.target.value })}
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Calculated from Grade rules. You can override if desired.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRevisionModal({ ...revisionModal, isOpen: false })}
                className={secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveSalary}
                disabled={revisionModal.saving}
                className={primaryButton}
              >
                {revisionModal.saving ? 'Saving…' : 'Save Salary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
