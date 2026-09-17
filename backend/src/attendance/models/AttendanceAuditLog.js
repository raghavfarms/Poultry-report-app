import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  firm: { type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true, index: true },
  firmNameSnapshot: { type: String, required: true },
  worker: { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceWorker', default: null, index: true },
  workerCodeSnapshot: { type: String, default: '' },
  workerNameSnapshot: { type: String, default: '' },
  entityType: {
    type: String,
    enum: ['ATTENDANCE_SESSION', 'WORKER_DEPLOYMENT', 'WORKER_MASTER'],
    required: true,
    index: true,
  },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: {
    type: String,
    enum: ['SHED_TRANSFER', 'FARM_TRANSFER', 'CORRECTION', 'MANUAL_PUNCH'],
    required: true,
  },
  previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
  newValue: { type: mongoose.Schema.Types.Mixed, default: null },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedByName: { type: String, required: true },
  performedByRole: { type: String, default: 'admin' },
}, { timestamps: true });

schema.index({ firm: 1, createdAt: -1 });
schema.index({ worker: 1, createdAt: -1 });
schema.index({ entityType: 1, createdAt: -1 });
schema.index({ firm: 1, action: 1, 'newValue.date': 1, worker: 1 });

export default mongoose.model('AttendanceAuditLog', schema);

