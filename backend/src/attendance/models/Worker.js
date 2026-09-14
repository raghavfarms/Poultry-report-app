import mongoose from 'mongoose';

const bankSchema = new mongoose.Schema({
  accountHolderName: { type: String, trim: true, maxlength: 120 },
  bankName: { type: String, trim: true, maxlength: 120 },
  accountNumber: { type: String, match: /^\d{6,25}$/ },
  ifsc: { type: String, match: /^[A-Z]{4}0[A-Z0-9]{6}$/ },
  branch: { type: String, trim: true, maxlength: 120 },
}, { _id: false });

const schema = new mongoose.Schema({
  workerCode: { type: String, required: true, immutable: true },
  // Current ownership; changes must go through the future transfer service.
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  fatherOrHusbandName: { type: String, trim: true, maxlength: 120, default: '' },
  gender: { type: String, enum: ['MALE', 'FEMALE', 'OTHER', 'NOT_SPECIFIED'], default: 'NOT_SPECIFIED' },
  mobileNumber: { type: String, match: /^(?:\+?\d{10,15})?$/, default: '' },
  address: { type: String, trim: true, maxlength: 1000, default: '' },
  photographUrl: { type: String, maxlength: 2048, default: '' },
  hasPhotograph: { type: Boolean, default: false },
  photographFile: { type: new mongoose.Schema({ key: String, mimeType: String }, { _id: false }), select: false },
  dateOfJoining: { type: String, required: true },
  designation: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDesignation', required: true },
  isSupervisor: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  leavingDate: { type: String, default: null },
  inactiveReason: { type: String, trim: true, maxlength: 1000, default: '' },
  referenceName: { type: String, trim: true, maxlength: 120, default: '' },
  referenceMobile: { type: String, match: /^(?:\+?\d{10,15})?$/, default: '' },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
  aadhaarNumber: { type: String, match: /^[2-9]\d{11}$/, select: false },
  bankDetails: { type: bankSchema, select: false },
  pinHash: { type: String, select: false },
  faceStatus: {
    type: String,
    enum: ['NOT_REGISTERED', 'REGISTERED', 'RE_REGISTRATION_REQUIRED'],
    default: 'NOT_REGISTERED',
  },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } });
schema.index({ workerCode: 1 }, { unique: true });
schema.index({ mobileNumber: 1 });
schema.index({ firm: 1, active: 1, fullName: 1, _id: 1 });
schema.index({ firm: 1, designation: 1, active: 1 });
schema.index({ firm: 1, isSupervisor: 1, active: 1 });
export default mongoose.model('AttendanceWorker', schema);
