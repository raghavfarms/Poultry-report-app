import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  _id: { type: String },
  sequence: { type: Number, required: true, min: 1 },
}, { versionKey: false });

export default mongoose.model('AttendanceWorkerCounter', schema);




