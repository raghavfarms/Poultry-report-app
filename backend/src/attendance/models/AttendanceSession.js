import mongoose from 'mongoose';
import { attendanceLocationSchema } from './location.schema.js';

const schema = new mongoose.Schema({
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorker', required: true, index: true },
  workerCodeSnapshot: { type: String, required: true },
  workerNameSnapshot: { type: String, required: true },
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, index: true },
  firmNameSnapshot: { type: String, required: true },
  workLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorkLocation', required: true, index: true },
  workLocationNameSnapshot: { type: String, required: true },
  designation: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDesignation', required: true },
  designationNameSnapshot: { type: String, required: true },
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorker', default: null },
  supervisorNameSnapshot: { type: String, default: '' },
  date: { type: String, required: true, index: true }, // YYYY-MM-DD in Asia/Kolkata
  dutyIn: { type: Date, default: null },
  inEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceEvent', default: null },
  inLocation: { type: attendanceLocationSchema, default: () => ({ status: 'NOT_PROVIDED' }) },
  dutyOut: { type: Date, default: null },
  outEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceEvent', default: null },
  outLocation: { type: attendanceLocationSchema, default: null },
  lunchOut: { type: Date, default: null },
  lunchOutEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceEvent', default: null },
  lunchIn: { type: Date, default: null },
  lunchInEvent: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceEvent', default: null },
  lunchMinutes: { type: Number, default: 0, min: 0 },
  onLunch: { type: Boolean, default: false, index: true },
  workedMinutes: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['PRESENT', 'DUTY_COMPLETED', 'ABSENT'],
    default: 'PRESENT',
    required: true,
    index: true,
  },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true, optimisticConcurrency: true });

// Prevent multiple concurrent open sessions for the same worker at database level
schema.index(
  { worker: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'PRESENT' } }
);

schema.index({ firm: 1, date: 1, status: 1 });
schema.index({ workLocation: 1, date: 1, status: 1 });
schema.index({ worker: 1, date: -1 });

export default mongoose.model('AttendanceSession', schema);

