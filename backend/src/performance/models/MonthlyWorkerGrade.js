import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  worker: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceWorker', 
    required: true, 
    index: true 
  },
  workerCodeSnapshot: { type: String, required: true },
  workerNameSnapshot: { type: String, required: true },

  firm: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Firm', 
    required: true, 
    index: true 
  },
  firmNameSnapshot: { type: String, required: true },

  designation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceDesignation', 
    default: null 
  },
  designationNameSnapshot: { type: String, default: '' },

  month: { 
    type: String, 
    required: true, 
    index: true 
  }, // Format: 'YYYY-MM', e.g. '2026-11'

  // Attendance aggregates for the month (read from Attendance records)
  presentDays: { type: Number, default: 0, min: 0 },
  halfDays: { type: Number, default: 0, min: 0 },
  absentDays: { type: Number, default: 0, min: 0 },

  // Number of eligible daily evaluations submitted
  evaluationDays: { type: Number, default: 0, min: 0 },

  // Numerical average score (e.g., 78.5)
  averageScore: { type: Number, default: 0 },

  // Final monthly grade
  finalGrade: { 
    type: String, 
    enum: ['A', 'B', 'C', 'D', 'INSUFFICIENT_DATA', 'NO_DATA'], 
    required: true, 
    default: 'NO_DATA',
    index: true 
  },

  // Manual override fields by Admin
  overrideGrade: {
    type: String,
    enum: ['A', 'B', 'C', 'D', null],
    default: null,
  },
  remarks: {
    type: String,
    default: '',
    trim: true,
  },
  overrideBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  overrideAt: {
    type: Date,
    default: null,
  },

  // Snapshot of grade rules used at calculation time
  gradeConfigSnapshot: { 
    type: mongoose.Schema.Types.Mixed, 
    default: null 
  },

  calculatedAt: { 
    type: Date, 
    default: Date.now 
  },
  calculatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
}, { 
  timestamps: true 
});

// CRITICAL: Each worker has exactly one monthly grade summary per month
schema.index({ worker: 1, month: 1 }, { unique: true });
schema.index({ firm: 1, month: 1 });

export default mongoose.model('MonthlyWorkerGrade', schema);