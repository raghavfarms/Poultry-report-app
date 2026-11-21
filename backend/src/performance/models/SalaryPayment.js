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

  month: { 
    type: String, 
    required: true, 
    index: true 
  }, // Format: 'YYYY-MM', e.g. '2026-11'

  salaryAmount: { 
    type: Number, 
    required: true, 
    min: 0 
  }, // Net payable amount for the month

  status: { 
    type: String, 
    enum: ['PENDING', 'PAID'], 
    default: 'PENDING', 
    index: true 
  },

  paymentDate: { 
    type: Date, 
    default: null 
  }, // Typically around the 22nd

  paymentMethod: { 
    type: String, 
    enum: ['BANK_TRANSFER', 'CASH', 'UPI', 'CHEQUE', 'OTHER'], 
    default: 'BANK_TRANSFER' 
  },

  transactionReference: { 
    type: String, 
    trim: true, 
    default: '' 
  }, // UTR / IMPS reference / Cheque number

  remarks: { 
    type: String, 
    trim: true, 
    default: '' 
  },

  recordedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null
  },
}, { 
  timestamps: true   
});

// Each worker has at most one payment record per salary month
schema.index({ worker: 1, month: 1 }, { unique: true });
schema.index({ firm: 1, month: 1, status: 1 });

export default mongoose.model('SalaryPayment', schema);



