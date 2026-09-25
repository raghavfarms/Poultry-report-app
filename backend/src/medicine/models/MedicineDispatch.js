import mongoose from 'mongoose';

const dispatchItemSchema = new mongoose.Schema(
  {
    medicine: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MedicineMaster',
      required: true,
    },
    batchNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    manufacturingDate: {
      type: String,
      default: null,
    },
    expiryDate: {
      type: String,
      required: true,
    },
    dispatchedQuantity: {
      type: Number,
      required: true,
      min: [1, 'Dispatched quantity must be at least 1'],
    },
    unit: {
      type: String,
      required: true,
    },
  },
  { _id: true }
);

const medicineDispatchSchema = new mongoose.Schema(
  {
    dispatchNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    sourceLocation: {
      type: String,
      default: 'Head Office Central Store',
      trim: true,
    },
    destinationFarm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: [true, 'Destination Farm is required'],
      index: true,
    },
    dispatchDate: {
      type: String,
      required: true,
      default: () => new Date().toISOString().slice(0, 10),
    },
    vehicleNumber: {
      type: String,
      trim: true,
      default: '',
    },
    driverName: {
      type: String,
      trim: true,
      default: '',
    },
    driverMobile: {
      type: String,
      trim: true,
      default: '',
    },
    items: [dispatchItemSchema],

    // Multi-tier State Machine:
    // DISPATCHED: Head office dispatched. In transit. Available stock = 0.
    // GATE_RECEIVED: Security verified physical arrival at gate. Available stock = 0.
    // STORE_ACCEPTED: Storekeeper verified and accepted into live farm inventory.
    // REJECTED: Damaged or returned.
    status: {
      type: String,
      enum: ['DISPATCHED', 'GATE_RECEIVED', 'STORE_ACCEPTED', 'REJECTED'],
      default: 'DISPATCHED',
      index: true,
    },

    // Step 2: Gate Security Arrival Confirmation
    gateArrival: {
      arrivedAt: { type: Date, default: null },
      securityGuard: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      packagesCount: { type: Number, default: 0 },
      hasVisibleDamage: { type: Boolean, default: false },
      remarks: { type: String, default: '' },
    },

    // Step 3: Storekeeper Formal Acceptance
    storeAcceptance: {
      acceptedAt: { type: Date, default: null },
      storekeeper: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      acceptedQuantity: { type: Number, default: 0 },
      discrepancyQuantity: { type: Number, default: 0 },
      remarks: { type: String, default: '' },
    },

    dispatchedBy: {
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
    timestamps: true,
  }
);

medicineDispatchSchema.index({ destinationFarm: 1, status: 1, dispatchDate: -1 });

export default mongoose.model('MedicineDispatch', medicineDispatchSchema);
