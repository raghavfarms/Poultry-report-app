import mongoose from 'mongoose';

const assetSchema = new mongoose.Schema(
  {
    firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, index: true },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    category: { type: String, enum: ['genset', 'tractor', 'vehicle'], default: 'genset' },
    tankCapacity: { type: Number, default: 0, min: 0 },
    serviceIntervalMinutes: { type: Number, default: 225 * 60, min: 60 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

assetSchema.index({ firm: 1, label: 1 }, { unique: true });

export default mongoose.model('Asset', assetSchema);

