import { Dialog } from './AdminUi.jsx';
import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Alert, inputClass, secondaryButton, primaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

function getTodayString() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

export default function TransferModal({ worker, currentDeployment, firms = [], onClose, onSuccess }) {
  const [transferType, setTransferType] = useState('SHED'); // 'SHED' or 'FARM'
  const [destinationFirmId, setDestinationFirmId] = useState(worker.firm?._id || worker.firm || '');
  const [workLocations, setWorkLocations] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [destinationDesignationId, setDestinationDesignationId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(getTodayString());

  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const sourceFirmId = worker.firm?._id || worker.firm;
  const isInterFirm = transferType === 'FARM';

  // If Shed transfer, destination firm is always source firm
  const activeTargetFirmId = isInterFirm ? destinationFirmId : sourceFirmId;

  // Load locations and designations for active target firm
  useEffect(() => {
    if (!activeTargetFirmId) return;
    setLoadingData(true);
    setError('');

    Promise.all([
      api(attendancePath('work-locations', { firmId: activeTargetFirmId, active: true, limit: 100 })),
      api(attendancePath('designations', { firmId: activeTargetFirmId, active: true, limit: 100 })),
    ])
      .then(([locsRes, desigsRes]) => {
        const locs = locsRes.items || [];
        const desigs = desigsRes.items || [];
        setWorkLocations(locs);
        setDesignations(desigs);

        // Pick first destination location that isn't the current location
        const filteredLocs = locs.filter((l) => l._id !== (currentDeployment?.workLocation?._id || currentDeployment?.workLocation));
        if (filteredLocs[0]) setDestinationLocationId(filteredLocs[0]._id);
        else if (locs[0]) setDestinationLocationId(locs[0]._id);

        if (desigs[0]) setDestinationDesignationId(desigs[0]._id);
      })
      .catch((err) => setError(err.message || 'Failed to load firm masters.'))
      .finally(() => setLoadingData(false));
  }, [activeTargetFirmId, currentDeployment, isInterFirm]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!destinationLocationId) {
      setError('Please select a destination work location.');
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

      await api(attendancePath(`workers/${worker._id}/transfer`), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      onSuccess(
        isInterFirm
          ? `Worker ${worker.fullName} transferred to another firm successfully.`
          : `Worker ${worker.fullName} transferred to new shed successfully.`
      );
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to execute worker transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentFirmName =
    firms.find((f) => f._id === sourceFirmId)?.name || currentDeployment?.firmNameSnapshot || 'Current Firm';
  const currentLocationName =
    currentDeployment?.workLocationNameSnapshot || currentDeployment?.workLocation?.name || 'Unassigned';

  return (
    <Dialog title="Transfer worker" onClose={onClose} busy={submitting} maxWidth="390px">
      <div className="w-full">
        {/* Worker Info */}
        <p className="text-xs text-slate-500 font-medium">
          {worker.fullName} · <span className="font-semibold text-slate-700">{worker.workerCode}</span>
        </p>

        {error && <div className="mt-2"><Alert type="error">{error}</Alert></div>}

        <form onSubmit={handleSubmit} className="mt-2.5 space-y-2.5">
          {/* Current Assignment Snapshot */}
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs flex flex-wrap items-center justify-between gap-1">
            <span className="text-slate-500 font-medium">Firm: <strong className="text-slate-800">{currentFirmName}</strong></span>
            <span className="text-slate-500 font-medium">Shed: <strong className="text-slate-800">{currentLocationName}</strong></span>
          </div>

          {/* Transfer Type Toggle */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Transfer Type
            </label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTransferType('SHED')}
                className={`rounded-md py-1.5 px-2 transition text-center ${
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
                className={`rounded-md py-1.5 px-2 transition text-center ${
                  transferType === 'FARM'
                    ? 'bg-white text-indigo-800 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Inter-Farm Transfer
              </button>
            </div>
          </div>

          {/* Destination Firm (if Inter-Firm) */}
          {isInterFirm && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Destination Firm *
              </label>
              <select
                aria-label="Destination Firm"
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2.5 mt-1 text-xs font-semibold`}
                value={destinationFirmId}
                onChange={(e) => setDestinationFirmId(e.target.value)}
              >
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Destination Work Location / Shed */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Destination Work Location / Shed *
            </label>
            {loadingData ? (
              <span className="text-xs text-slate-400 mt-1 block">Loading locations…</span>
            ) : (
              <select
                aria-label="Destination Work Location"
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2.5 mt-1 text-xs font-semibold`}
                value={destinationLocationId}
                onChange={(e) => setDestinationLocationId(e.target.value)}
              >
                <option value="">Select Destination Location</option>
                {workLocations.map((loc) => (
                  <option key={loc._id} value={loc._id}>
                    {loc.name} ({loc.type})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Destination Designation (if Inter-Firm) */}
          {isInterFirm && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Destination Designation *
              </label>
              <select
                aria-label="Destination Designation"
                className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2.5 mt-1 text-xs font-semibold`}
                value={destinationDesignationId}
                onChange={(e) => setDestinationDesignationId(e.target.value)}
              >
                <option value="">Select Destination Designation</option>
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
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Transfer Date *
            </label>
            <input
              type="date"
              aria-label="Transfer Date"
              required
              className={`${inputClass} !min-h-9 !h-9 !py-1 !px-2.5 mt-1 text-xs font-semibold`}
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
              className={`${secondaryButton} !min-h-8 !h-8 !px-3 text-xs`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingData}
              className={`${primaryButton} !min-h-8 !h-8 !px-3.5 text-xs`}
            >
              {submitting ? 'Transferring…' : 'Confirm Transfer'}
            </button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
