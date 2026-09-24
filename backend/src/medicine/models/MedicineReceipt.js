import mongoose from 'mongoose';

const medicineReceiptSchema = new mongoose.Schema(
  {
    // Unique human-readable receipt number, e.g. "RCP-2026-0001"
    receiptNumber: {
      type: String,
      required: [true, 'Receipt Number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },

    // Optional link to Purchase Order (if received against a PO)
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null,
      index: true,
    },

    // Medicine being received
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: [true, 'Medicine is required'],
      index: true,
    },

    // Supplier who delivered the medicine
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required'],
      index: true,
    },

    // Destination Farm (Raghav / Sanjana)
    farm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Destination Farm is required'],
      index: true,
    },

    // Batch details on the physical product
    batchNumber: {
      type: String,
      required: [true, 'Batch number is required'],
      uppercase: true,
      trim: true,
    },

    manufacturingDate: {
      type: String,
      default: null,
    },

    expiryDate: {
      type: String,
      required: [true, 'Expiry date is required'],
    },

    // Quantity stated on delivery challan / physical count
    receivedQuantity: {
      type: Number,
      required: [true, 'Received quantity is required'],
      min: [1, 'Received quantity must be at least 1'],
    },

    unit: {
      type: String,
      required: [true, 'Unit of measurement is required'],
    },

    invoiceOrChallanNo: {
      type: String,
      trim: true,
      default: '',
    },

    // Multi-step State Machine:
    // PENDING_STORE_VERIFICATION: Physical arrival recorded, NOT yet in available stock.
    // STORE_ACCEPTED: Storekeeper verified. Stock enters MedicineBatch & Ledger!
    // STORE_REJECTED: Damaged, leaked, or rejected.
    status: {
      type: String,
      enum: {
        values: ['PENDING_STORE_VERIFICATION', 'STORE_ACCEPTED', 'STORE_REJECTED'],
        message: '{VALUE} is not a valid receipt status',
      },
      default: 'PENDING_STORE_VERIFICATION',
      index: true,
    },

    // Actual quantity accepted into stock by the storekeeper
    storeAcceptedQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Accepted quantity cannot be negative'],
    },

    verificationRemarks: {
      type: String,
      trim: true,
      default: '',
    },

    // Audit trail
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Auto-manages createdAt and updatedAt
  }
);

export default mongoose.model('MedicineReceipt', medicineReceiptSchema);