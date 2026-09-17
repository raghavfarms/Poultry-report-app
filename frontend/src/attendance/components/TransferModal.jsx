import { Dialog } from './AdminUi.jsx';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { Alert, inputClass, secondaryButton, primaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function TransferModal({
  worker: initialWorker = null,
  currentDeployment: initialDeployment = null,
  firms = [],
  firmId = '',
  defaultDate = '',
  fallbackWorkers = [],
  onClose,
  onSuccess,
}) {
  const [currentWorker, setCurrentWorker] = useState(initialWorker);
  const [workerDeployment, setWorkerDeployment] = useState(initialDeployment);
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerDropdownOpen, setWorkerDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const [workersList, setWorkersList] = useState(() =>
    (fallbackWorkers || []).map((w) => ({
      _id: w.workerId || w._id,
      fullName: w.fullName,
      workerCode: w.workerCode,
      firm: firmId,
    }))
  );
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  const [transferType, setTransferType] = useState('SHED'); // 'SHED' or 'FARM'
  const sourceFirmId =
    currentWorker?.firm?._id ||
    (typeof currentWorker?.firm === 'string' ? currentWorker.firm : '') ||
    firmId ||
    firms[0]?._id ||
    '';

  const [destinationFirmId, setDestinationFirmId] = useState(sourceFirmId);
  const [workLocations, setWorkLocations] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationDesignationId, setDestinationDesignationId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(defaultDate || getTodayString());

  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isInterFirm = transferType === 'FARM';
  const activeTargetFirmId = isInterFirm ? destinationFirmId : sourceFirmId;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setWorkerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // 1. Load worker list for firm if no pre-selected worker or switching
  useEffect(() => {
    if (!sourceFirmId) return;
    let mounted = true;
    setLoadingWorkers(true);

    api(attendancePath('workers', { firmId: sourceFirmId, limit: 100 }))
      .then((res) => {
        if (!mounted) return;
        if (res.items && res.items.length > 0) {
          setWorkersList(res.items);
        }
      })
      .catch((err) => {
        console.warn('Worker load error:', err);
      })
      .finally(() => {
        if (mounted) setLoadingWorkers(false);
      });

    return () => {
      mounted = false;
    };
  }, [sourceFirmId]);

  // 2. Fetch worker deployment if missing
  useEffect(() => {
    const targetId = currentWorker?._id || currentWorker?.workerId;
    if (!targetId) return;
    let mounted = true;

    api(attendancePath(`workers/${targetId}/deployment`))
      .then((res) => {
        if (!mounted) return;
        if (res.deployment) {
          setWorkerDeployment(res.deployment);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [currentWorker?._id, currentWorker?.workerId]);

  // 3. Load locations and designations for target firm
  useEffect(() => {
    if (!activeTargetFirmId) return;
    let mounted = true;
    setLoadingData(true);
    setError('');

    Promise.all([
      api(attendancePath('work-locations', { firmId: activeTargetFirmId, active: true, limit: 100 })),
      api(attendancePath('designations', { firmId: activeTargetFirmId, active: true, limit: 100 })),
    ])
      .then(([locsRes, desigsRes]) => {
        if (!mounted) return;
        const locs = locsRes.items || [];
        const desigs = desigsRes.items || [];
        setWorkLocations(locs);
        setDesignations(desigs);

        const curLocId =
          workerDeployment?.workLocation?._id ||
          (typeof workerDeployment?.workLocation === 'string' ? workerDeployment.workLocation : '');

        // Pick first destination location that isn't the current location
        const filteredLocs = locs.filter((l) => String(l._id) !== String(curLocId));
        if (filteredLocs[0]) setDestinationLocationId(filteredLocs[0]._id);
        else if (locs[0]) setDestinationLocationId(locs[0]._id);

        if (desigs[0]) setDestinationDesignationId(desigs[0]._id);
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load firm masters.');
      })
      .finally(() => {
        if (mounted) setLoadingData(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTargetFirmId, workerDeployment, isInterFirm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const targetWorkerId = currentWorker?._id || currentWorker?.workerId;
    if (!targetWorkerId) {
      setError('Please select a worker to transfer.');
      return;
    }
    if (!destinationLocationId) {
      setError('Please select a destination work location / shed.');
      return;
    }
    if (isInterFirm && !destinationDesignationId) {
      setError('Please select a destination designation for inter-firm transfer.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payload = {
        toWorkLocation: destinationLocationId,
        effectiveFrom,
        reason: isInterFirm ? 'Inter-firm transfer' : 'Shed transfer',
      };
      if (isInterFirm) {
        payload.toFirmId = destinationFirmId;
        payload.toDesignation = destinationDesignationId;
      }

      await api(attendancePath(`workers/${targetWorkerId}/transfer`), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onSuccess(
        isInterFirm
          ? `Worker ${currentWorker.fullName} transferred to another firm successfully.`
          : `Worker ${currentWorker.fullName} transferred to new shed successfully.`
      );
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to execute worker transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentFirmName =
    firms.find((f) => String(f._id || f) === String(sourceFirmId))?.name ||
    workerDeployment?.firmNameSnapshot ||
    'Current Farm';
  const currentLocationName =
    workerDeployment?.workLocationNameSnapshot ||
    workerDeployment?.workLocation?.name ||
    'Unassigned';

  const filteredWorkers = workersList.filter((w) => {
    if (!workerSearch.trim()) return true;
    const q = workerSearch.toLowerCase();
    return (
      (w.fullName && w.fullName.toLowerCase().includes(q)) ||
      (w.workerCode && w.workerCode.toLowerCase().includes(q))
    );
  });

  return (
    <Dialog
      title={currentWorker ? `Transfer: ${currentWorker.fullName}` : 'Transfer Worker'}
      onClose={onClose}
      busy={submitting}
      maxWidth="330px"
    >
      <div className="w-full text-slate-800">
        {/* Worker Info or Searchable Selector */}
        {currentWorker ? (
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate">
                {currentWorker.fullName}
              </p>
              <p className="text-[11px] font-mono text-emerald-700">
                {currentWorker.workerCode}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCurrentWorker(null);
                setWorkerDeployment(null);
                setWorkerDropdownOpen(true);
              }}
              className="text-[11px] font-semibold text-cyan-600 hover:text-cyan-800 underline shrink-0 cursor-pointer"
            >
              ⇄ Change
            </button>
          </div>
        ) : (
          <div className="relative border-b border-slate-100 pb-2" ref={dropdownRef}>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Select Worker to Transfer *
            </label>
            <input
              type="text"
              placeholder="Search by name or code..."
              value={workerSearch}
              onFocus={() => setWorkerDropdownOpen(true)}
              onChange={(e) => {
                setWorkerSearch(e.target.value);
                setWorkerDropdownOpen(true);
              }}
              className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 text-xs mb-1`}
            />

            {/* Selector Trigger Button */}
            <button
              type="button"
              onClick={() => setWorkerDropdownOpen(!workerDropdownOpen)}
              className={`w-full flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-left transition cursor-pointer ${
                workerDropdownOpen
                  ? 'border-emerald-500 bg-white ring-2 ring-emerald-500/20'
                  : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            >
              <span className="truncate text-slate-700">
                {currentWorker
                  ? `${currentWorker.fullName} (${currentWorker.workerCode})`
                  : `-- Choose Worker (${filteredWorkers.length} available) --`}
              </span>
              <span className="text-slate-400 ml-1 shrink-0 text-[9px]">
                {workerDropdownOpen ? '▲' : '▼'}
              </span>
            </button>

            {/* Options Menu: Exactly 8 items visible, after that vertical scroll */}
            {workerDropdownOpen && (
              <div className="absolute left-0 right-0 z-30 mt-1 max-h-[240px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                {loadingWorkers && workersList.length === 0 ? (
                  <div className="p-2 text-center text-xs text-slate-400">Loading workers...</div>
                ) : filteredWorkers.length === 0 ? (
                  <div className="p-2 text-center text-xs text-slate-400">No matching workers found</div>
                ) : (
                  <div className="py-0.5 divide-y divide-slate-100">
                    {filteredWorkers.map((w) => {
                      const id = w._id || w.workerId;
                      const isSelected = String(currentWorker?._id || currentWorker?.workerId) === String(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setCurrentWorker(w);
                            setWorkerDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left text-xs transition cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-50 font-bold text-emerald-900'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                          style={{ minHeight: '30px' }}
                        >
                          <span className="truncate">
                            {w.fullName} <span className="font-mono text-[10px] text-slate-500">({w.workerCode})</span>
                          </span>
                          {isSelected && <span className="text-emerald-600 font-bold ml-1">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <div className="mt-2"><Alert type="error">{error}</Alert></div>}

        <form onSubmit={handleSubmit} className="mt-2 space-y-2">
          {/* Current Assignment Snapshot */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] flex flex-wrap items-center justify-between gap-1">
            <span className="text-slate-500 font-medium">Farm: <strong className="text-slate-800">{currentFirmName}</strong></span>
            <span className="text-slate-500 font-medium">Shed: <strong className="text-slate-800">{currentLocationName}</strong></span>
          </div>

          {/* Transfer Type Toggle */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Transfer Type
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTransferType('SHED')}
                className={`rounded-md py-1 px-1.5 transition text-center cursor-pointer text-xs ${
                  transferType === 'SHED'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Shed Transfer
              </button>
              <button
                type="button"
                onClick={() => setTransferType('FARM')}
                className={`rounded-md py-1 px-1.5 transition text-center cursor-pointer text-xs ${
                  transferType === 'FARM'
                    ? 'bg-white text-indigo-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inter-Farm
              </button>
            </div>
          </div>

          {/* Destination Firm (if Inter-Firm) */}
          {isInterFirm && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Destination Farm *
              </label>
              <select
                aria-label="Destination Firm"
                className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 mt-0.5 text-xs font-semibold`}
                value={destinationFirmId}
                onChange={(e) => setDestinationFirmId(e.target.value)}
              >
                {firms.map((f) => (
                  <option key={f._id || f} value={f._id || f}>
                    {f.name || f}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Destination Work Location / Shed */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Destination Shed / Location *
            </label>
            {loadingData ? (
              <span className="text-xs text-slate-400 mt-0.5 block">Loading locations…</span>
            ) : (
              <select
                aria-label="Destination Work Location"
                required
                className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 mt-0.5 text-xs font-semibold`}
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
              >
                <option value="">Select Destination Shed</option>
                {workLocations.map((loc) => (
                  <option key={loc._id} value={loc._id}>
                    {loc.name} {loc.type ? `(${loc.type})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Destination Designation (if Inter-Firm) */}
          {isInterFirm && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Destination Designation *
              </label>
              <select
                aria-label="Destination Designation"
                required
                className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 mt-0.5 text-xs font-semibold`}
                value={destinationDesignationId}
                onChange={(e) => setDestinationDesignationId(e.target.value)}
              >
                <option value="">Select Designation</option>
                {designations.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transfer Date */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Transfer Date (Effective From) *
            </label>
            <input
              type="date"
              aria-label="Transfer Date"
              required
              className={`${inputClass} !min-h-8 !h-8 !py-1 !px-2 mt-0.5 text-xs font-semibold`}
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`${secondaryButton} !min-h-7 !h-7 !px-2.5 text-xs cursor-pointer`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingData || !(currentWorker?._id || currentWorker?.workerId)}
              className={`${primaryButton} !min-h-7 !h-7 !px-3 text-xs cursor-pointer`}
            >
              {submitting ? 'Transferring…' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
