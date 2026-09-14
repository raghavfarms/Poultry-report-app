import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Alert, Field, inputClass, compactInputClass, primaryButton, secondaryButton, Spinner } from '../../components/Ui.jsx';
import { attendancePath, saveAttendance, uploadWorkerPhoto, deleteWorker } from '../services/adminApi.js';
import {
  useAttendanceData,
  useDebounced,
  LoadState,
  Pager,
  Dialog,
  RemoteSelect,
  WorkerPhoto,
  Status,
  dateTime,
  panelClass,
  cellClass,
} from './AdminUi.jsx';
import { InitialDeploymentForm, DeploymentTable } from './DeploymentPanel.jsx';
import FaceRegistrationModal from './FaceRegistrationModal.jsx';
import TransferModal from './TransferModal.jsx';

function PrivateDetailsSection({ form, set }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-1.5 sm:p-2">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left text-[11px] font-semibold text-slate-700"
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>Aadhaar & Bank Details (Confidential)</span>
        <span className="text-[10px] font-normal text-slate-500">{open ? '▲ Hide' : '▼ View / Edit'}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 pt-1.5 border-t border-slate-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5">
            <Field label="Aadhaar Number">
              <input
                type="text"
                maxLength={12}
                placeholder="12 digits (starts 2-9)"
                className={compactInputClass}
                value={form.aadhaarNumber || ''}
                onChange={(e) => set('aadhaarNumber', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label="Account Holder Name">
              <input
                type="text"
                maxLength={120}
                className={compactInputClass}
                value={form.accountHolderName || ''}
                onChange={(e) => set('accountHolderName', e.target.value)}
              />
            </Field>
            <Field label="Bank Name">
              <input
                type="text"
                maxLength={120}
                className={compactInputClass}
                value={form.bankName || ''}
                onChange={(e) => set('bankName', e.target.value)}
              />
            </Field>
            <Field label="Account Number">
              <input
                type="text"
                maxLength={25}
                placeholder="6-25 digits"
                className={compactInputClass}
                value={form.accountNumber || ''}
                onChange={(e) => set('accountNumber', e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label="IFSC Code">
              <input
                type="text"
                maxLength={11}
                placeholder="e.g. SBIN0001234"
                className={compactInputClass}
                value={form.ifsc || ''}
                onChange={(e) => set('ifsc', e.target.value.toUpperCase())}
              />
            </Field>
            <Field label="Branch Name">
              <input
                type="text"
                maxLength={120}
                className={compactInputClass}
                value={form.branch || ''}
                onChange={(e) => set('branch', e.target.value)}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateWorkerModal({ firmId, onClose, onSaved }) {
  const todayDate = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    userId: '',
    userAccountLabel: '',
    fullName: '',
    fatherOrHusbandName: '',
    gender: 'NOT_SPECIFIED',
    mobileNumber: '',
    address: '',
    dateOfJoining: todayDate,
    designation: '',
    isSupervisor: false,
    remarks: '',
    workLocation: '',
    supervisor: '',
    effectiveFrom: todayDate,
    reason: 'Initial deployment',
    aadhaarNumber: '',
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    branch: '',
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Photo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo must not exceed 2 MB.');
      return;
    }
    setError('');
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    const body = {
      firmId,
      fullName: form.fullName.trim(),
      fatherOrHusbandName: form.fatherOrHusbandName.trim(),
      gender: form.gender,
      mobileNumber: form.mobileNumber.trim(),
      address: form.address.trim(),
      dateOfJoining: form.dateOfJoining,
      designation: form.designation,
      isSupervisor: form.isSupervisor,
      remarks: form.remarks.trim(),
      initialDeployment: {
        workLocation: form.workLocation,
        supervisor: form.supervisor || null,
        effectiveFrom: form.effectiveFrom || form.dateOfJoining,
        reason: form.reason.trim() || 'Initial deployment',
      },
    };

    if (form.userId) {
      body.userId = form.userId;
    }

    if (form.aadhaarNumber) {
      body.aadhaarNumber = form.aadhaarNumber.trim();
    }

    if (form.accountNumber && form.ifsc) {
      body.bankDetails = {
        accountHolderName: form.accountHolderName.trim() || form.fullName.trim(),
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifsc: form.ifsc.trim(),
        branch: form.branch.trim(),
      };
    }

    try {
      const res = await saveAttendance('workers', body, 'POST');
      const worker = res.worker;

      if (photoFile && worker?._id) {
        try {
          await uploadWorkerPhoto(worker._id, photoFile);
        } catch (photoErr) {
          console.warn('Worker created, but photo upload failed:', photoErr);
        }
      }

      onSaved(`Worker ${worker.fullName} (${worker.workerCode}) registered successfully. Enrolling face next…`, worker);
    } catch (err) {
      setError(err.message || 'Failed to create worker.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Register New Worker" onClose={onClose} busy={busy} maxWidth="max-w-[560px]">
      <form onSubmit={save} className="space-y-2">
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={busy} className="space-y-2">
          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5">
            <Field label="Full Name *">
              <input
                required
                maxLength={120}
                className={compactInputClass}
                placeholder="e.g. Ramesh Kumar"
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
              />
            </Field>

            <RemoteSelect
              required
              label="Designation *"
              resource="designations"
              firmId={firmId}
              value={form.designation}
              onChange={(value) => set('designation', value)}
            />

            <Field label="Date of Joining *">
              <input
                required
                type="date"
                className={compactInputClass}
                value={form.dateOfJoining}
                onChange={(e) => {
                  const joining = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    dateOfJoining: joining,
                    effectiveFrom: joining,
                  }));
                }}
              />
            </Field>


            <RemoteSelect
              label="Link Web User (Optional)"
              resource="registered-users"
              firmId={firmId}
              value={form.userId}
              selectedLabel={form.userAccountLabel || ''}
              onChange={(value, account) => {
                setForm((prev) => ({
                  ...prev,
                  userId: value || '',
                  userAccountLabel: account?.name || '',
                  fullName: prev.fullName || account?.fullName || account?.name || '',
                }));
              }}
            />

            <Field label="Mobile Number">
              <input
                type="tel"
                maxLength={15}
                placeholder="10-digit mobile"
                className={compactInputClass}
                value={form.mobileNumber}
                onChange={(e) => set('mobileNumber', e.target.value)}
              />
            </Field>
            <Field label="Gender">
              <select
                className={compactInputClass}
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <option value="NOT_SPECIFIED">Not Specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>

            <Field label="Father / Husband Name">
              <input
                maxLength={120}
                className={compactInputClass}
                value={form.fatherOrHusbandName}
                onChange={(e) => set('fatherOrHusbandName', e.target.value)}
              />
            </Field>
            <Field label="Address">
              <input
                maxLength={1000}
                placeholder="Residential address"
                className={compactInputClass}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>

            {/* Photo upload inline */}
            <div className="flex flex-col justify-end">
              <span className="text-[11px] font-semibold text-slate-600 leading-tight mb-0.5">Worker Photo</span>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-2 h-7">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-emerald-100 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    '📷'
                  )}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="w-full text-[10px] text-slate-500 file:mr-1.5 file:rounded file:border-0 file:bg-emerald-700 file:px-1.5 file:py-0.5 file:text-[10px] file:font-semibold file:text-white hover:file:bg-emerald-800 cursor-pointer"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>

            {/* Supervisor toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none rounded-md border border-slate-200 bg-slate-50/70 px-2 h-7 w-full hover:bg-slate-100">
                <input
                  type="checkbox"
                  className="rounded text-emerald-700 focus:ring-emerald-500"
                  checked={form.isSupervisor}
                  onChange={(e) => set('isSupervisor', e.target.checked)}
                />
                <span>Eligible as Supervisor</span>
              </label>
            </div>
          </div>

          {/* Initial Deployment Compact Section */}
          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                Initial Deployment <span className="font-normal text-emerald-700">(Mandatory)</span>
              </span>
              <span className="text-[10px] text-slate-400">Starting location</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5">
              <RemoteSelect
                required
                label="Work Location"
                resource="work-locations"
                firmId={firmId}
                value={form.workLocation}
                onChange={(value) => set('workLocation', value)}
              />
              <RemoteSelect
                label="Assigned Supervisor"
                resource="workers"
                supervisor
                firmId={firmId}
                value={form.supervisor}
                onChange={(value) => set('supervisor', value)}
              />
              <Field label="Assignment Start Date *">
                <input
                  required
                  type="date"
                  min={form.dateOfJoining}
                  className={compactInputClass}
                  value={form.effectiveFrom}
                  onChange={(e) => set('effectiveFrom', e.target.value)}
                />
              </Field>
              <Field label="Deployment Reason">
                <input
                  required
                  maxLength={500}
                  className={compactInputClass}
                  value={form.reason}
                  onChange={(e) => set('reason', e.target.value)}
                />
              </Field>
            </div>
          </div>

          {/* Confidential Details */}
          <PrivateDetailsSection form={form} set={set} />

          {/* Remarks */}
          <Field label="Remarks (Optional)">
            <input
              maxLength={1000}
              placeholder="Additional notes"
              className={compactInputClass}
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
            />
          </Field>

          {/* Modal Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
            <button
              type="button"
              className={`${secondaryButton} !min-h-7 !h-7 !px-3 text-xs font-semibold rounded-md`}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className={`${primaryButton} !min-h-7 !h-7 !px-4 text-xs font-bold rounded-md`}
              disabled={busy || !form.fullName.trim() || !form.workLocation || !form.designation}
            >
              {busy ? 'Registering…' : 'Register Worker'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function EditWorkerModal({ worker, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: worker.fullName || '',
    fatherOrHusbandName: worker.fatherOrHusbandName || '',
    gender: worker.gender || 'NOT_SPECIFIED',
    mobileNumber: worker.mobileNumber || '',
    address: worker.address || '',
    isSupervisor: worker.isSupervisor ?? false,
    active: worker.active ?? true,
    leavingDate: worker.leavingDate || '',
    inactiveReason: worker.inactiveReason || '',
    remarks: worker.remarks || '',
    aadhaarNumber: '',
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    branch: '',
  });

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    saveAttendance(`workers/${worker._id}/private-details`, {}, 'GET')
      .then((data) => {
        if (data.worker) {
          setForm((prev) => ({
            ...prev,
            aadhaarNumber: data.worker.aadhaarNumber || '',
            accountHolderName: data.worker.bankDetails?.accountHolderName || '',
            bankName: data.worker.bankDetails?.bankName || '',
            accountNumber: data.worker.bankDetails?.accountNumber || '',
            ifsc: data.worker.bankDetails?.ifsc || '',
            branch: data.worker.bankDetails?.branch || '',
          }));
        }
      })
      .catch(() => {});
  }, [worker._id]);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Photo must be a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Photo must not exceed 2 MB.');
      return;
    }
    setError('');
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  async function save(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    const body = {
      fullName: form.fullName.trim(),
      fatherOrHusbandName: form.fatherOrHusbandName.trim(),
      gender: form.gender,
      mobileNumber: form.mobileNumber.trim(),
      address: form.address.trim(),
      isSupervisor: form.isSupervisor,
      active: form.active,
      leavingDate: form.active ? null : form.leavingDate || null,
      inactiveReason: form.active ? '' : form.inactiveReason.trim(),
      remarks: form.remarks.trim(),
    };

    if (form.aadhaarNumber !== undefined) {
      body.aadhaarNumber = form.aadhaarNumber.trim() || null;
    }

    if (form.accountNumber && form.ifsc) {
      body.bankDetails = {
        accountHolderName: form.accountHolderName.trim() || form.fullName.trim(),
        bankName: form.bankName.trim(),
        accountNumber: form.accountNumber.trim(),
        ifsc: form.ifsc.trim(),
        branch: form.branch.trim(),
      };
    }

    try {
      await saveAttendance(`workers/${worker._id}`, body, 'PATCH');

      if (photoFile) {
        await uploadWorkerPhoto(worker._id, photoFile);
      }

      onSaved(`Worker ${form.fullName} updated.`);
    } catch (err) {
      setError(err.message || 'Failed to update worker.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Edit Worker: ${worker.fullName} (${worker.workerCode})`} onClose={onClose} busy={busy} maxWidth="max-w-[560px]">
      <form onSubmit={save} className="space-y-2">
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={busy} className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5">
            <Field label="Full Name *">
              <input
                required
                maxLength={120}
                className={compactInputClass}
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
              />
            </Field>
            <Field label="Father / Husband Name">
              <input
                maxLength={120}
                className={compactInputClass}
                value={form.fatherOrHusbandName}
                onChange={(e) => set('fatherOrHusbandName', e.target.value)}
              />
            </Field>
            <Field label="Gender">
              <select
                className={compactInputClass}
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <option value="NOT_SPECIFIED">Not Specified</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Mobile Number">
              <input
                type="tel"
                maxLength={15}
                placeholder="10-digit mobile"
                className={compactInputClass}
                value={form.mobileNumber}
                onChange={(e) => set('mobileNumber', e.target.value)}
              />
            </Field>
            <Field label="Address">
              <input
                maxLength={1000}
                placeholder="Residential address"
                className={compactInputClass}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </Field>

            {/* Photo updater inline */}
            <div className="flex flex-col justify-end">
              <span className="text-[11px] font-semibold text-slate-600 leading-tight mb-0.5">Update Photograph</span>
              <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-2 h-7">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-emerald-100 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <WorkerPhoto worker={worker} />
                  )}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="w-full text-[10px] text-slate-500 file:mr-1.5 file:rounded file:border-0 file:bg-emerald-700 file:px-1.5 file:py-0.5 file:text-[10px] file:font-semibold file:text-white hover:file:bg-emerald-800 cursor-pointer"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>

            {/* Supervisor toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none rounded-md border border-slate-200 bg-slate-50/70 px-2 h-7 w-full hover:bg-slate-100">
                <input
                  type="checkbox"
                  className="rounded text-emerald-700 focus:ring-emerald-500"
                  checked={form.isSupervisor}
                  onChange={(e) => set('isSupervisor', e.target.checked)}
                />
                <span>Eligible as Supervisor</span>
              </label>
            </div>

            {/* Active toggle */}
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none rounded-md border border-slate-200 bg-slate-50/70 px-2 h-7 w-full hover:bg-slate-100">
                <input
                  type="checkbox"
                  className="rounded text-emerald-700 focus:ring-emerald-500"
                  checked={form.active}
                  onChange={(e) => set('active', e.target.checked)}
                />
                <span>Active Worker</span>
              </label>
            </div>
          </div>

          <div className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-1">
            <span>
              <strong className="font-semibold">Firm:</strong> {worker.firm?.name} ·{' '}
              <strong className="font-semibold">Designation:</strong> {worker.designation?.name} ·{' '}
              <strong className="font-semibold">Joined:</strong> {worker.dateOfJoining}
            </span>
          </div>

          {/* Inactive details */}
          {!form.active && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2.5 gap-y-1.5 p-2 rounded-lg border border-red-200 bg-red-50/30">
              <Field label="Leaving Date (India)">
                <input
                  type="date"
                  min={worker.dateOfJoining}
                  className={compactInputClass}
                  value={form.leavingDate}
                  onChange={(e) => set('leavingDate', e.target.value)}
                />
              </Field>
              <Field label="Reason for Inactive">
                <input
                  maxLength={1000}
                  className={compactInputClass}
                  placeholder="e.g. Resigned, terminated"
                  value={form.inactiveReason}
                  onChange={(e) => set('inactiveReason', e.target.value)}
                />
              </Field>
            </div>
          )}

          {/* Confidential Details */}
          <PrivateDetailsSection form={form} set={set} />

          {/* Remarks */}
          <Field label="Remarks (Optional)">
            <input
              maxLength={1000}
              placeholder="Additional notes"
              className={compactInputClass}
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
            <button
              type="button"
              className={`${secondaryButton} !min-h-7 !h-7 !px-3 text-xs font-semibold rounded-md`}
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className={`${primaryButton} !min-h-7 !h-7 !px-4 text-xs font-bold rounded-md`}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

