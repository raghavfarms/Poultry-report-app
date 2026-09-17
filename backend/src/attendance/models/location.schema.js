import mongoose from 'mongoose';
import { locationMessages } from '../services/location.service.js';

// Embed on each future IN/OUT event, not on Worker: each scan has its own location.
// Normalize input with normalizeAttendanceLocation before persisting this subdocument.
export const attendanceLocationSchema = new mongoose.Schema({
  status: { type: String, enum: Object.keys(locationMessages), default: 'NOT_PROVIDED', required: true },
  latitude: { type: Number, min: -90, max: 90 },
  longitude: { type: Number, min: -180, max: 180 },
  accuracyMetres: { type: Number, min: 0 },
  capturedAt: { type: Date },
}, { _id: false });




 