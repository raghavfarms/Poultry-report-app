import mongoose from 'mongoose';

const reference = (ref, required = true, immutable = false) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref,
  required,
  ...(immutable ? { immutable: true } : {}),
});
const schema = new mongoose.Schema({
  worker: reference('AttendanceWorker', true, true),
  firm: reference('Firm', true, true),
  workLocation: reference('AttendanceWorkLocation', true, false),
  designation: reference('AttendanceDesignation', true, false),
  supervisor: { ...reference('AttendanceWorker', false, false), default: null },
  workerCodeSnapshot: { type: String, required: true, immutable: true },
  workerNameSnapshot: { type: String, required: true },
  firmNameSnapshot: { type: String, required: true, immutable: true },
  workLocationNameSnapshot: { type: String, required: true },
  designationNameSnapshot: { type: String, required: true },
  supervisorNameSnapshot: { type: String, default: '' },
  allocationType: {
    type: String, enum: ['INITIAL', 'PERMANENT', 'SHED_TRANSFER', 'FARM_TRANSFER', 'CORRECTION'],
    required: true,
  },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date, default: null },
  reason: { type: String, required: true, maxlength: 1000 },
  createdBy: reference('User', true, true),
}, { timestamps: true, optimisticConcurrency: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// This flag means the interval has no end; effective-at queries use dates, not this flag.
schema.virtual('active').get(function () { return this.effectiveTo == null; });
schema.pre('validate', function () {
  if (this.effectiveTo && this.effectiveTo < this.effectiveFrom) {
    this.invalidate('effectiveTo', 'Deployment end must be on or after its start.');
  }
});
schema.index({ worker: 1, effectiveFrom: -1, _id: -1 });
schema.index({ firm: 1, effectiveFrom: -1, _id: -1 });
schema.index({ firm: 1, workLocation: 1, effectiveFrom: -1 });
schema.index({ firm: 1, supervisor: 1, effectiveFrom: -1 });
schema.index({ worker: 1 }, { unique: true, partialFilterExpression: { effectiveTo: null }, name: 'one_open_deployment_per_worker' });
schema.index({ worker: 1, allocationType: 1 }, { unique: true, partialFilterExpression: { allocationType: 'INITIAL' }, name: 'one_initial_deployment_per_worker' });

export default mongoose.model('AttendanceWorkerDeployment', schema);

