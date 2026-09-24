import mongoose from 'mongoose';

const medicineIssueSchema = new mongoose.Schema(
  {
    // Auto-generated sequential Issue ID: ISS-YYYY-XXXX (e.g. ISS-2026-0001)
    issueNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Date of issue (YYYY-MM-DD or default today)
    issueDate: {
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

    // Physical batch reference that was deducted
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineBatch',
      required: [true, 'Batch is required'],
      index: true,
    },

    // Batch number snapshot for quick indexing & audit
    batchNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },

    // Farm where the medicine was issued
    farm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Farm is required'],
      index: true,
    },

    // Shed name/number where medicine is consumed (e.g. 'Shed 1', 'Shed 2')
    shed: {
      type: String,
      required: [true, 'Target shed is required'],
      trim: true,
      index: true,
    },

    // Flock identifier (e.g. 'Flock 2026-A', 'Batch 14')
    flockNumber: {
      type: String,
      trim: true,
      default: '',
    },

    // Number of birds treated (if known)
    birdCount: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Age of birds in days (critical for poultry vaccination schedule)
    birdAgeDays: {
      type: Number,
      min: 0,
      default: 0,
    },

    // Issued Quantity
    issuedQuantity: {
      type: Number,
      required: [true, 'Issued quantity is required'],
      min: [1, 'Issued quantity must be at least 1'],
    },

    // Unit of measurement snapshot (Bottle, Dose, Vial, Litre, etc.)
    unit: {
      type: String,
      required: true,
      trim: true,
    },

    // Clinical or farm purpose
    purpose: {
      type: String,
      enum: {
        values: [
          'ROUTINE_VACCINATION',
          'TREATMENT',
          'GROWTH_SUPPLEMENT',
          'WATER_SANITIZATION',
          'BIOSECURITY',
          'OTHER',
        ],
        message: '{VALUE} is not a valid issue purpose',
      },
      default: 'TREATMENT',
      required: true,
      index: true,
    },

    // Administration instructions (e.g. "2ml per 10 litres in morning water for 3 days")
    dosageInstructions: {
      type: String,
      trim: true,
      default: '',
    },

    // Name of the recipient supervisor, flocker, or vaccinator
    issuedTo: {
      type: String,
      required: [true, 'Recipient name/designation is required'],
      trim: true,
    },

    // Storekeeper / User who issued the stock
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Additional observations or remarks
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

// Compound indexes for lightning-fast poultry reports
medicineIssueSchema.index({ farm: 1, shed: 1, issueDate: -1 });
medicineIssueSchema.index({ medicine: 1, issueDate: -1 });

export default mongoose.model('MedicineIssue', medicineIssueSchema);

