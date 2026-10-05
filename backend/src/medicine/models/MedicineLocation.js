import mongoose from 'mongoose';

const medicineLocationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nameKey: { type: String, required: true },
  farm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', default: null },
  removed: { type: Boolean, default: false },
}, { timestamps: true });

medicineLocationSchema.index({ farm: 1, nameKey: 1 }, { unique: true });

// Safely drop legacy global index if present in MongoDB
const dropLegacyIndex = () => {
  mongoose.model('MedicineLocation', medicineLocationSchema).collection?.dropIndex('nameKey_1').catch(() => {});
};
if (mongoose.connection?.readyState === 1) {
  dropLegacyIndex();
} else {
  mongoose.connection.once('connected', dropLegacyIndex);
}

export default mongoose.model('MedicineLocation', medicineLocationSchema);
