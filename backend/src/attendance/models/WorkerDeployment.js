import mongoose from 'mongoose';

const reference = (ref, required = true) => ({ type: mongoose.Schema.Types.ObjectId, ref, required, immutable: true });
const schema = new mongoose.Schema({
  worker: reference('AttendanceWorker'),
  firm: reference('Firm'),
  workLocation: reference('AttendanceWorkLocation'),
  designation: reference('AttendanceDesignation'),
  supervisor: { ...reference('AttendanceWorker', false), default: null },
  workerCodeSnapshot: { type: String, required: true, immutable: true },
  workerNameSnapshot: { type: String, required: true, immutable: true },
  firmNameSnapshot: { type: String, required: true, immutable: true },
  workLocationNameSnapshot: { type: String, required: true, immutable: true },
  designationNameSnapshot: { type: String, required: true, immutable: true },
  supervisorNameSnapshot: { type: String, default: '', immutable: true },
  allocationType: {
    type: String, enum: ['INITIAL', 'PERMANENT', 'SHED_TRANSFER', 'FARM_TRANSFER', 'CORRECTION'],
    required: true, immutable: true,
  },
  effectiveFrom: { type: Date, required: true, immutable: true },
  effectiveTo: { type: Date, default: null },
  reason: { type: String, required: true, maxlength: 1000, immutable: true },
  createdBy: reference('User'),
}, { timestamps: true, optimisticConcurrency: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// This flag means the interval has no end; effective-at queries use dates, not this flag.
schema.virtual('active').get(function () { return this.effectiveTo == null; });
schema.pre('validate', function () {
  if (this.effectiveTo && this.effectiveTo <= this.effectiveFrom) {
    this.invalidate('effectiveTo', 'Deployment end must be after its start.');
  }
});
schema.index({ worker: 1, effectiveFrom: -1, _id: -1 });
schema.index({ firm: 1, effectiveFrom: -1, _id: -1 });
schema.index({ firm: 1, workLocation: 1, effectiveFrom: -1 });
schema.index({ firm: 1, supervisor: 1, effectiveFrom: -1 });
schema.index({ worker: 1 }, { unique: true, partialFilterExpression: { effectiveTo: null }, name: 'one_open_deployment_per_worker' });
schema.index({ worker: 1, allocationType: 1 }, { unique: true, partialFilterExpression: { allocationType: 'INITIAL' }, name: 'one_initial_deployment_per_worker' });

export default mongoose.model('AttendanceWorkerDeployment', schema);

