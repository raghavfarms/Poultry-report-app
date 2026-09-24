import mongoose from 'mongoose';

const medicineAdjustmentSchema = new mongoose.Schema(
  {
    // Auto-generated sequential ID: ADJ-YYYY-XXXX (e.g. ADJ-2026-0001)
    adjustmentNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Category of adjustment
    type: {
      type: String,
      enum: {
        values: [
          'RETURN_INWARD',    // Unused stock returned from shed back to store
          'ADJUSTMENT_IN',    // Audit surplus found during physical count
          'ADJUSTMENT_OUT',   // Physical damage, leakage, breakage, or shortage
          'DISPOSAL_EXPIRED', // Biosecure destruction of expired or contaminated medicines
        ],
        message: '{VALUE} is not a valid adjustment type',
      },
      required: true,
      index: true,
    },

    // Date of transaction (YYYY-MM-DD)
    adjustmentDate: {
      type: String,
      required: true,
      default: () => new Date().toISOString().slice(0, 10),
      index: true,
    },

    // Medicine catalog reference
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: [true, 'Medicine is required'],
      index: true,
    },

    // Batch reference
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineBatch',
      required: [true, 'Batch is required'],
      index: true,
    },

    // Batch number snapshot
    batchNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Farm location
    farm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Farm is required'],
      index: true,
    },

    // Source shed (for RETURN_INWARD)
    shed: {
      type: String,
      trim: true,
      default: '',
    },

    // Quantity adjusted
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },

    // Unit of measurement
    unit: {
      type: String,
      required: true,
      trim: true,
    },

    // Reason code or explanation
    reason: {
      type: String,
      required: [true, 'Reason for adjustment/return/disposal is required'],
      trim: true,
    },

    // Disposal method (for DISPOSAL_EXPIRED: Incineration, Deep Burial, Supplier Return, etc.)
    disposalMethod: {
      type: String,
      trim: true,
      default: '',
    },

    // Witness / Second verifier (crucial for biological waste & high-value drug audits)
    witnessedBy: {
      type: String,
      trim: true,
      default: '',
    },

    // User / Storekeeper who recorded the action
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Additional audit remarks
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Fast indexing for audit reports
medicineAdjustmentSchema.index({ farm: 1, type: 1, adjustmentDate: -1 });
medicineAdjustmentSchema.index({ medicine: 1, batchNumber: 1 });

export default mongoose.model('MedicineAdjustment', medicineAdjustmentSchema);
