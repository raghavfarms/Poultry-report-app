import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, default: '' },
    allowedModules: {
      type: [String],
      default: ['attendance'],
    },
    moduleFirms: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    permissions: {
      attendance_edit: { type: Boolean, default: false },
      attendance_autocut: { type: Boolean, default: false },
      asset_master: { type: Boolean, default: false },
      transport_master: { type: Boolean, default: false },
      medicine_master: { type: Boolean, default: false },
      attendance_scan: { type: Boolean, default: false },
      attendance_report: { type: Boolean, default: false },
      worker_master: { type: Boolean, default: false },
      attendance_admin_master: { type: Boolean, default: false },
    },
    isSystem: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('Role', roleSchema);


