import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      required: true,
      trim: true,
      default: 'supervisor',
    },
    firms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true }],
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
      attendance_scan: { type: Boolean, default: true },
      attendance_report: { type: Boolean, default: false },
      worker_master: { type: Boolean, default: true },
      attendance_admin_master: { type: Boolean, default: false },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('User', userSchema);


 


