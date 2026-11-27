import mongoose from 'mongoose'

const PUNCH_PHOTO_TTL_MS=7*24*60*60*1000;   //     7 days in milliseconds 

const schema=new mongoose.Schema({

     firm:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Firm',
        required:true,
        index:true,
     },
     worker:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'AttendanceWorker',
        required:true,
        index:true,
     },
     sessionId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:'AttendanceSession',
        required:true,
        index:true,
     },
     eventId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:'AttendanceEvent',
      default:null
     },
     eventType:{
      type:String,
      enum:['DUTY_IN','LUNCH_OUT','LUNCH_IN','DUTY_OUT'],
      required:true,
     },
     date:{
      type:String,
      required:true,
     },
     capturedAt:{
      type:Date,
      default:Date.now,
     },
     imageData:{
      type:String,
      required:true,
      maxLength:150000
     },
     expiresAt:{
        type:Date,
        default: ()=>new Date(Date.now()+ PUNCH_PHOTO_TTL_MS),
        required:true,
     },

},{timestamps:true})

//  MongoDB  TTL index : automatically removes photos documents onces expiresAt is reached (7 days )
   schema.index({expiresAt:1},{expireAfterSeconds:0});
   schema.index({sessionId:1,eventType:1,});
   schema.index({eventId:1},{unique:true,sparse:true});



export default mongoose.model('AttendancePunchPhoto', schema);