function WorkerDetailsDrawer({ worker, onClose, onAssignInitial, onEnrolFace }) {
  const [tab, setTab] = useState('profile');
  const deploymentState = useAttendanceData(attendancePath(`workers/${worker._id}/deployment`));
  const historyState = useAttendanceData(tab === 'history' ? attendancePath(`workers/${worker._id}/deployments`) : null);
  const privateState = useAttendanceData(tab === 'private' ? attendancePath(`workers/${worker._id}/private-details`) : null);

  const currentDeployment = deploymentState.data?.deployment;

  return (
    <Dialog title={`${worker.fullName} (${worker.workerCode})`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <div className="flex items-center gap-4">
            <WorkerPhoto worker={worker} large />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900">{worker.fullName}</h3>
                <Status active={worker.active} />
                {worker.isSupervisor && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    Supervisor
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{worker.workerCode} · {worker.firm?.name}</p>
              <p className="mt-1 text-sm font-medium text-emerald-800">{worker.designation?.name}</p>
            </div>
          </div>
          {!currentDeployment && worker.active && (
            <button
              type="button"
              className={primaryButton}
              onClick={() => {
                onClose();
                onAssignInitial(worker);
              }}
            >
              + Assign Initial Deployment
            </button>
          )}
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-slate-200 overflow-x-auto whitespace-nowrap -webkit-overflow-scrolling-touch">
          {[
            ['profile', 'Profile & Current Assignment'],
            ['history', 'Deployment History'],
            ['private', 'Confidential Details'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                tab === key
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'profile' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-slate-100 p-4 text-sm">
              <div><span className="text-slate-500">Date of Joining:</span> <span className="font-semibold">{worker.dateOfJoining}</span></div>
              <div><span className="text-slate-500">Mobile Number:</span> <span className="font-semibold">{worker.mobileNumber || 'None'}</span></div>
              <div><span className="text-slate-500">Father/Husband Name:</span> <span className="font-semibold">{worker.fatherOrHusbandName || 'None'}</span></div>
              <div><span className="text-slate-500">Gender:</span> <span className="font-semibold">{worker.gender}</span></div>
              <div className="sm:col-span-2"><span className="text-slate-500">Address:</span> <span className="font-semibold">{worker.address || 'None'}</span></div>
              {!worker.active && (
                <>
                  <div><span className="text-slate-500">Leaving Date:</span> <span className="font-semibold text-red-700">{worker.leavingDate || 'Not specified'}</span></div>
                  <div><span className="text-slate-500">Inactive Reason:</span> <span className="font-semibold">{worker.inactiveReason || 'None'}</span></div>
                </>
              )}
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
              <h4 className="text-sm font-bold text-emerald-900">Current Work Assignment</h4>
              {deploymentState.loading ? (
                <div className="py-3"><Spinner /></div>
              ) : currentDeployment ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 text-sm">
                  <div><span className="text-slate-500">Location:</span> <span className="font-bold text-slate-800">{currentDeployment.workLocationNameSnapshot}</span></div>
                  <div><span className="text-slate-500">Supervisor:</span> <span className="font-bold text-slate-800">{currentDeployment.supervisorNameSnapshot || 'None'}</span></div>
                  <div><span className="text-slate-500">Effective Since:</span> <span className="font-medium text-slate-700">{dateTime(currentDeployment.effectiveFrom)}</span></div>
                  <div><span className="text-slate-500">Reason:</span> <span className="text-slate-700">{currentDeployment.reason}</span></div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-amber-800">
                  No active deployment record. Worker is currently unassigned.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Face Recognition Profile</h4>
                <p className="text-xs text-slate-500">
                  Status:{' '}
                  <span
                    className={`font-semibold ${
                      worker.faceStatus === 'REGISTERED'
                        ? 'text-emerald-700'
                        : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {worker.faceStatus === 'REGISTERED'
                      ? '✓ Registered & Active'
                      : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                      ? 'Re-registration Required'
                      : 'Not Registered'}
                  </span>
                </p>
              </div>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  onClose();
                  onEnrolFace(worker);
                }}
              >
                {worker.faceStatus === 'REGISTERED' ? '📷 Manage Face' : '📷 Enrol Face'}
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <LoadState state={historyState}>
            <DeploymentTable items={historyState.data?.items} />
          </LoadState>
        )}

        {tab === 'private' && (
          <LoadState state={privateState}>
            {privateState.data?.worker ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
                <div>
                  <span className="text-slate-500">Aadhaar Number:</span>{' '}
                  <span className="font-mono font-bold tracking-wider text-slate-800">
                    {privateState.data.worker.aadhaarNumber || 'Not provided'}
                  </span>
                </div>
                {privateState.data.worker.bankDetails ? (
                  <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-100">
                    <div><span className="text-slate-500">Bank Name:</span> <span className="font-semibold">{privateState.data.worker.bankDetails.bankName || '—'}</span></div>
                    <div><span className="text-slate-500">Account Holder:</span> <span className="font-semibold">{privateState.data.worker.bankDetails.accountHolderName || '—'}</span></div>
                    <div><span className="text-slate-500">Account Number:</span> <span className="font-mono font-bold">{privateState.data.worker.bankDetails.accountNumber}</span></div>
                    <div><span className="text-slate-500">IFSC Code:</span> <span className="font-mono font-bold">{privateState.data.worker.bankDetails.ifsc}</span></div>
                    <div><span className="text-slate-500">Branch:</span> <span className="font-semibold">{privateState.data.worker.bankDetails.branch || '—'}</span></div>
                  </div>
                ) : (
                  <p className="text-slate-500">No bank details recorded.</p>
                )}
              </div>
            ) : (
              <p className="text-slate-500">Confidential details unavailable.</p>
            )}
          </LoadState>
        )}
      </div>
    </Dialog>
  );
}

function WorkerActionDropdown({ worker, onToggle, onDelete, busy, canTransfer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={busy}
        className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 cursor-pointer`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span>Action</span>
        <span className="text-[9px]">▼</span>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full sm:bottom-auto sm:top-full mb-1 sm:mb-0 sm:mt-1 z-30 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2 transition cursor-pointer"
            onClick={() => {
              setOpen(false);
              onToggle(worker);
            }}
          >
            <span>{worker.active ? '🚫' : '✅'}</span>
            <span>{worker.active ? 'Deactivate' : 'Activate'}</span>
          </button>

          {canTransfer && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition border-t border-slate-100 cursor-pointer"
              onClick={() => {
                setOpen(false);
                onDelete(worker);
              }}
            >
              <span>🗑️</span>
              <span>Delete</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkersPanel({ firmId, firms = [], revision, onChanged }) {
  const { user } = useAuth();
  const canTransfer = ['admin', 'developer', 'office', 'supervisor'].includes(user?.role);

  const [search, setSearch] = useState('');
  const [designation, setDesignation] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [active, setActive] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  const designationsState = useAttendanceData(
    firmId ? attendancePath('designations', { firmId, active: true, limit: 100 }) : null
  );
  const designations = designationsState.data?.items || [];

  useEffect(() => {
    setDesignation('');
  }, [firmId]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailsWorker, setDetailsWorker] = useState(null);
  const [assigningInitial, setAssigningInitial] = useState(null);
  const [enrollingFaceWorker, setEnrollingFaceWorker] = useState(null);
  const [transferringWorker, setTransferringWorker] = useState(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [localRevision, setLocalRevision] = useState(0);

  const debouncedSearch = useDebounced(search);
  const state = useAttendanceData(
    attendancePath('workers', {
      firmId,
      search: debouncedSearch,
      designation,
      isSupervisor: supervisorFilter === '' ? undefined : supervisorFilter === 'true',
      active,
      page,
      limit,
    }),
    `${revision}-${localRevision}`
  );

  async function toggleWorker(worker) {
    setBusy(true);
    setError('');
    try {
      await saveAttendance(`workers/${worker._id}`, { active: !worker.active }, 'PATCH');
      setLocalRevision((r) => r + 1);
      if (typeof onChanged === 'function') {
        onChanged(`Worker ${worker.fullName} ${worker.active ? 'deactivated' : 'activated'}.`);
      }
    } catch (err) {
      alert(err.message);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWorker(worker) {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete worker "${worker.fullName}" (${worker.workerCode})?\n\nThis will remove the worker, their deployments, attendance history, and enrolled face data. This cannot be undone.`
    );
    if (!confirmed) return;

    setBusy(true);
    setError('');
    try {
      const res = await deleteWorker(worker._id);
      setLocalRevision((r) => r + 1);
      if (typeof onChanged === 'function') {
        onChanged(res?.message || `Worker ${worker.fullName} deleted successfully.`);
      }
    } catch (err) {
      alert(err.message || 'Failed to delete worker.');
      setError(err.message || 'Failed to delete worker.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${panelClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Registered Workers</h2>
          <p className="text-xs text-slate-500">
            Register workers, enrol face biometrics, and manage deployments.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Link
            to="/attendance/scan"
            className="flex-1 sm:flex-initial inline-flex !min-h-9 !h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 shadow-2xs transition"
          >
            <span>📷</span>
            <span>Open Scanner</span>
          </Link>
          <button
            type="button"
            className={`${primaryButton} flex-1 sm:flex-initial !min-h-9 !h-9 !px-3 text-xs font-bold`}
            disabled={!firmId}
            onClick={() => setCreating(true)}
          >
            + Register Worker
          </button>
        </div>
      </div>

      {!firmId && (
        <p className="text-sm text-amber-800">Select a firm above to view or register workers.</p>
      )}

      <Alert>{error}</Alert>

      {/* Filter Toolbar */}
      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 items-center">
        <input
          aria-label="Search workers"
          className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
          placeholder="Search name, code, mobile…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Filter by Designation"
          className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
          value={designation}
          onChange={(e) => {
            setDesignation(e.target.value);
            setPage(1);
          }}
          disabled={!firmId}
        >
          <option value="">All Designations</option>
          {designations.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Supervisor filter"
          className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
          value={supervisorFilter}
          onChange={(e) => {
            setSupervisorFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Roles</option>
          <option value="true">Supervisors Only</option>
          <option value="false">Non-Supervisors</option>
        </select>
        <select
          aria-label="Status filter"
          className={`${inputClass} !min-h-9 sm:!min-h-10 !h-9 sm:!h-10 !py-1 text-xs sm:text-sm font-medium`}
          value={active}
          onChange={(e) => {
            setActive(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Statuses</option>
          <option value="true">Active Only</option>
          <option value="false">Inactive Only</option>
        </select>
      </div>

      <LoadState state={state}>
        {!state.data?.items.length ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
            No workers match the selected filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="attendance-table w-full">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {['Worker', 'Firm / Designation', 'Supervisor', 'Face Recognition', 'Joined', 'Status', 'Actions'].map(
                    (h) => (
                      <th key={h} className={cellClass}>
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {state.data.items.map((worker) => (
                  <tr key={worker._id} className="hover:bg-slate-50/60">
                    <td data-label="Worker" className={cellClass}>
                      <div className="flex items-center gap-3">
                        <WorkerPhoto worker={worker} />
                        <div>
                          <p className="font-semibold text-slate-900">{worker.fullName}</p>
                          <p className="font-mono text-xs text-slate-500">{worker.workerCode}</p>
                          {worker.mobileNumber && (
                            <p className="text-xs text-slate-400">📱 {worker.mobileNumber}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td data-label="Firm / designation" className={cellClass}>
                      <p className="font-medium text-slate-800">{worker.designation?.name || '—'}</p>
                      <p className="text-xs text-slate-500">{worker.firm?.name}</p>
                    </td>
                    <td data-label="Role" className={cellClass}>
                      {worker.isSupervisor ? (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          Supervisor
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Worker</span>
                      )}
                    </td>
                    <td data-label="Face recognition" className={cellClass}>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${
                          worker.faceStatus === 'REGISTERED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {worker.faceStatus === 'REGISTERED'
                          ? '✓ Enrolled'
                          : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                          ? 'Re-enrol'
                          : 'Not Enrolled'}
                      </span>
                    </td>
                    <td data-label="Joined" className={`${cellClass} whitespace-nowrap text-xs text-slate-600`}>
                      {worker.dateOfJoining}
                    </td>
                    <td data-label="Status" className={cellClass}>
                      <Status active={worker.active} />
                    </td>
                    <td data-label="Actions" className={cellClass}>
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 pt-1 sm:pt-0">
                        <button
                          type="button"
                          className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs hover:border-emerald-300 hover:text-emerald-700`}
                          title="Enrol face recognition"
                          onClick={() => setEnrollingFaceWorker(worker)}
                        >
                          📷 Face
                        </button>
                        {canTransfer && (
                          <button
                            type="button"
                            className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs hover:border-cyan-300 hover:text-cyan-700`}
                            title="Transfer worker to new shed or firm"
                            onClick={() => setTransferringWorker(worker)}
                          >
                            ⇄ Transfer
                          </button>
                        )}
                        <button
                          type="button"
                          className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs`}
                          onClick={() => setDetailsWorker(worker)}
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs`}
                          onClick={() => setEditing(worker)}
                        >
                          Edit
                        </button>
                        <WorkerActionDropdown
                          worker={worker}
                          onToggle={toggleWorker}
                          onDelete={handleDeleteWorker}
                          busy={busy}
                          canTransfer={canTransfer}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          pagination={state.data?.pagination}
          onPage={setPage}
          onLimit={(val) => {
            setLimit(val);
            setPage(1);
          }}
        />
      </LoadState>

      {creating && (
        <CreateWorkerModal
          firmId={firmId}
          onClose={() => setCreating(false)}
          onSaved={(msg, newWorker) => {
            setCreating(false);
            onChanged(msg);
            if (newWorker) {
              setEnrollingFaceWorker(newWorker);
            }
          }}
        />
      )}

      {editing && (
        <EditWorkerModal
          worker={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onChanged(msg);
          }}
        />
      )}

      {detailsWorker && (
        <WorkerDetailsDrawer
          worker={detailsWorker}
          onClose={() => setDetailsWorker(null)}
          onAssignInitial={(w) => setAssigningInitial(w)}
          onEnrolFace={(w) => setEnrollingFaceWorker(w)}
        />
      )}

      {assigningInitial && (
        <InitialDeploymentForm
          worker={assigningInitial}
          onClose={() => setAssigningInitial(null)}
          onSaved={(msg) => {
            setAssigningInitial(null);
            onChanged(msg);
          }}
        />
      )}

      {enrollingFaceWorker && (
        <FaceRegistrationModal
          worker={enrollingFaceWorker}
          onClose={() => setEnrollingFaceWorker(null)}
          onSaved={(msg) => {
            setEnrollingFaceWorker(null);
            onChanged(msg);
          }}
        />
      )}

      {transferringWorker && (
        <TransferModal
          worker={transferringWorker}
          currentDeployment={transferringWorker.currentDeployment}
          firms={firms}
          onClose={() => setTransferringWorker(null)}
          onSuccess={(msg) => {
            setTransferringWorker(null);
            onChanged(msg);
          }}
        />
      )}
    </section>
  );
}

