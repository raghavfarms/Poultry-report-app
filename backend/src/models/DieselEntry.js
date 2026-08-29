import mongoose from 'mongoose';

const assetEntrySchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    label: { type: String, required: true },
    category: { type: String, enum: ['genset', 'tractor', 'vehicle'], required: true },
    tankCapacity: { type: Number, default: 0 },
    serviceIntervalMinutes: { type: Number, default: 225 * 60 },
    order: { type: Number, default: 0 },
    runningMinutes: { type: Number, default: 0, min: 0, max: 1440 },
    refillLiters: { type: Number, default: 0, min: 0 },
    isFull: { type: Boolean, default: true },
    serviceDone: { type: Boolean, default: false },
  },
  { _id: false },
);

const dieselEntrySchema = new mongoose.Schema(
  {
    firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    dieselInLiters: { type: Number, default: 0, min: 0 },
    lightConsumptionMinutes: { type: Number, default: 0, min: 0, max: 1440 },
    assetEntries: { type: [assetEntrySchema], default: [] },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

dieselEntrySchema.index({ firm: 1, date: 1 }, { unique: true });

export default mongoose.model('DieselEntry', dieselEntrySchema);

