import mongoose from 'mongoose';
import { attendanceLocationSchema } from './location.schema.js';

const schema = new mongoose.Schema({
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorker', required: true, index: true },
  workerCodeSnapshot: { type: String, required: true },
  workerNameSnapshot: { type: String, required: true },
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, index: true },
  firmNameSnapshot: { type: String, required: true },
  workLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorkLocation', default: null, index: true },
  workLocationNameSnapshot: { type: String, default: 'None' },
  designation: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceDesignation', required: true },
  designationNameSnapshot: { type: String, required: true },
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorker', default: null },
  supervisorNameSnapshot: { type: String, default: '' },
  eventType: { type: String, enum: ['DUTY_IN', 'DUTY_OUT', 'LUNCH_OUT', 'LUNCH_IN'], required: true },
  timestamp: { type: Date, required: true, index: true },
  attendanceDate: { type: String, required: true, index: true }, // YYYY-MM-DD in Asia/Kolkata
  source: { type: String, enum: ['FACE', 'MANUAL', 'TEST', 'CORRECTION'], default: 'MANUAL', required: true },
  location: { type: attendanceLocationSchema, default: () => ({ status: 'NOT_PROVIDED' }) },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', default: null, index: true },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
}, { timestamps: true, immutable: true });

schema.index({ worker: 1, timestamp: -1 });
schema.index({ firm: 1, attendanceDate: 1, eventType: 1 });
schema.index({ workLocation: 1, attendanceDate: 1 });

export default mongoose.model('AttendanceEvent', schema);

