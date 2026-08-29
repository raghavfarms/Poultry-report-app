import mongoose from 'mongoose';

const firmSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    dieselOpeningBalance: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Firm', firmSchema);

