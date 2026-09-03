import mongoose from 'mongoose';

const transportVehicleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    number: { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
    tankCapacity: { type: Number, required: true, min: 0 },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

transportVehicleSchema.index({ number: 1 }, { unique: true });

export default mongoose.model('TransportVehicle', transportVehicleSchema);
