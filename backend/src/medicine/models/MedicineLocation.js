import mongoose from 'mongoose';

const medicineLocationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  nameKey: { type: String, required: true, unique: true },
  removed: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model('MedicineLocation', medicineLocationSchema);
