import { useState, useEffect } from 'react';
import { getGradeSalaryConfig, updateGradeSalaryConfig } from '../services/performanceApi.js';
import { Spinner, Alert, primaryButton, secondaryButton } from '../../components/Ui.jsx';

export default function GradeSalaryMasterModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fixed monthly salary per grade
  const [salaries, setSalaries] = useState({
    gradeA: 11500,
    gradeB: 10500,
    gradeC: 9500,
  });

  // Admin configurable percentage thresholds (e.g. A = 80%, B = 50%)
  const [percentages, setPercentages] = useState({
    gradeA: 80,
    gradeB: 50,
  });

  // Dynamic variable questions summary
  const [summary, setSummary] = useState({
    totalQuestions: 8,
    totalWeight: 10,
    gradeA: { minScore: 8, maxScore: 10 },
    gradeB: { minScore: 5, maxScore: 7 },
    gradeC: { maxScore: 4 },
  });

  const fetchConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getGradeSalaryConfig();
      if (res.config?.gradeSalaries) {
        setSalaries({
          gradeA: res.config.gradeSalaries.gradeA ?? 11500,
          gradeB: res.config.gradeSalaries.gradeB ?? 10500,
          gradeC: res.config.gradeSalaries.gradeC ?? 9500,
        });
      }
      if (res.config?.gradeRules) {
        setPercentages({
          gradeA: res.config.gradeRules.gradeA?.minPercentage ?? 80,
          gradeB: res.config.gradeRules.gradeB?.minPercentage ?? 50,
        });
      }
      if (res.questionSummary) {
        setSummary(res.questionSummary);
      }
    } catch (err) {
      setError(err.message || 'Failed to load salary configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setSuccess('');
      setError('');
    }
  }, [isOpen]);

  // Live dynamic point calculations based on total weight and configured percentages
  const totalWeight = summary.totalWeight || 10;
  const percentA = Number(percentages.gradeA) || 0;
  const percentB = Number(percentages.gradeB) || 0;
  const calculatedMinA = Math.round(totalWeight * (percentA / 100));
  const calculatedMinB = Math.round(totalWeight * (percentB / 100));
  const calculatedMaxB = Math.max(calculatedMinB, calculatedMinA - 1);
  const calculatedMaxC = Math.max(0, calculatedMinB - 1);

  const handleSave = async (e) => {
    e.preventDefault();
    if (percentA <= percentB) {
      setError('Grade A percentage must be strictly higher than Grade B percentage.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await updateGradeSalaryConfig({
        gradeSalaries: {
          gradeA: Number(salaries.gradeA),
          gradeB: Number(salaries.gradeB),
          gradeC: Number(salaries.gradeC),
        },
        gradeRules: {
          gradeA: {
            minPercentage: percentA,
            minScore: calculatedMinA,
            maxScore: totalWeight,
            numericalPoints: totalWeight,
          },
          gradeB: {
            minPercentage: percentB,
            minScore: calculatedMinB,
            maxScore: calculatedMaxB,
            numericalPoints: calculatedMinB,
          },
          gradeC: {
            minPercentage: 0,
            minScore: 0,
            maxScore: calculatedMaxC,
            numericalPoints: 0,
          },
        },
      });
      setSuccess('Grade percentages & salaries saved successfully!');
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      setError(err.message || 'Failed to save salary configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs">
      <div className="relative flex w-full max-w-[530px] flex-col rounded-xl bg-white shadow-2xl">
        {/* Header - Compact */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Grade & Salary Master</h2>
            <p className="text-[11px] text-slate-500">Configure percentage thresholds and monthly salary per grade.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content Body - Compact */}
        <div className="p-3.5 space-y-2.5">
          {error && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}

          {loading ? (
            <Spinner label="Loading settings…" />
          ) : (
            <form onSubmit={handleSave} className="space-y-2">
              {/* GRADE A - GREEN */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3.5 py-2 shadow-xs">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      Grade A
                    </span>
                    <span className="text-xs font-bold text-emerald-900 truncate">
                      Score {calculatedMinA}–{totalWeight} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Minimum % Input (Wider & No Spinner) */}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Min%:</label>
                      <div className="relative w-16">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          required
                          className="h-7 w-full rounded border border-emerald-300 bg-white px-2 pr-4 text-xs font-bold text-emerald-800 outline-none focus:border-emerald-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={percentages.gradeA}
                          onChange={(e) => setPercentages({ ...percentages, gradeA: e.target.value })}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1.5 text-[10px] font-bold text-slate-400">%</span>
                      </div>
                    </div>

                    {/* Monthly Salary Input (Wider & No Spinner) */}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Salary:</label>
                      <div className="relative w-30">
                        <span className="absolute left-2 top-1.5 text-[11px] font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="500"
                          required
                          className="h-7 w-full rounded border border-emerald-300 bg-white pl-5 pr-2 text-xs font-bold text-emerald-800 outline-none focus:border-emerald-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={salaries.gradeA}
                          onChange={(e) => setSalaries({ ...salaries, gradeA: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Top performing workers (achieving ≥ {percentages.gradeA}% of total points)
                </p>
              </div>

              {/* GRADE B - YELLOW / AMBER */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-2 shadow-xs">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      Grade B
                    </span>
                    <span className="text-xs font-bold text-amber-950 truncate">
                      Score {calculatedMinB}–{calculatedMaxB} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {/* Minimum % Input (Wider & No Spinner) */}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Min%:</label>
                      <div className="relative w-16">
                        <input
                          type="number"
                          min="0"
                          max="99"
                          required
                          className="h-7 w-full rounded border border-amber-300 bg-white px-2 pr-4 text-xs font-bold text-amber-900 outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={percentages.gradeB}
                          onChange={(e) => setPercentages({ ...percentages, gradeB: e.target.value })}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1.5 text-[10px] font-bold text-slate-400">%</span>
                      </div>
                    </div>

                    {/* Monthly Salary Input (Wider & No Spinner) */}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Salary:</label>
                      <div className="relative w-30">
                        <span className="absolute left-2 top-1.5 text-[11px] font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="500"
                          required
                          className="h-7 w-full rounded border border-amber-300 bg-white pl-5 pr-2 text-xs font-bold text-amber-900 outline-none focus:border-amber-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={salaries.gradeB}
                          onChange={(e) => setSalaries({ ...salaries, gradeB: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Average performing workers ({percentages.gradeB}% to {Math.max(percentages.gradeB, percentages.gradeA - 1)}%)
                </p>
              </div>

              {/* GRADE C - RED */}
              <div className="rounded-lg border border-red-200 bg-red-50/50 px-3.5 py-2 shadow-xs">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      Grade C
                    </span>
                    <span className="text-xs font-bold text-red-950 truncate">
                      Score below {calculatedMinB} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <div className="text-[10px] font-medium text-slate-400 italic">
                      Below {percentages.gradeB}%
                    </div>

                    {/* Monthly Salary Input (Wider & No Spinner) */}
                    <div className="flex items-center gap-1">
                      <label className="text-[10px] font-semibold text-slate-600">Salary:</label>
                      <div className="relative w-30">
                        <span className="absolute left-2 top-1.5 text-[11px] font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="500"
                          required
                          className="h-7 w-full rounded border border-red-300 bg-white pl-5 pr-2 text-xs font-bold text-red-900 outline-none focus:border-red-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={salaries.gradeC}
                          onChange={(e) => setSalaries({ ...salaries, gradeC: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Lapses, critical violations, or score below {percentages.gradeB}%
                </p>
              </div>

              {/* Dynamic summary indicator - Compact */}
              <div className="rounded-md bg-slate-50 p-2 text-center text-[10px] text-slate-500 border border-slate-200">
                💡 <strong>{summary.totalQuestions}</strong> questions, <strong>{totalWeight} total pts</strong>. Points auto-calculate from percentages.
              </div>

              {/* Action Buttons - Compact */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Salary Rules'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
