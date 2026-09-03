import mongoose from 'mongoose';

const transportEntrySchema = new mongoose.Schema(
  {
    vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'TransportVehicle', required: true, index: true },
    vehicleName: { type: String, required: true },
    vehicleNumber: { type: String, required: true },
    tankCapacity: { type: Number, required: true, min: 0 },
    from: { type: String, trim: true, maxlength: 120, default: '' },
    destination: { type: String, trim: true, maxlength: 120, default: '' },
    openingDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    openingTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    openingReading: { type: Number, required: true, min: 0 },
    closingDate: { type: String, default: '', validate: (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value) },
    closingReading: { type: Number, default: null, min: 0 },
    fill1Liters: { type: Number, default: 0, min: 0 },
    fill2Liters: { type: Number, default: 0, min: 0 },
    isFull: { type: Boolean, default: false },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

transportEntrySchema.index({ vehicle: 1, openingDate: 1, openingTime: 1 });

export default mongoose.model('TransportEntry', transportEntrySchema);
