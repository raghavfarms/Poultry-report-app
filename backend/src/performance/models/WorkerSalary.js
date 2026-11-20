import mongoose from 'mongoose';

const revisionHistorySchema = new mongoose.Schema({
  month: { type: String, required: true }, // 'YYYY-MM'
  grade: { type: String, enum: ['A', 'B', 'C', 'INSUFFICIENT_DATA'] },
  oldSalary: { type: Number, required: true },
  proposedSalary: { type: Number, required: true },
  approvedSalary: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['APPROVED', 'REJECTED'], 
    required: true 
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewedByName: { type: String, default: '' },
  reviewedAt: { type: Date, default: Date.now },
  remarks: { type: String, trim: true, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  worker: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceWorker', 
    required: true, 
    unique: true, 
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
  designation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceDesignation', 
    default: null 
  },

  // The actual official approved salary of the worker   
  currentSalary: { 
    type: Number, 
    required: true, 
    default: 0, 
    min: 0 
  },

  // Active proposed revision for the current cycle
  activeProposal: {
    month: { type: String, default: null }, // e.g. '2026-11'
    grade: { type: String, enum: ['A', 'B', 'C', 'INSUFFICIENT_DATA', null], default: null },
    proposedIncrement: { type: Number, default: 0 },
    proposedSalary: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ['PENDING', 'APPROVED', 'REJECTED'], 
      default: 'PENDING' 
    },
    generatedAt: { type: Date, default: null },
  },

  // Complete audit trail of past salary revisions
  revisionHistory: [revisionHistorySchema],
}, { 
  timestamps: true 
});

schema.index({ firm: 1, 'activeProposal.status': 1 });

export default mongoose.model('WorkerSalary', schema);
