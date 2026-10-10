import mongoose from 'mongoose';

export default mongoose.model('MedicineCodeCounter', new mongoose.Schema({
  _id: String,
  sequence: { type: Number, default: 0 },
}));
