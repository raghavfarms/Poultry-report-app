import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['developer', 'admin', 'supervisor', 'security', 'farm_incharge', 'office', 'user', 'labour'],
      default: 'user',
    },
    firms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Firm', required: true }],
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model('User', userSchema);
