import mongoose from 'mongoose'

const temperatureLogSchema=new mongoose.Schema({

  firm:{
    type: mongoose.Schema.Types.ObjectId,
    ref:'Firm',
    required:[true,'firm name is rrquired'],
    index: true,
  },
  spot:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'ThermometerSpot',
    default:null,
  },
  shed:{
       type: String,
      required: [true, 'Shed is required'],
      trim: true,
  },
  line:{
     type: String,
      required: [true, 'Line is required'],
      trim: true,
      default: 'Line 1',
  },
  position:{
    type: String,
      required: [true, 'Position is required'],
      enum: ['Pad Side', 'Middle', 'Fan Side'],
  },
  temperature:{
     type: Number,
      required: [true, 'Temperature reading is required'],
      min: [-10, 'Temperature too low'],
      max: [55, 'Temperature too high'],
  },
  verifiedByqr:{
          type: Boolean,
         default: false,
  },
  capturedAt:{
       type: Date,
      default: Date.now,
      index: true,
  },
  roundSlot:{
       type: String,
      trim: true,
  },
  worker:{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
  },


},{timestamps:true})



// Indexing taaki reports super-fast load hon
temperatureLogSchema.index({ firm: 1, capturedAt: -1 });
temperatureLogSchema.index({ firm: 1, shed: 1, capturedAt: -1 });

const TemperatureLog = mongoose.model('TemperatureLog', temperatureLogSchema);

export default TemperatureLog;