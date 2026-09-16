import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import { Alert, Spinner, inputClass } from '../components/Ui.jsx';
import WorkersPanel from '../attendance/components/WorkersPanel.jsx';
import DeploymentPanel from '../attendance/components/DeploymentPanel.jsx';
import MastersPanel from '../attendance/components/MastersPanel.jsx';
import AuditLogPanel from '../attendance/components/AuditLogPanel.jsx';
import { attendancePath } from '../attendance/services/adminApi.js';

export default function AttendanceAdminPage() {
  const { user } = useAuth();
  const canTransferOrDeploy = ['admin', 'developer', 'office', 'supervisor', 'security', 'farm_incharge'].includes(user?.role);

  const [firms, setFirms] = useState([]);
  const [firmId, setFirmId] = useState('');
  const [tab, setTab] = useState('workers');
  const [capacityData, setCapacityData] = useState(null);
  const [loadingFirms, setLoadingFirms] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);

  // Load authorized firms for attendance
  useEffect(() => {
    setLoadingFirms(true);
    api(attendancePath('firms'))
      .then(({ firms: list = [] }) => {
        setFirms(list);
        if (list[0]) setFirmId(list[0]._id);
      })
      .catch((err) => setError(err.message || 'Failed to load firms.'))
      .finally(() => setLoadingFirms(false));
  }, []);

  // Load firm bird capacity summary
  useEffect(() => {
    if (!firmId) {
      setCapacityData(null);
      return;
    }
    api(attendancePath('capacity', { firmId }))
      .then((data) => setCapacityData(data))
      .catch(() => setCapacityData(null));
  }, [firmId, revision]);

  const handleChanged = (message) => {
    setNotice(message);
    setRevision((prev) => prev + 1);
    setTimeout(() => setNotice(''), 6000);
  };

  const activeFirm = firms.find((f) => f._id === firmId);

  return (
    <div className="attendance-page space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">
            Attendance Administration
          </p>
          <h1 className="mt-0.5 text-xl font-black text-slate-900 sm:text-2xl">
            Worker & Shed Management
          </h1>
        </div>

        {/* Firm Selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500">
            Firm:
          </label>
          {loadingFirms ? (
            <Spinner />
          ) : (
            <select
              aria-label="Select Firm"
              className={`${inputClass} !min-h-9 w-full sm:!w-48 !rounded-xl !py-1 text-sm font-semibold text-slate-800`}
              value={firmId}
              onChange={(e) => setFirmId(e.target.value)}
            >
              {firms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <Alert>{error}</Alert>
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 shadow-2xs">
          ✓ {notice}
        </div>
      )}

      {/* Bird Capacity Summary Widget */}
      {capacityData?.firms?.[0] && (
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/70 to-cyan-50/40 p-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                {activeFirm?.name} · Shed Capacity Summary
              </p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-2xl font-black text-slate-900">
                  {capacityData.firms[0].birdCapacity?.total?.toLocaleString('en-IN') || 0}
                  <span className="ml-1 text-xs font-normal text-slate-500">total birds</span>
                </span>
                <span className="text-sm font-medium text-slate-600">
                  Male: {capacityData.firms[0].birdCapacity?.male?.toLocaleString('en-IN') || 0}
                </span>
                <span className="text-sm font-medium text-slate-600">
                  Female: {capacityData.firms[0].birdCapacity?.female?.toLocaleString('en-IN') || 0}
                </span>
              </div>
            </div>
            <div className="text-left sm:text-right text-xs text-slate-500 border-t border-emerald-200/50 pt-2 sm:border-0 sm:pt-0">
              <p>
                <span className="font-semibold text-slate-700">
                  {capacityData.firms[0].shedCount}
                </span>{' '}
                active sheds ({capacityData.firms[0].configuredSheds} configured)
              </p>
              {!capacityData.firms[0].capacityComplete && (
                <p className="mt-0.5 font-medium text-amber-700">
                  ⚠️ {capacityData.firms[0].unconfiguredSheds} shed(s) missing capacity
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="attendance-tabs no-print border-b border-slate-200">
        {[
          ['workers', '👤 Workers'],
          ...(canTransferOrDeploy ? [['deployments', '📍 Deployments']] : []),
          ['work-locations', '🏠 Sheds & Locations'],
          ['designations', '🏷️ Designations'],
          ['audit', '📜 Audit History'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`whitespace-nowrap border-b-2 px-5 py-2.5 text-sm font-bold transition ${
              tab === key
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {tab === 'workers' && (
        <WorkersPanel key={firmId} firmId={firmId} firms={firms} revision={revision} onChanged={handleChanged} />
      )}

      {tab === 'deployments' && canTransferOrDeploy && (
        <DeploymentPanel key={firmId} firmId={firmId} revision={revision} />
      )}

      {tab === 'work-locations' && (
        <MastersPanel
          key={`${firmId}-${tab}`}
          kind="work-locations"
          firmId={firmId}
          revision={revision}
          onChanged={handleChanged}
        />
      )}

      {tab === 'designations' && (
        <MastersPanel
          kind="designations"
          firmId={firmId}
          revision={revision}
          onChanged={handleChanged}
        />
      )}

      {tab === 'audit' && (
        <AuditLogPanel key={firmId} firmId={firmId} firms={firms} />
      )}
    </div>
  );
}

