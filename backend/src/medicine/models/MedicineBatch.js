import mongoose from 'mongoose';

const medicineBatchSchema = new mongoose.Schema(
  {
    // Which medicine catalog item is this?
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: [true, 'Medicine is required'],
      index: true,
    },

    // Physical batch number printed on the container
    batchNumber: {
      type: String,
      required: [true, 'Batch number is required'],
      uppercase: true,
      trim: true,
    },

    // Which farm owns this stock? (Raghav / Sanjana)
    farm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Farm is required'],
      index: true,
    },

    // Original supplier of this batch (optional for internal HO transfers)
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },

    // The Receipt that originally brought this batch into the farm
    firstReceipt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineReceipt',
      default: null,
    },

    manufacturingDate: {
      type: String,
      default: null,
    },

    expiryDate: {
      type: String,
      required: [true, 'Expiry date is required'],
      index: true, // Indexed because we sort by expiry for FEFO!
    },

    // Total quantity originally received across all receipts for this batch
    initialQuantity: {
      type: Number,
      required: true,
      min: [0, 'Initial quantity cannot be negative'],
    },

    // Live remaining balance available for issue
    quantityAvailable: {
      type: Number,
      required: true,
      min: [0, 'Available quantity cannot be negative'],
    },

    unit: {
      type: String,
      required: [true, 'Unit of measurement is required'],
    },

    // Batch Status:
    // AVAILABLE: Ready to be issued
    // HOLD: Temporarily blocked by management for quality checks
    // DEPLETED: Quantity reached 0
    // EXPIRED: Passed expiry date
    status: {
      type: String,
      enum: {
        values: ['AVAILABLE', 'HOLD', 'DEPLETED', 'EXPIRED'],
        message: '{VALUE} is not a valid batch status',
      },
      default: 'AVAILABLE',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: At a given farm, a batch number for a specific medicine is unique
medicineBatchSchema.index({ medicine: 1, batchNumber: 1, farm: 1 }, { unique: true });

export default mongoose.model('MedicineBatch', medicineBatchSchema);