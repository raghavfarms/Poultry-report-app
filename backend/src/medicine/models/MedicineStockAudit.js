import mongoose from 'mongoose';

const medicineStockAuditSchema = new mongoose.Schema(
  {
    farm: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Firm',
      required: true,
      index: true,
    },
    // Date of audit: YYYY-MM-DD
    date: {
      type: String,
      required: true,
      index: true,
    },
    auditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    auditedByName: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'RECONCILED'],
      default: 'SUBMITTED',
    },
    items: [
      {
        medicine: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'MedicineMaster',
          required: true,
        },
        medicineName: { type: String, default: '' },
        packSize: { type: Number, default: 1 },
        unit: { type: String, default: '' },
        openingQuantity: { type: Number, default: 0 },
        receivedQuantity: { type: Number, default: 0 },
        issuedQuantity: { type: Number, default: 0 },
        closingQuantity: { type: Number, default: 0 },
        physicalQuantity: { type: Number, default: 0 },
        difference: { type: Number, default: 0 },
        remarks: { type: String, trim: true, default: '' },
      },
    ],
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

// Ensure only one audit per farm + date (upsert friendly)
medicineStockAuditSchema.index({ farm: 1, date: 1 }, { unique: true });

export default mongoose.model('MedicineStockAudit', medicineStockAuditSchema);

