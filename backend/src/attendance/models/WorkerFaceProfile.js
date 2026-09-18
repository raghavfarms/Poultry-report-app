import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  worker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AttendanceWorker',
    required: true,
    unique: true,
  },
  firm: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Firm',
    required: true,
    index: true,
  },
  descriptor: {
    type: [Number],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length === 128 && arr.every((n) => typeof n === 'number' && Number.isFinite(n)),
      message: 'Descriptor must be a 128-element array of finite numbers.',
    },
  },
  descriptorVersion: {
    type: String,
    default: 'v1',
    trim: true,
  },
  quality: {
    score: { type: Number, default: 1 },
    faceBox: {
      x: { type: Number },
      y: { type: Number },
      width: { type: Number },
      height: { type: Number },
    },
  },
  active: {
    type: Boolean,
    default: true,
    index: true,
  },
  registeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  registeredAt: {
    type: Date,
    default: Date.now,
  },
}, { timestamps: true });

schema.index({ firm: 1, active: 1 });

export default mongoose.model('AttendanceWorkerFaceProfile', schema);




