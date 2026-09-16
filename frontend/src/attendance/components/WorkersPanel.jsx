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
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
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
    fullName: '',
    fatherOrHusbandName: '',
    gender: 'NOT_SPECIFIED',
    mobileNumber: '',
    address: '',
    dateOfJoining: '',
    designation: '',
    referenceName: '',
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
      dateOfJoining: form.dateOfJoining || null,
      designation: form.designation,
      isSupervisor: false,
      referenceName: form.referenceName.trim(),
      remarks: form.remarks.trim(),
      initialDeployment: {
        workLocation: form.workLocation,
        supervisor: form.supervisor || null,
        effectiveFrom: form.effectiveFrom || form.dateOfJoining || todayDate,
        reason: form.reason.trim() || 'Initial deployment',
      },
    };

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
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
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
              label="Designation"
              resource="designations"
              firmId={firmId}
              value={form.designation}
              onChange={(value) => set('designation', value)}
            />

            <Field label="Date of Joining (Optional)">
              <input
                type="date"
                className={compactInputClass}
                value={form.dateOfJoining}
                onChange={(e) => {
                  const joining = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    dateOfJoining: joining,
                    effectiveFrom: joining || prev.effectiveFrom,
                  }));
                }}
              />
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
                <option value="LOCAL">Local</option>
              </select>
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

            <Field label="Reference Name (Optional)">
              <input
                maxLength={120}
                placeholder="e.g. Reference person"
                className={compactInputClass}
                value={form.referenceName}
                onChange={(e) => set('referenceName', e.target.value)}
              />
            </Field>

            {/* Photo upload inline */}
            <div className="col-span-2 flex flex-col justify-end">
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
          </div>

          {/* Initial Deployment Compact Section */}
          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-900 uppercase tracking-wide">
                Initial Deployment <span className="font-normal text-emerald-700">(Mandatory)</span>
              </span>
              <span className="text-[10px] text-slate-400">Starting location</span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
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
                  min={form.dateOfJoining || undefined}
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
    active: worker.active ?? true,
    leavingDate: worker.leavingDate || '',
    inactiveReason: worker.inactiveReason || '',
    referenceName: worker.referenceName || '',
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
      isSupervisor: worker.isSupervisor ?? false,
      active: form.active,
      leavingDate: form.active ? null : form.leavingDate || null,
      inactiveReason: form.active ? '' : form.inactiveReason.trim(),
      referenceName: form.referenceName.trim(),
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
          <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
            <Field label="Full Name *">
              <input
                required
                maxLength={120}
                className={compactInputClass}
                value={form.fullName}
                onChange={(e) => set('fullName', e.target.value)}
              />
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
                <option value="LOCAL">Local</option>
              </select>
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

            <Field label="Reference Name (Optional)">
              <input
                maxLength={120}
                placeholder="e.g. Reference person"
                className={compactInputClass}
                value={form.referenceName}
                onChange={(e) => set('referenceName', e.target.value)}
              />
            </Field>

            {/* Photo updater inline */}
            <div className="flex flex-col justify-end">
              <span className="text-[11px] font-semibold text-slate-600 leading-tight mb-0.5">Update Photo</span>
              <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50/70 px-1.5 h-7">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded bg-emerald-100 text-[10px] font-bold text-emerald-800 border border-emerald-200">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <WorkerPhoto worker={worker} compact />
                  )}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="w-full text-[9px] text-slate-500 file:mr-1 file:rounded file:border-0 file:bg-emerald-700 file:px-1.5 file:py-0.5 file:text-[9px] file:font-semibold file:text-white hover:file:bg-emerald-800 cursor-pointer"
                  onChange={handlePhotoChange}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex flex-col justify-end">
              <span className="text-[11px] font-semibold text-slate-600 leading-tight mb-0.5">Status</span>
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
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 p-2 rounded-lg border border-red-200 bg-red-50/30">
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
    <Dialog title={`${worker.fullName} (${worker.workerCode})`} onClose={onClose} maxWidth="max-w-[500px]">
      <div className="space-y-1.5 sm:space-y-2">
        {/* Worker Top Profile Banner - Ultra Compact */}
        <div className="flex items-center justify-between gap-2.5 rounded-lg border border-slate-200/80 bg-slate-50/70 p-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <WorkerPhoto worker={worker} size="h-10 w-10 sm:h-12 sm:w-12 text-sm rounded-lg shadow-xs shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{worker.fullName}</h3>
                <Status active={worker.active} />
                {worker.isSupervisor && (
                  <span className="rounded bg-amber-100 px-1 py-0.2 text-[9px] font-bold text-amber-800 shrink-0">
                    Supervisor
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 truncate mt-0.5">
                {worker.workerCode} · {worker.firm?.name} · <span className="font-semibold text-emerald-800">{worker.designation?.name}</span>
              </p>
            </div>
          </div>
          {!currentDeployment && worker.active && (
            <button
              type="button"
              className={`${primaryButton} !min-h-6 !h-6 !px-2 text-[10px] font-bold rounded shrink-0`}
              onClick={() => {
                onClose();
                onAssignInitial(worker);
              }}
            >
              + Assign
            </button>
          )}
        </div>

        {/* Tab Headers - Compact 3-tab layout that fits on mobile without scrollbar */}
        <div className="flex border-b border-slate-200 gap-1 text-[11px]">
          {[
            ['profile', 'Overview'],
            ['history', 'Deployments'],
            ['private', 'Confidential'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`shrink-0 border-b-2 px-2 sm:px-3 py-1 font-semibold transition cursor-pointer ${
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
          <div className="space-y-1.5 sm:space-y-2">
            {/* Master Details Grid - 2 columns inline key-value */}
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-1 rounded-lg border border-slate-200/80 bg-white p-2 text-[11px] leading-tight">
              <div className="truncate"><span className="text-slate-400 font-medium">Joined:</span> <span className="font-semibold text-slate-800">{worker.dateOfJoining}</span></div>
              <div className="truncate"><span className="text-slate-400 font-medium">Mobile:</span> <span className="font-semibold text-slate-800">{worker.mobileNumber || '—'}</span></div>
              <div className="truncate"><span className="text-slate-400 font-medium">Father:</span> <span className="font-semibold text-slate-800">{worker.fatherOrHusbandName || '—'}</span></div>
              <div className="truncate"><span className="text-slate-400 font-medium">Gender:</span> <span className="font-semibold text-slate-800">{worker.gender === 'LOCAL' ? 'Local' : worker.gender === 'MALE' ? 'Male' : worker.gender === 'FEMALE' ? 'Female' : worker.gender === 'OTHER' ? 'Other' : '—'}</span></div>
              <div className="truncate"><span className="text-slate-400 font-medium">Ref:</span> <span className="font-semibold text-slate-800">{worker.referenceName || '—'}</span></div>
              <div className="truncate"><span className="text-slate-400 font-medium">Address:</span> <span className="font-semibold text-slate-800">{worker.address || '—'}</span></div>
              {!worker.active && (
                <>
                  <div className="truncate"><span className="text-rose-400 font-medium">Left:</span> <span className="font-semibold text-rose-700">{worker.leavingDate || '—'}</span></div>
                  <div className="truncate"><span className="text-rose-400 font-medium">Reason:</span> <span className="font-semibold text-slate-700">{worker.inactiveReason || '—'}</span></div>
                </>
              )}
            </div>

            {/* Current Work Assignment - Compact card */}
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-2 text-[11px]">
              <div className="flex items-center justify-between mb-1 pb-0.5 border-b border-emerald-100 text-[10px]">
                <span className="font-bold text-emerald-900 uppercase tracking-wide">
                  Current Assignment
                </span>
                {currentDeployment ? (
                  <span className="font-bold text-emerald-700 bg-emerald-100/90 px-1 py-0.2 rounded text-[9px]">
                    Active
                  </span>
                ) : (
                  <span className="font-medium text-amber-700 text-[9px]">Unassigned</span>
                )}
              </div>
              {deploymentState.loading ? (
                <div className="py-1"><Spinner /></div>
              ) : currentDeployment ? (
                <div className="grid grid-cols-2 gap-x-2.5 gap-y-1">
                  <div className="truncate"><span className="text-slate-500 font-medium">Location:</span> <span className="font-bold text-slate-800">{currentDeployment.workLocationNameSnapshot}</span></div>
                  <div className="truncate"><span className="text-slate-500 font-medium">Supervisor:</span> <span className="font-bold text-slate-800">{currentDeployment.supervisorNameSnapshot || 'None'}</span></div>
                  <div className="truncate"><span className="text-slate-500 font-medium">Since:</span> <span className="font-medium text-slate-700">{dateTime(currentDeployment.effectiveFrom)}</span></div>
                  <div className="truncate"><span className="text-slate-500 font-medium">Reason:</span> <span className="text-slate-700">{currentDeployment.reason}</span></div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-amber-800">No active deployment record.</p>
                  {worker.active && (
                    <button
                      type="button"
                      className={`${primaryButton} !min-h-5 !h-5 !px-2 text-[10px] font-bold rounded`}
                      onClick={() => {
                        onClose();
                        onAssignInitial(worker);
                      }}
                    >
                      + Assign
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Face Profile Section - Single slim row */}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50/70 px-2.5 py-1.5 text-[11px]">
              <div className="min-w-0">
                <span className="text-slate-500 font-medium">Face ID: </span>
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
                    ? '✓ Registered'
                    : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                    ? 'Re-enrol needed'
                    : 'Not registered'}
                </span>
              </div>
              <button
                type="button"
                className={`${secondaryButton} !min-h-6 !h-6 !px-2 text-[10px] font-semibold rounded cursor-pointer shrink-0`}
                onClick={() => {
                  onClose();
                  onEnrolFace(worker);
                }}
              >
                {worker.faceStatus === 'REGISTERED' ? '📷 Manage' : '📷 Enrol'}
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
              <div className="space-y-2.5 rounded-xl border border-slate-200/80 p-2.5 sm:p-3 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Aadhaar Number</span>
                  <span className="font-mono font-bold tracking-wider text-slate-800 text-xs mt-0.5 block">
                    {privateState.data.worker.aadhaarNumber || 'Not provided'}
                  </span>
                </div>
                {privateState.data.worker.bankDetails ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] font-medium text-slate-500 block">Bank Name</span>
                      <span className="font-semibold text-slate-800 truncate block mt-0.5">{privateState.data.worker.bankDetails.bankName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-slate-500 block">Account Holder</span>
                      <span className="font-semibold text-slate-800 truncate block mt-0.5">{privateState.data.worker.bankDetails.accountHolderName || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-slate-500 block">Account Number</span>
                      <span className="font-mono font-bold text-slate-800 truncate block mt-0.5">{privateState.data.worker.bankDetails.accountNumber}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-slate-500 block">IFSC Code</span>
                      <span className="font-mono font-bold text-slate-800 truncate block mt-0.5">{privateState.data.worker.bankDetails.ifsc}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-medium text-slate-500 block">Branch</span>
                      <span className="font-semibold text-slate-800 truncate block mt-0.5">{privateState.data.worker.bankDetails.branch || '—'}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs">No bank details recorded.</p>
                )}
              </div>
            ) : (
              <p className="text-slate-500 text-xs">Confidential details unavailable.</p>
            )}
          </LoadState>
        )}
      </div>
    </Dialog>
  );
}

function WorkerActionDropdown({
  worker,
  onToggle,
  onDelete,
  onEdit,
  onTransfer,
  onDetails,
  onEnrolFace,
  busy,
  canTransfer,
  compact = false,
}) {
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
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        disabled={busy}
        className={`${secondaryButton} ${
          compact
            ? '!min-h-6.5 !h-6.5 !w-6.5 !p-0 text-sm !rounded-md'
            : '!min-h-8 sm:!min-h-9 !h-8 sm:!h-9 !px-2.5 !py-1 text-xs'
        } inline-flex items-center justify-center font-bold text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap`}
        aria-haspopup="true"
        aria-expanded={open}
        title="More actions"
      >
        <span>{compact ? '⋮' : 'Action ▾'}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 w-44 rounded-xl border border-slate-200 bg-white py-1 shadow-xl ring-1 ring-black/5 text-xs divide-y divide-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="py-1">
            {onDetails && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  onDetails(worker);
                }}
              >
                <span>👤</span>
                <span>View Profile</span>
              </button>
            )}

            {onEdit && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  onEdit(worker);
                }}
              >
                <span>✏️</span>
                <span>Edit Worker</span>
              </button>
            )}

            {onEnrolFace && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  onEnrolFace(worker);
                }}
              >
                <span>📷</span>
                <span>Enrol Face</span>
              </button>
            )}

            {canTransfer && onTransfer && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  onTransfer(worker);
                }}
              >
                <span>⇄</span>
                <span>Transfer Worker</span>
              </button>
            )}
          </div>

          <div className="py-1">
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition cursor-pointer"
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
                className="w-full text-left px-3 py-1.5 font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition cursor-pointer"
                onClick={() => {
                  setOpen(false);
                  onDelete(worker);
                }}
              >
                <span>🗑️</span>
                <span>Delete Worker</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkersPanel({ firmId, firms = [], revision, onChanged }) {
  const { user } = useAuth();
  const canTransfer = ['admin', 'developer', 'office', 'supervisor', 'security', 'farm_incharge'].includes(user?.role);

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
    <section className={`${panelClass} space-y-3.5`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900">Registered Workers</h2>
          <p className="text-[11px] sm:text-xs text-slate-500">
            Register workers, enrol face biometrics, and manage deployments.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Link
            to="/attendance/scan"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 shadow-2xs transition whitespace-nowrap h-8"
          >
            <span>📷</span>
            <span>Scanner</span>
          </Link>
          <button
            type="button"
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 shadow-2xs transition disabled:opacity-50 whitespace-nowrap h-8 cursor-pointer"
            disabled={!firmId}
            onClick={() => setCreating(true)}
          >
            <span>+</span>
            <span>Add Worker</span>
          </button>
        </div>
      </div>

      {!firmId && (
        <p className="text-sm text-amber-800">Select a firm above to view or register workers.</p>
      )}

      <Alert>{error}</Alert>

      {/* Filter Toolbar: Line 1 Search + Line 2 Horizontal scrollable filter pills */}
      <div className="space-y-1.5">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 text-xs">
            🔍
          </span>
          <input
            aria-label="Search workers"
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-8 pr-7 py-1.5 text-xs font-medium text-slate-800 placeholder-slate-400 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-1 focus:ring-emerald-500"
            placeholder="Search name, code, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setPage(1);
              }}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
          {/* Designation Filter */}
          <select
            aria-label="Filter by Designation"
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium outline-none transition shrink-0 cursor-pointer ${
              designation
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
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

          {/* Role Filter */}
          <select
            aria-label="Supervisor filter"
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium outline-none transition shrink-0 cursor-pointer ${
              supervisorFilter
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
            value={supervisorFilter}
            onChange={(e) => {
              setSupervisorFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Roles</option>
            <option value="true">Supervisors</option>
            <option value="false">Workers</option>
          </select>

          {/* Status Filter */}
          <select
            aria-label="Status filter"
            className={`rounded-lg border px-2 py-1 text-[11px] font-medium outline-none transition shrink-0 cursor-pointer ${
              active
                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
            value={active}
            onChange={(e) => {
              setActive(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>

          {/* Reset Filters chip if any filter is active */}
          {(Boolean(search) || Boolean(designation) || Boolean(supervisorFilter) || Boolean(active)) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setDesignation('');
                setSupervisorFilter('');
                setActive('');
                setPage(1);
              }}
              className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 shrink-0 cursor-pointer"
            >
              ✕ Reset
            </button>
          )}
        </div>
      </div>

      <LoadState state={state}>
        {!state.data?.items.length ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
            No workers match the selected filters.
          </p>
        ) : (
          <>
            {/* Mobile Card View (< 640px) */}
            <div className="sm:hidden space-y-1.5">
              {state.data.items.map((worker) => (
                <div
                  key={worker._id}
                  className="rounded-xl border border-slate-200/90 bg-white p-2 shadow-2xs hover:border-slate-300 transition active:bg-slate-50/70 cursor-pointer"
                  onClick={() => setDetailsWorker(worker)}
                  title="Tap to view worker profile"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Worker Avatar (compact 32px) */}
                    <WorkerPhoto worker={worker} compact={true} />

                    {/* Content Section */}
                    <div className="min-w-0 flex-1">
                      {/* Top Line: Worker Name + Code badge + Active/Inactive status */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="font-bold text-slate-900 text-xs truncate max-w-[140px]">
                            {worker.fullName}
                          </p>
                          <span className="font-mono text-[9px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded leading-none shrink-0">
                            {worker.workerCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {worker.isSupervisor && (
                            <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-bold text-amber-800 leading-none">
                              Sup
                            </span>
                          )}
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
                              worker.active
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {worker.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Line: Designation/Firm + Face Badge on left; Actions on right */}
                      <div className="mt-1 flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0 truncate text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700 truncate max-w-[105px]">
                            {worker.designation?.name || '—'}
                          </span>
                          {worker.firm?.name && (
                            <span className="text-slate-400 truncate max-w-[80px]">
                              · {worker.firm.name}
                            </span>
                          )}
                          <span
                            className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold shrink-0 ${
                              worker.faceStatus === 'REGISTERED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {worker.faceStatus === 'REGISTERED'
                              ? '✓ Face'
                              : worker.faceStatus === 'RE_REGISTRATION_REQUIRED'
                              ? '⚠️ Face'
                              : 'No Face'}
                          </span>
                        </div>

                        {/* Quick Actions: [📷 Face] + [⋮] */}
                        <div
                          className="flex items-center gap-1 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="inline-flex items-center gap-0.5 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-emerald-100 cursor-pointer shadow-2xs whitespace-nowrap"
                            title="Enrol face recognition"
                            onClick={() => setEnrollingFaceWorker(worker)}
                          >
                            <span>📷</span>
                            <span>Face</span>
                          </button>
                          <WorkerActionDropdown
                            worker={worker}
                            onToggle={toggleWorker}
                            onDelete={handleDeleteWorker}
                            onEdit={setEditing}
                            onTransfer={setTransferringWorker}
                            onDetails={setDetailsWorker}
                            onEnrolFace={setEnrollingFaceWorker}
                            busy={busy}
                            canTransfer={canTransfer}
                            compact={true}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View (>= 640px) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="attendance-table w-full min-w-[760px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    {['Worker', 'Firm / Designation', 'Supervisor', 'Face Recognition', 'Joined', 'Status', 'Actions'].map(
                      (h) => (
                        <th
                          key={h}
                          className={`${cellClass} ${
                            h === 'Worker'
                              ? 'sticky left-0 z-20 bg-slate-50 border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] min-w-[180px] whitespace-nowrap'
                              : ''
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {state.data.items.map((worker) => (
                    <tr key={worker._id} className="hover:bg-slate-50/60 group">
                      <td
                        data-label="Worker"
                        className={`${cellClass} sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] min-w-[180px]`}
                      >
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
                      <td data-label="Actions" className={`${cellClass} whitespace-nowrap`}>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs hover:border-emerald-300 hover:text-emerald-700 whitespace-nowrap`}
                            title="Enrol face recognition"
                            onClick={() => setEnrollingFaceWorker(worker)}
                          >
                            📷 Face
                          </button>
                          {canTransfer && (
                            <button
                              type="button"
                              className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs hover:border-cyan-300 hover:text-cyan-700 whitespace-nowrap`}
                              title="Transfer worker to new shed or firm"
                              onClick={() => setTransferringWorker(worker)}
                            >
                              ⇄ Transfer
                            </button>
                          )}
                          <button
                            type="button"
                            className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs whitespace-nowrap`}
                            onClick={() => setDetailsWorker(worker)}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            className={`${secondaryButton} !min-h-9 !px-2.5 !py-1 text-xs whitespace-nowrap`}
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
          </>
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

