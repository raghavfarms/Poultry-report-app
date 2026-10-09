import mongoose from 'mongoose';

const medicineTransferSchema = new mongoose.Schema(
  {
    transferNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Source Farm (e.g. Sanjana)
    fromFarm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Source farm is required'],
      index: true,
    },

    // Destination Farm (e.g. Raghav)
    toFarm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Destination farm is required'],
      index: true,
    },

    // Medicine item being transferred
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: [true, 'Medicine is required'],
      index: true,
    },

    // Source batch at fromFarm
    sourceBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineBatch',
      required: [true, 'Source batch is required'],
    },

    // Preserved batch metadata
    batchNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    expiryDate: {
      type: String,
      required: true,
    },
    manufacturingDate: {
      type: String,
      default: null,
    },

    // Destination batch at toFarm (set when ACCEPTED)
    destinationBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineBatch',
      default: null,
    },

    // Transfer quantity & unit
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0.01, 'Quantity must be greater than zero'],
    },
    unit: {
      type: String,
      required: true,
    },

    // Status of transfer
    // PENDING: Requested & on hold at fromFarm
    // ACCEPTED: Confirmed by destination & moved into destination stock
    // REJECTED: Declined by destination & restored back to fromFarm available stock
    // CANCELLED: Cancelled by sender before acceptance & restored
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
        message: '{VALUE} is not a valid transfer status',
      },
      default: 'PENDING',
      index: true,
    },

    // Driver / Delivery / Notes
    transportDetails: {
      vehicleNo: { type: String, trim: true, default: '' },
      personName: { type: String, trim: true, default: '' },
      notes: { type: String, trim: true, default: '' },
    },

    // Rejection reason if declined
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
    },

    // Who initiated
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    requestedByName: {
      type: String,
      default: '',
    },

    // Who accepted / rejected
    actionedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actionedByName: {
      type: String,
      default: '',
    },
    actionedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for audit reports & pending counts
medicineTransferSchema.index({ fromFarm: 1, toFarm: 1, createdAt: -1 });
medicineTransferSchema.index({ toFarm: 1, status: 1 });
medicineTransferSchema.index({ fromFarm: 1, status: 1 });

export default mongoose.model('MedicineTransfer', medicineTransferSchema);

