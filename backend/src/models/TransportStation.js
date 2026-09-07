import mongoose from 'mongoose';

const transportStationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, uppercase: true, maxlength: 100 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

transportStationSchema.index({ name: 1 }, { unique: true });

export default mongoose.model('TransportStation', transportStationSchema);

