import { useState, useEffect } from 'react';
import { getQuestions, createQuestion, updateQuestion, deleteQuestion, translateQuestion } from '../services/performanceApi.js';
import { Spinner, Alert, inputClass, primaryButton, secondaryButton } from '../../components/Ui.jsx';

export default function QuestionsMasterModal({ isOpen, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Form State
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    questionText: '',
    displayOrder: '',
    weight: '',
    isCriticalViolation: false,
    firmApplicability: 'ALL',
    appliesToHalfDay: true,
  });
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);

  // Close 3-dots menu on outside click
  useEffect(() => {
    const handleOutsideClick = () => setOpenMenuId(null);
    if (openMenuId) {
      document.addEventListener('click', handleOutsideClick);
      return () => document.removeEventListener('click', handleOutsideClick);
    }
  }, [openMenuId]);

  const fetchQuestionsList = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getQuestions({ includeInactive: 'true' });
      setQuestions(res.questions || []);
    } catch (err) {
      setError(err.message || 'Failed to load questions.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQuestionsList();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditingId(null);
    setFormData({
      questionText: '',
      displayOrder: '',
      weight: '',
      isCriticalViolation: false,
      firmApplicability: 'ALL',
      appliesToHalfDay: true,
    });
    setSuccess('');
    setError('');
    setTranslating(false);
  };

  const handleEditClick = (q) => {
    setEditingId(q._id);
    setFormData({
      questionText: q.questionText || '',
      displayOrder: q.displayOrder !== undefined && q.displayOrder !== null ? String(q.displayOrder) : '',
      weight: q.weight !== undefined && q.weight !== null ? String(q.weight) : '',
      isCriticalViolation: Boolean(q.isCriticalViolation),
      firmApplicability: q.firmApplicability || 'ALL',
      appliesToHalfDay: q.appliesToHalfDay !== false,
    });
  };

  // Convert Hinglish / English to Hindi Devanagari on button click (safely preserving terms like 'AI')
  const handleAutoTranslate = async () => {
    const text = formData.questionText.trim();
    if (!text) return;
    setTranslating(true);
    setError('');
    try {
      const res = await translateQuestion(text);
      if (res?.text) {
        setFormData((prev) => ({ ...prev, questionText: res.text }));
      }
    } catch (_) {
      // Keep original text
    } finally {
      setTranslating(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const textToSave = formData.questionText.trim();
    if (!textToSave) {
      setError('Question text is required.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...formData,
        questionText: textToSave,
        displayOrder: formData.displayOrder !== '' && !isNaN(Number(formData.displayOrder)) 
          ? Number(formData.displayOrder) 
          : questions.length + 1,
        weight: formData.weight !== '' && !isNaN(Number(formData.weight)) 
          ? Number(formData.weight) 
          : 1,
        appliesToHalfDay: true,
      };

      if (editingId) {
        await updateQuestion(editingId, payload);
        setSuccess('Question updated successfully.');
      } else {
        await createQuestion(payload);
        setSuccess('Question added successfully.');
      }
      resetForm();
      await fetchQuestionsList();
    } catch (err) {
      setError(err.message || 'Failed to save question.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (q) => {
    try {
      await updateQuestion(q._id, { active: !q.active });
      await fetchQuestionsList();
    } catch (err) {
      setError(err.message || 'Failed to change question status.');
    }
  };

  const handleDeletePermanently = async (q) => {
    setOpenMenuId(null);
    if (!window.confirm(`Are you sure you want to permanently delete this question?\n\n"${q.questionText}"`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await deleteQuestion(q._id);
      setSuccess('Question permanently deleted from database.');  ;
      await fetchQuestionsList();
    } catch (err) {
      setError(err.message || 'Failed to delete question.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Questions Master</h2>
            <p className="text-xs text-slate-500">Configure daily evaluation questions, weights & critical violations.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && <Alert type="error">{error}</Alert>}
          {success && <Alert type="success">{success}</Alert>}

          {/* Form */}
          <form onSubmit={handleSave} className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                {editingId ? 'Edit Question' : 'Add New Question'}
              </h3>
              {editingId && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                  Editing Mode
                </span>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">
                  Question Text <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 hidden sm:inline">
                    (You can type Hindi, English, or mix like &quot;AI time se shuru hui&quot;)
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoTranslate}
                    disabled={translating || !formData.questionText.trim()}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 transition cursor-pointer"
                    title="Click to convert Hinglish text to Hindi while keeping English terms like AI as-is"
                  >
                    <span>🇮🇳</span>
                    <span>{translating ? 'Converting…' : 'Translate to Hindi'}</span>
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  className="h-8.5 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                  placeholder="e.g. AI टाइम से शुरू हुई? / AI time se shuru hui?"
                  value={formData.questionText}
                  onChange={(e) => setFormData({ ...formData, questionText: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Display Order</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Order #"
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData({ ...formData, displayOrder: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Weight / Points</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Points"
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                  value={formData.weight}
                  onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Firm</label>
                <select
                  className="h-8 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-200"
                  value={formData.firmApplicability}
                  onChange={(e) => setFormData({ ...formData, firmApplicability: e.target.value })}
                >
                  <option value="ALL">Both / All Farms</option>
                  <option value="RAGHAV">Raghav Only</option>
                  <option value="SANJANA">Sanjana Only</option>
                </select>
              </div>

              <div className="flex h-8 items-center px-1">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500"
                    checked={formData.isCriticalViolation}
                    onChange={(e) => setFormData({ ...formData, isCriticalViolation: e.target.checked })}
                  />
                  <span className="text-red-600 font-bold">Critical Violation</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-emerald-600 px-3.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : editingId ? 'Update Question' : 'Add Question'}
              </button>
            </div>
          </form>

          {/* Questions Table */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-slate-800">
              Active & Configured Questions ({questions.length})
            </h3>
            {loading ? (
              <Spinner label="Loading questions…" />
            ) : questions.length === 0 ? (
              <p className="text-sm text-slate-500">No questions found.</p>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-3 py-3 w-10 text-center">#</th>
                      <th className="px-4 py-3">Question (Hindi)</th>
                      <th className="px-3 py-3 text-center">Order</th>
                      <th className="px-3 py-3 text-center">Weight</th>
                      <th className="px-3 py-3 text-center">Critical</th>
                      <th className="px-3 py-3 text-center">Firm</th>
                      <th className="px-3 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {questions.map((q, idx) => (
                      <tr key={q._id} className={!q.active ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50/70'}>
                        <td className="px-3 py-3 text-center font-bold text-slate-500 text-xs">{idx + 1}</td>
                        <td className="px-4 py-3 font-bold text-slate-900 text-sm">{q.questionText}</td>
                        <td className="px-3 py-3 text-center font-bold text-slate-700">{q.displayOrder}</td>
                        <td className="px-3 py-3 text-center font-bold">{q.weight || 1}</td>
                        <td className="px-3 py-3 text-center">
                          {q.isCriticalViolation ? (
                            <span className="inline-block rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              Critical
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                            {q.firmApplicability}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              q.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {q.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="relative px-4 py-2.5 text-right">
                          <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === q._id ? null : q._id)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-800"
                              title="Actions"
                            >
                              <span className="text-sm font-black leading-none">⋮</span>
                            </button>

                            {openMenuId === q._id && (
                              <div
                                className={`absolute right-0 z-30 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl ${
                                  idx >= Math.max(0, questions.length - 2)
                                    ? 'bottom-full mb-1'
                                    : 'top-full mt-1'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleEditClick(q);
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                                >
                                  <span className="text-emerald-600 font-bold">✎</span>
                                  <span>Edit Question</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    handleToggleActive(q);
                                  }}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold transition ${
                                    q.active
                                      ? 'text-amber-700 hover:bg-amber-50'
                                      : 'text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                >
                                  <span className="font-bold">{q.active ? '⏸' : '▶'}</span>
                                  <span>{q.active ? 'Deactivate' : 'Activate'}</span>
                                </button>

                                <div className="my-1 border-t border-slate-100" />

                                <button
                                  type="button"
                                  onClick={() => handleDeletePermanently(q)}
                                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                                >
                                  <span className="font-bold">🗑</span>
                                  <span>Delete Question</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 px-6 py-3">
          <button onClick={onClose} className={secondaryButton}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
