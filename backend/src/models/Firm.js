import mongoose from 'mongoose';

const firmSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    dieselOpeningBalance: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    officeGeofence: {
      enabled: { type: Boolean, default: false },
      latitude: { type: Number, default: null, min: -90, max: 90 },
      longitude: { type: Number, default: null, min: -180, max: 180 },
      radiusMetres: { type: Number, default: 500, min: 10, max: 50000 },
    },
  },
  { timestamps: true },
);

export default mongoose.model('Firm', firmSchema);


