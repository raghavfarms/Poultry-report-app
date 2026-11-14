import mongoose from 'mongoose';

const formulationItemSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FeedMedRawMaster',
    required: true,
  },
  itemType: {
    type: String,
    enum: ['Raw Material', 'Feed Medicine'],
    required: true,
  },
  itemName: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0, // In kg (e.g., 710, 0.75, 1.5)
  },
  percentage: {
    type: Number,
    min: 0,
    max: 100, // (quantity / targetBatchSize) * 100
  },
  uom: {
    type: String,
    default: 'kg',
  },
});

const feedFormulationSchema = new mongoose.Schema(
  {
    bomNumber: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      maxlength: 30, // e.g. BOM-001
    },
    feedName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120, // e.g. SANJANA BP-10
    },
    feedType: {
      type: String,
      required: true,
      enum: [
        'CHICKS',
        'GROWER',
        'DEVELOPER',
        'PRE-BREEDER',
        'PHASE-1',
        'PHASE-2',
        'PHASE-3',
        'OTHER',
      ],
      default: 'PHASE-2',
    },
    consumedBy: {
      type: String,
      enum: ['ALL BIRDS', 'FEMALE', 'MALE'],
      default: 'ALL BIRDS',
    },
    flockName: {
      type: String,
      trim: true,
      default: 'All Flocks',
    },
    targetBatchSize: {
      type: Number,
      required: true,
      default: 1000, // Standard 1 Ton = 1000 kg
    },
    totalWeight: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    items: [formulationItemSchema],
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('FeedFormulation', feedFormulationSchema);