import mongoose from 'mongoose';

const answerSnapshotSchema = new mongoose.Schema({
  questionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'PerformanceQuestion', 
    required: true 
  },
  questionTextSnapshot: { 
    type: String, 
    required: true 
  }, // Saved text so edits in Master don't alter history
  answer: { 
    type: String, 
    enum: ['YES', 'NO'], 
    required: true 
  }, // 'YES' = positive / no problem, 'NO' = issue found
  weightSnapshot: { 
    type: Number, 
    default: 1 
  },
  isCriticalViolationSnapshot: { 
    type: Boolean, 
    default: false 
  },
}, { _id: false });

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

  deployment: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceWorkerDeployment', 
    default: null 
  },

  evaluationDate: { 
    type: String, 
    required: true, 
    index: true 
  }, // Format: 'YYYY-MM-DD' in Asia/Kolkata

  // Attendance status captured at the time of evaluation
  attendanceStatusSnapshot: { 
    type: String, 
    enum: ['PRESENT', 'HALF_DAY', 'ABSENT'], 
    required: true 
  },

  answers: [answerSnapshotSchema],

  dailyScore: { 
    type: Number, 
    default: 0 
  }, // 0 to 100 based on config rules

  dailyGrade: { 
    type: String, 
    enum: ['A', 'B', 'C', 'NOT_APPLICABLE'], 
    required: true 
  },

  hasCriticalViolation: { 
    type: Boolean, 
    default: false 
  },

  // If attendance is later corrected in Attendance module, flag for Admin review
  flaggedForReview: { 
    type: Boolean, 
    default: false 
  },
  reviewReason: { 
    type: String, 
    default: '' 
  },

  submittedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  submittedByNameSnapshot: { 
    type: String, 
    default: '' 
  },
}, { 
  timestamps: true 
});

// CRITICAL: Prevent duplicate evaluation for the same worker on the same date
schema.index({ worker: 1, evaluationDate: 1 }, { unique: true });

// Efficient lookups for monthly aggregations and firm-date reports
schema.index({ firm: 1, evaluationDate: 1 });
schema.index({ worker: 1, evaluationDate: -1 });

export default mongoose.model('DailyEvaluation', schema);