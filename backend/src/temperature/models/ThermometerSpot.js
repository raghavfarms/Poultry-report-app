
import mongoose from 'mongoose'

const thermometerSpotSchema =new mongoose.Schema({

 
   spotCode:{
    type:String,
    required:[true,'spot code required'],
    unique:true,
    trim:true,
    uppercase:true,
   },

   firm:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'Firm',
    required:[true,'firm reference is required'],
    index:true,
   },

       // Denormalized firm name for fast display without expensive population

       firmName:{
        type:String,
        required:[true,'firm name is required'],
        trim:true,
       },

     shed:{
      type:String,
      required:[true, 'shed name is required'],
      trim:true,
     },

     line:{
      type:String,
      required:[true,'line number is required'],
      trim:true,

     },

     position:{
             type:String,
             required:[true,'position is required '],
             enum:{
              values:['Pad Side','Middle','Fan Side'],
              message:`{VALUE} is not valid position choose pad side, middle ,fan side `,
             },
        trim:true,
     },

      // Sort order for displaying rows in the report (Pad = 1, Mid = 2, Fan = 3)

      orderIndex:{
        type:Number,
        default:1,
      },

   // Active status (soft delete capability)

    active:{
             type:Boolean,
             default:true,
    },

},{timestamps:true});



  //  compound Unique Index : prevent duplicate spot in the same firm , shed , position
   thermometerSpotSchema.index(
    {firm:1,shed:1,line:1,position:1},
    {unique:true}
   );




export default mongoose.model('ThermometerSpot',thermometerSpotSchema)