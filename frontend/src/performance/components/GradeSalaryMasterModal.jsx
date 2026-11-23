import { useState, useEffect } from 'react';
import { getGradeSalaryConfig, updateGradeSalaryConfig } from '../services/performanceApi.js';
import { Spinner, Alert } from '../../components/Ui.jsx';

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
    gradeD: 0,
  });

  // Admin configurable percentage thresholds (A = 85%, B = 77%, C = 50%, D < 50%)
  const [percentages, setPercentages] = useState({
    gradeA: 85,
    gradeB: 77,
    gradeC: 50,
  });

  // Dynamic variable questions summary
  const [summary, setSummary] = useState({
    totalQuestions: 8,
    totalWeight: 10,
    gradeA: { minScore: 9, maxScore: 10 },
    gradeB: { minScore: 8, maxScore: 8 },
    gradeC: { minScore: 5, maxScore: 7 },
    gradeD: { minScore: 0, maxScore: 4 },
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
          gradeD: res.config.gradeSalaries.gradeD ?? 0,
        });
      }
      if (res.config?.gradeRules) {
        setPercentages({
          gradeA: res.config.gradeRules.gradeA?.minPercentage || 85,
          gradeB: res.config.gradeRules.gradeB?.minPercentage || 77,
          gradeC: (res.config.gradeRules.gradeC?.minPercentage > 0)
            ? res.config.gradeRules.gradeC.minPercentage
            : 50,
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
  const percentC = Number(percentages.gradeC) || 0;
  const calculatedMinA = Math.round(totalWeight * (percentA / 100));
  const calculatedMinB = Math.round(totalWeight * (percentB / 100));
  const calculatedMaxB = Math.max(calculatedMinB, calculatedMinA - 1);
  const calculatedMinC = Math.round(totalWeight * (percentC / 100));
  const calculatedMaxC = Math.max(calculatedMinC, calculatedMinB - 1);
  const calculatedMaxD = Math.max(0, calculatedMinC - 1);

  const handleSave = async (e) => {
    e.preventDefault();
    if (percentA <= percentB) {
      setError('Grade A percentage must be strictly higher than Grade B percentage.');
      return;
    }
    if (percentB <= percentC) {
      setError('Grade B percentage must be strictly higher than Grade C percentage.');
      return;
    }
    if (percentC <= 0) {
      setError('Grade C percentage must be greater than 0%.');
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
          gradeD: Number(salaries.gradeD ?? 0),
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
            minPercentage: percentC,
            minScore: calculatedMinC,
            maxScore: calculatedMaxC,
            numericalPoints: calculatedMinC,
          },
          gradeD: {
            minPercentage: 0,
            minScore: 0,
            maxScore: calculatedMaxD,
            numericalPoints: 0,
          },
        },
        criticalViolationGrade: 'D',
      });
      setSuccess('Grade rules saved successfully!');
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
      <div className="relative flex w-full max-w-[540px] max-h-[90vh] flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Header - Compact */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5 shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Grade Rules Master</h2>
            <p className="text-[11px] text-slate-500">Configure percentage thresholds and evaluation rules per grade.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3.5 space-y-2.5 overflow-y-auto">
          {error && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}

          {loading ? (
            <Spinner label="Loading settings…" />
          ) : (
            <form onSubmit={handleSave} className="space-y-2">
              {/* GRADE A - GREEN */}
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3.5 py-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      Grade A
                    </span>
                    <span className="text-xs font-bold text-emerald-900 truncate">
                      Score {calculatedMinA}–{totalWeight} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
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
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Top performing workers (achieving ≥ {percentages.gradeA}% of total points & max 1 absence)
                </p>
              </div>

              {/* GRADE B - YELLOW / AMBER */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3.5 py-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      Grade B
                    </span>
                    <span className="text-xs font-bold text-amber-950 truncate">
                      Score {calculatedMinB}–{calculatedMaxB} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
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
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Average performing workers ({percentages.gradeB}% to {Math.max(percentages.gradeB, percentages.gradeA - 1)}%)
                </p>
              </div>

              {/* GRADE C - RED / ORANGE */}
              <div className="rounded-lg border border-rose-200 bg-rose-50/50 px-3.5 py-2.5 shadow-xs">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                      Grade C
                    </span>
                    <span className="text-xs font-bold text-rose-950 truncate">
                      Score {calculatedMinC}–{calculatedMaxC} pts
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <label className="text-[10px] font-semibold text-slate-600">Min%:</label>
                    <div className="relative w-16">
                      <input
                        type="number"
                        min="1"
                        max={Math.max(1, (Number(percentages.gradeB) || 77) - 1)}
                        required
                        className="h-7 w-full rounded border border-rose-300 bg-white px-2 pr-4 text-xs font-bold text-rose-900 outline-none focus:border-red-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        value={percentages.gradeC}
                        onChange={(e) => setPercentages({ ...percentages, gradeC: e.target.value })}
                      />
                      <span className="pointer-events-none absolute right-1.5 top-1.5 text-[10px] font-bold text-slate-400">%</span>
                    </div>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-500">
                  Passing / lower performing workers ({percentages.gradeC}% to {Math.max(Number(percentages.gradeC) || 0, (Number(percentages.gradeB) || 0) - 1)}%)
                </p>
              </div>

              {/* GRADE D - BLACKLIST */}
              <div className="rounded-lg border border-slate-900 bg-slate-950 px-3.5 py-2.5 shadow-md text-white">
                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-black text-rose-300 border border-rose-500/30">
                      Grade D (BlackList)
                    </span>
                    <span className="text-xs font-bold text-slate-200 truncate">
                      Score below {calculatedMinC} pts
                    </span>
                  </div>

                  <div className="rounded bg-rose-950/60 px-2 py-1 text-[10px] font-bold text-rose-300 border border-rose-900/40 shrink-0">
                    Below {percentages.gradeC}%
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-rose-300/80">
                  Critical violations (alcohol, fighting) or score below {percentages.gradeC}% (BlackList)
                </p>
              </div>

              {/* Dynamic summary indicator - Compact */}
              <div className="rounded-md bg-slate-50 p-2 text-center text-[10px] text-slate-500 border border-slate-200">
                💡 <strong>{summary.totalQuestions}</strong> questions, <strong>{totalWeight} total pts</strong>. Points auto-calculate from percentages.
              </div>

              {/* Action Buttons - Compact */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving…' : 'Save Grade Rules'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}