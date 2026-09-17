import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', default: null }, // null = All Firms / Office Testing
  name: { type: String, required: true, trim: true, maxlength: 100 },
  nameKey: { type: String, required: true },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  radiusMetres: { type: Number, required: true, min: 10, max: 50000, default: 500 },
  isOfficeTesting: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
  order: { type: Number, min: 0, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ firm: 1, nameKey: 1 }, { unique: true });
schema.index({ firm: 1, active: 1, order: 1, name: 1 });
export default mongoose.model('AttendanceGeofence', schema);

