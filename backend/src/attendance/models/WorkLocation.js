import mongoose from 'mongoose';

const capacitySchema = new mongoose.Schema({
  male: { type: Number, required: true, min: 0, max: 1000000000, validate: Number.isSafeInteger },
  female: { type: Number, required: true, min: 0, max: 1000000000, validate: Number.isSafeInteger },
}, { _id: false });

const schema = new mongoose.Schema({
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, immutable: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  nameKey: { type: String, required: true },
  type: { type: String, enum: ['SHED', 'MISCELLANEOUS'], required: true },
  birdCapacity: { type: capacitySchema, default: null },
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorker', default: null },
  active: { type: Boolean, default: true },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
  order: { type: Number, min: 0, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ firm: 1, nameKey: 1 }, { unique: true });
schema.pre('validate', function () {
  if (this.type !== 'SHED' && this.birdCapacity != null) {
    this.invalidate('birdCapacity', 'Bird capacity can only be assigned to a shed.');
  }
});
schema.index({ firm: 1, active: 1, order: 1, name: 1 });
export default mongoose.model('AttendanceWorkLocation', schema);