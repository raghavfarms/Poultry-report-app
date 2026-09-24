import { useState, useEffect } from 'react';
import {
  fetchIssues,
  createIssueApi,
  fetchFefoRecommendations,
} from '../api/issueApi.js';
import { fetchMedicines } from '../api/medicineApi.js';
import { api } from '../../api/client.js';

const PURPOSE_BADGES = {
  ROUTINE_VACCINATION: 'bg-blue-50 text-blue-700 border-blue-200',
  TREATMENT: 'bg-rose-50 text-rose-700 border-rose-200',
  GROWTH_SUPPLEMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  WATER_SANITIZATION: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  BIOSECURITY: 'bg-purple-50 text-purple-700 border-purple-200',
  OTHER: 'bg-slate-50 text-slate-700 border-slate-200',
};

const EXPIRY_BADGES = {
  VALID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  EXPIRING_60_DAYS: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  EXPIRING_30_DAYS: 'bg-orange-50 text-orange-700 border-orange-200',
  EXPIRED: 'bg-rose-50 text-rose-700 border-rose-200 font-bold',
};

export default function MedicineIssuePage() {
  // Data states
  const [issues, setIssues] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [firms, setFirms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedFarm, setSelectedFarm] = useState('');
  const [selectedMedicine, setSelectedMedicine] = useState('');
  const [selectedPurpose, setSelectedPurpose] = useState('');
  const [shedFilter, setShedFilter] = useState('');

  // Modal & Form States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDetailIssue, setSelectedDetailIssue] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Issue Form State
  const [formFarm, setFormFarm] = useState('');
  const [formMedicine, setFormMedicine] = useState('');
  const [formBatch, setFormBatch] = useState('');
  const [formShed, setFormShed] = useState('');
  const [formFlock, setFormFlock] = useState('');
  const [formBirdCount, setFormBirdCount] = useState('');
  const [formBirdAgeDays, setFormBirdAgeDays] = useState('');
  const [formQty, setFormQty] = useState('');
  const [formPurpose, setFormPurpose] = useState('TREATMENT');
  const [formDosage, setFormDosage] = useState('');
  const [formIssuedTo, setFormIssuedTo] = useState('');
  const [formIssueDate, setFormIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [formRemarks, setFormRemarks] = useState('');

  // FEFO Recommendations State
  const [fefoBatches, setFefoBatches] = useState([]);
  const [loadingFefo, setLoadingFefo] = useState(false);

  // 1. Load Dropdowns
  useEffect(() => {
    async function loadDropdowns() {
      try {
        const [medData, firmData] = await Promise.all([
          fetchMedicines({ includeInactive: false }),
          api('/firms'),
        ]);
        setMedicines(medData.medicines || []);
        setFirms(firmData.firms || []);
      } catch (err) {
        console.error('Failed to load dropdowns', err);
      }
    }
    loadDropdowns();
  }, []);

  // 2. Load Issues List
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchIssues({
        search,
        farm: selectedFarm,
        medicine: selectedMedicine,
        purpose: selectedPurpose,
        shed: shedFilter,
      });
      setIssues(data.issues || []);
    } catch (err) {
      setError(err.message || 'Failed to load medicine issues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, selectedFarm, selectedMedicine, selectedPurpose, shedFilter]);

  // 3. Load FEFO Recommendations when Farm or Medicine changes in Create Modal
  useEffect(() => {
    if (!formMedicine || !formFarm) {
      setFefoBatches([]);
      setFormBatch('');
      return;
    }

    async function loadRecommendations() {
      try {
        setLoadingFefo(true);
        const data = await fetchFefoRecommendations(formMedicine, formFarm);
        const batches = data.recommendations || [];
        setFefoBatches(batches);

        // Auto-select FEFO recommended batch if available
        const recommended = batches.find((b) => b.isFefoRecommended);
        if (recommended) {
          setFormBatch(recommended._id);
        } else if (batches.length > 0) {
          setFormBatch(batches[0]._id);
        } else {
          setFormBatch('');
        }
      } catch (err) {
        console.error('Failed to fetch FEFO recommendations', err);
        setFefoBatches([]);
      } finally {
        setLoadingFefo(false);
      }
    }

    loadRecommendations();
  }, [formMedicine, formFarm]);

  // Reset form
  const handleOpenCreateModal = () => {
    setFormFarm(firms[0]?._id || '');
    setFormMedicine(medicines[0]?._id || '');
    setFormBatch('');
    setFormShed('');
    setFormFlock('');
    setFormBirdCount('');
    setFormBirdAgeDays('');
    setFormQty('');
    setFormPurpose('TREATMENT');
    setFormDosage('');
    setFormIssuedTo('');
    setFormIssueDate(new Date().toISOString().slice(0, 10));
    setFormRemarks('');
    setError('');
    setIsModalOpen(true);
  };

  // Submit Issue
  const handleSubmitIssue = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      setError('');

      const selectedBatchObj = fefoBatches.find((b) => b._id === formBatch);
      if (!selectedBatchObj) {
        throw new Error('Please select a valid batch with available stock');
      }

      if (Number(formQty) > selectedBatchObj.quantityAvailable) {
        throw new Error(
          `Requested quantity (${formQty}) exceeds available batch stock (${selectedBatchObj.quantityAvailable})`
        );
      }

      await createIssueApi({
        medicineId: formMedicine,
        batchId: formBatch,
        farmId: formFarm,
        shed: formShed,
        flockNumber: formFlock,
        birdCount: formBirdCount ? Number(formBirdCount) : 0,
        birdAgeDays: formBirdAgeDays ? Number(formBirdAgeDays) : 0,
        issuedQuantity: Number(formQty),
        purpose: formPurpose,
        dosageInstructions: formDosage,
        issuedTo: formIssuedTo,
        issueDate: formIssueDate,
        remarks: formRemarks,
      });

      setSuccessMsg(`Stock issued successfully from Batch ${selectedBatchObj.batchNumber}!`);
      setTimeout(() => setSuccessMsg(''), 4500);
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to issue medicine');
    } finally {
      setSubmitting(false);
    }
  };

  // Currently selected batch object
  const activeBatch = fefoBatches.find((b) => b._id === formBatch);
  const selectedMed = medicines.find((m) => m._id === formMedicine);

  return (
    <div className="space-y-4">
      {/* 1. Header Card with Summary Metrics */}
      <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
              Medicine Issues & Consumption
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-blue-100 text-blue-800 rounded-full border border-blue-200">
              ⚡ FEFO Powered
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Issue stock to sheds and flocks following First-Expiry, First-Out principles
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-lg shadow-xs transition flex items-center justify-center gap-2 text-sm"
        >
          <span className="text-lg leading-none">+</span> Issue Medicine (FEFO)
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
          ✓ {successMsg}
        </div>
      )}
      {error && !isModalOpen && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
          ⚠ {error}
        </div>
      )}

      {/* 2. Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        {/* Search */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Search
          </label>
          <input
            type="text"
            placeholder="Issue #, Batch, Recipient..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>

        {/* Farm Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Farm
          </label>
          <select
            value={selectedFarm}
            onChange={(e) => setSelectedFarm(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Farms</option>
            {firms.map((f) => (
              <option key={f._id} value={f._id}>
                {f.name} ({f.code})
              </option>
            ))}
          </select>
        </div>

        {/* Medicine Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Medicine
          </label>
          <select
            value={selectedMedicine}
            onChange={(e) => setSelectedMedicine(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Medicines</option>
            {medicines.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name} ({m.code})
              </option>
            ))}
          </select>
        </div>

        {/* Purpose Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Purpose
          </label>
          <select
            value={selectedPurpose}
            onChange={(e) => setSelectedPurpose(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          >
            <option value="">All Purposes</option>
            <option value="ROUTINE_VACCINATION">Routine Vaccination</option>
            <option value="TREATMENT">Treatment</option>
            <option value="GROWTH_SUPPLEMENT">Growth Supplement</option>
            <option value="WATER_SANITIZATION">Water Sanitization</option>
            <option value="BIOSECURITY">Biosecurity</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {/* Shed Filter */}
        <div>
          <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
            Shed / Pen
          </label>
          <input
            type="text"
            placeholder="e.g. Shed 1"
            value={shedFilter}
            onChange={(e) => setShedFilter(e.target.value)}
            className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* 3. Issues List Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Loading medicine issues...
          </div>
        ) : issues.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No medicine issues found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-3">Issue # & Date</th>
                  <th className="py-2.5 px-3">Farm & Target Shed</th>
                  <th className="py-2.5 px-3">Medicine & Deducted Batch</th>
                  <th className="py-2.5 px-3 text-right">Issued Qty</th>
                  <th className="py-2.5 px-3">Purpose & Dosage</th>
                  <th className="py-2.5 px-3">Recipient & Issuer</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {issues.map((iss) => (
                  <tr key={iss._id} className="hover:bg-slate-50/70 transition">
                    {/* Issue # & Date */}
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-emerald-700">
                        {iss.issueNumber}
                      </span>
                      <div className="text-[10px] text-slate-500">{iss.issueDate}</div>
                    </td>

                    {/* Farm & Shed */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">
                        {iss.farm?.name || 'Unknown Farm'}
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        📍 {iss.shed} {iss.flockNumber ? `• ${iss.flockNumber}` : ''}
                      </div>
                      {iss.birdCount > 0 && (
                        <div className="text-[10px] text-slate-400">
                          {iss.birdCount.toLocaleString()} birds
                          {iss.birdAgeDays > 0 ? ` (Age: ${iss.birdAgeDays}d)` : ''}
                        </div>
                      )}
                    </td>

                    {/* Medicine & Batch */}
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-800">
                        {iss.medicine?.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-600 flex items-center gap-1.5 mt-0.5">
                        <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-[10px]">
                          Batch: {iss.batchNumber}
                        </span>
                        {iss.batch?.expiryDate && (
                          <span className="text-[10px] text-slate-400">
                            Exp: {iss.batch.expiryDate}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Issued Qty */}
                    <td className="py-2.5 px-3 text-right">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {iss.issuedQuantity}
                      </span>{' '}
                      <span className="text-[10px] text-slate-500 font-medium">
                        {iss.unit}
                      </span>
                    </td>

                    {/* Purpose & Dosage */}
                    <td className="py-2.5 px-3 max-w-[200px]">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          PURPOSE_BADGES[iss.purpose] || PURPOSE_BADGES.OTHER
                        }`}
                      >
                        {iss.purpose?.replace(/_/g, ' ')}
                      </span>
                      {iss.dosageInstructions && (
                        <div className="text-[11px] text-slate-600 truncate mt-0.5" title={iss.dosageInstructions}>
                          💊 {iss.dosageInstructions}
                        </div>
                      )}
                    </td>

                    {/* Recipient & Issuer */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-700">{iss.issuedTo}</div>
                      <div className="text-[10px] text-slate-400">
                        By: {iss.issuedBy?.name || iss.issuedBy?.username}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedDetailIssue(iss)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. MODAL: + Issue Medicine (FEFO) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span>💉</span> Issue Medicine to Shed / Flock
                </h3>
                <p className="text-[11px] text-slate-500">
                  Select farm and medicine to view FEFO batch recommendations
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitIssue} className="p-4 overflow-y-auto space-y-3.5">
              {error && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-semibold">
                  ⚠ {error}
                </div>
              )}

              {/* Row 1: Farm & Medicine */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Select Farm *
                  </label>
                  <select
                    value={formFarm}
                    onChange={(e) => setFormFarm(e.target.value)}
                    required
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Farm...</option>
                    {firms.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} ({f.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Select Medicine *
                  </label>
                  <select
                    value={formMedicine}
                    onChange={(e) => setFormMedicine(e.target.value)}
                    required
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">Select Medicine...</option>
                    {medicines.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.code}) — {m.unit}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* FEFO BATCH SELECTION BANNER */}
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                    ⭐ FEFO Batch Selection (Earliest Expiry First)
                  </span>
                  {loadingFefo && (
                    <span className="text-[10px] text-amber-700 animate-pulse">
                      Checking shelf stock...
                    </span>
                  )}
                </div>

                {fefoBatches.length === 0 ? (
                  <div className="text-[11px] text-amber-800 py-1">
                    {formFarm && formMedicine
                      ? '⚠️ No available stock found for this medicine at this farm. Please check receipts.'
                      : 'Please select both Farm and Medicine to see available stock.'}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Batch Radio Options */}
                    {fefoBatches.map((batch) => {
                      const isSelected = formBatch === batch._id;
                      return (
                        <div
                          key={batch._id}
                          onClick={() => setFormBatch(batch._id)}
                          className={`p-2 rounded border cursor-pointer transition flex items-center justify-between text-xs ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-500 shadow-xs ring-1 ring-emerald-400'
                              : 'bg-white border-slate-200 hover:border-emerald-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="fefoBatch"
                              checked={isSelected}
                              onChange={() => setFormBatch(batch._id)}
                              className="text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                            />
                            <div>
                              <span className="font-mono font-bold text-slate-800">
                                {batch.batchNumber}
                              </span>
                              {batch.isFefoRecommended && (
                                <span className="ml-2 px-1.5 py-0.2 text-[9px] font-bold bg-emerald-600 text-white rounded">
                                  FIRST EXPIRY (RECOMMENDED)
                                </span>
                              )}
                              <div className="text-[10px] text-slate-500">
                                Expiry: <strong>{batch.expiryDate}</strong> ({batch.daysLeft} days left)
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="font-bold text-emerald-800 font-mono text-sm">
                              {batch.quantityAvailable}
                            </span>{' '}
                            <span className="text-[10px] text-slate-500">
                              {selectedMed?.unit || 'units'} available
                            </span>
                            <div>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                  EXPIRY_BADGES[batch.expiryStatus]
                                }`}
                              >
                                {batch.expiryStatus}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Row 2: Target Shed & Flock */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Target Shed / Pen *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shed 1, Brooder Shed A"
                    value={formShed}
                    onChange={(e) => setFormShed(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Flock # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Flock 2026-B"
                    value={formFlock}
                    onChange={(e) => setFormFlock(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 3: Bird Count & Bird Age */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Birds Treated (Count)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 10000"
                    value={formBirdCount}
                    onChange={(e) => setFormBirdCount(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Bird Age (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 14 (Day 14 vaccine)"
                    value={formBirdAgeDays}
                    onChange={(e) => setFormBirdAgeDays(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 4: Quantity to Issue & Purpose */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Issued Quantity *{' '}
                    {activeBatch && (
                      <span className="text-emerald-700 font-bold normal-case">
                        (Max {activeBatch.quantityAvailable} {selectedMed?.unit})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    max={activeBatch?.quantityAvailable || 999999}
                    placeholder="e.g. 5"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-800 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Purpose *
                  </label>
                  <select
                    value={formPurpose}
                    onChange={(e) => setFormPurpose(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="TREATMENT">Treatment</option>
                    <option value="ROUTINE_VACCINATION">Routine Vaccination</option>
                    <option value="GROWTH_SUPPLEMENT">Growth Supplement</option>
                    <option value="WATER_SANITIZATION">Water Sanitization</option>
                    <option value="BIOSECURITY">Biosecurity</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              {/* Row 5: Dosage Instructions */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Dosage Instructions
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1ml per 5 litres drinking water for 3 consecutive days"
                  value={formDosage}
                  onChange={(e) => setFormDosage(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Row 6: Recipient & Issue Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Issued To (Recipient Name) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Supervisor Ramesh / Flocker Suresh"
                    value={formIssuedTo}
                    onChange={(e) => setFormIssuedTo(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                    Issue Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formIssueDate}
                    onChange={(e) => setFormIssueDate(e.target.value)}
                    className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                  Remarks / Observations
                </label>
                <input
                  type="text"
                  placeholder="e.g. Birds showed mild sneezing symptoms"
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  className="w-full h-8 px-2.5 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 h-8 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formBatch}
                  className="px-4 h-8 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition disabled:opacity-50"
                >
                  {submitting ? 'Deducting Stock...' : '✓ Confirm & Issue Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: Issue Details */}
      {selectedDetailIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800">
                Issue Voucher: {selectedDetailIssue.issueNumber}
              </h3>
              <button
                onClick={() => setSelectedDetailIssue(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[10px]">Farm</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetailIssue.farm?.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Target Shed</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetailIssue.shed}{' '}
                    {selectedDetailIssue.flockNumber ? `(${selectedDetailIssue.flockNumber})` : ''}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Medicine</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDetailIssue.medicine?.name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Deducted Batch</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedDetailIssue.batchNumber}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Issued Quantity</span>
                  <span className="font-bold text-emerald-700 text-sm">
                    {selectedDetailIssue.issuedQuantity} {selectedDetailIssue.unit}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Purpose</span>
                  <span
                    className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                      PURPOSE_BADGES[selectedDetailIssue.purpose] || PURPOSE_BADGES.OTHER
                    }`}
                  >
                    {selectedDetailIssue.purpose?.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {selectedDetailIssue.dosageInstructions && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-900">
                  <span className="font-bold block text-[10px] uppercase">Dosage Instructions</span>
                  {selectedDetailIssue.dosageInstructions}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-slate-400 text-[10px] block">Issued To</span>
                  <strong>{selectedDetailIssue.issuedTo}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Issued By</span>
                  <strong>{selectedDetailIssue.issuedBy?.name || selectedDetailIssue.issuedBy?.username}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Issue Date</span>
                  <span>{selectedDetailIssue.issueDate}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Recorded Timestamp</span>
                  <span>{new Date(selectedDetailIssue.createdAt).toLocaleString()}</span>
                </div>
              </div>

              {selectedDetailIssue.remarks && (
                <div className="pt-2 border-t border-slate-100 text-slate-500 italic">
                  Remarks: {selectedDetailIssue.remarks}
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedDetailIssue(null)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-medium transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
