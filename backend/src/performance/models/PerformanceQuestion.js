import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  questionText: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 500 
  }, // Hindi question text
  active: { 
    type: Boolean, 
    default: true, 
    index: true 
  },
  displayOrder: { 
    type: Number, 
    default: 0, 
    index: true 
  }, // For ordering the question rows in the matrix
  firmApplicability: { 
    type: String, 
    enum: ['ALL', 'RAGHAV', 'SANJANA'], 
    default: 'ALL', 
    index: true 
  }, // Or can be extended to specific firm IDs if needed
  weight: { 
    type: Number, 
    default: 1, 
    min: 0 
  }, // Relative weight/points for scoring
  isCriticalViolation: { 
    type: Boolean, 
    default: false 
  }, // If true (e.g. alcohol/fight), a negative answer triggers critical penalty
  appliesToHalfDay: { 
    type: Boolean, 
    default: true 
  }, // Whether half-day workers answer this question
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  updatedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
}, { 
  timestamps: true 
});

schema.index({ active: 1, displayOrder: 1 });

export default mongoose.model('PerformanceQuestion', schema);