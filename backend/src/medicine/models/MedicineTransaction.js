import mongoose from 'mongoose';

const medicineTransactionSchema = new mongoose.Schema(
  {
    // Type of inventory movement
    transactionType: {
      type: String,
      enum: {
        values: [
          'RECEIPT_INWARD',
          'ISSUE_OUTWARD',
          'RETURN_INWARD',
          'ADJUSTMENT_IN',
          'ADJUSTMENT_OUT',
          'DISPOSAL_EXPIRED',
        ],
        message: '{VALUE} is not a valid transaction type',
      },
      required: [true, 'Transaction type is required'],
      index: true,
    },

    // Medicine catalog item
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: [true, 'Medicine is required'],
      index: true,
    },

    // Batch link & Batch number (storing batchNumber directly makes reporting ultra-fast)
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineBatch',
      required: [true, 'Batch reference is required'],
      index: true,
    },

    batchNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Farm location (Raghav / Sanjana)
    farm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Farm is required'],
      index: true,
    },

    // Quantity moved (Always positive: transactionType tells us if it was + or -)
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.01, 'Quantity must be greater than zero'],
    },

    // Snapshot of the batch's available stock immediately AFTER this transaction
    balanceAfter: {
      type: Number,
      required: true,
      min: [0, 'Balance after cannot be negative'],
    },

    unit: {
      type: String,
      required: true,
    },

    // Dynamic reference: What document caused this transaction?
    referenceModel: {
      type: String,
      enum: ['MedicineReceipt', 'MedicineIssue', 'PurchaseOrder', 'ManualAdjustment'],
      required: true,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Audit trail: Who performed this action?
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    remarks: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true, // Captures exact createdAt timestamp
  }
);

// Index to quickly pull the ledger for any medicine or batch chronologically
medicineTransactionSchema.index({ medicine: 1, createdAt: -1 });
medicineTransactionSchema.index({ batch: 1, createdAt: -1 });

export default mongoose.model('MedicineTransaction', medicineTransactionSchema);