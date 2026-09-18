import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  nameKey: { type: String, required: true },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ firm: 1, nameKey: 1 }, { unique: true });
schema.index({ firm: 1, active: 1, name: 1 });
export default mongoose.model('AttendanceDesignation', schema);


 