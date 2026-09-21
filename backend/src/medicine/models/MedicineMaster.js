

import mongoose from 'mongoose';

const medicineSchema=new mongoose.Schema({
 
     // unique code for every medicine (e.g MED-001)
     // uppercase true ensures 'med-001'  is saved as MED-001


     code:{
        type:String,
        required:[true,'Medicine code is required'],
        trim:true ,  // "MED-011 "  convert "MED-011"    reomve space 
        uppercase:true,
        unique:true,
        maxlength:30
      },

      // Medicine name --eg paracetamol 

      name:{
        type : String ,
        required: [true,'Medicine name is Required'],
        trim: true,
        maxlength:120,
      },

      // Medicine Category

      category:{
      type: String ,
      required: [true,'Category is required'],
      enum:{
        values:['FEED_MEDICINE','GENERAL_MEDICINE','VACCINATION'],
        message:'{VALUE} is not a valid medicine category',
       },
      },

       //  unit of Measurement (e.g  bottle,litre,tablet)

        unit :{
            type: String,
            required:[true,'unit of measurement is required'],
            enum:{
                values:['Bottle','Litre','ml','Kg','Gram','Tablet','Dose','Packet','Vial', 'Other'],
                message:'{VALUE} is not valid unit',
            },
        },

        // Manufacturer/ Brand Name (Optional)

        manufacturer:{
            type:String,
            trim:true,
            default:'',
        },

        // Expected shelf life in months (optional)

        shelfLifeMonths:{
            type:Number,
            min:[0,'shelf life cannot be negative '],
            default:null,
        },

    //   minimum stock 

       minimumStock:{
        type:Number,
        min:0,
        default:null,
       },

     //  reorderLevel: Number,min 0 , default 0
     reorderLevel:{
        type :Number,
        min:0,
        default:0,
     },

     active:{
         type:Boolean,
         default:true,
         index:true,
     },

    createdBy:{
        type : mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

},{
    timestamps:true
});

export default mongoose.model('MedicineMaster',medicineSchema);  

// Argument 1 ('MedicineMaster'): The Name of the model.
// Argument 2 (medicineSchema): The Rules & Structure (the Schema you wrote with code, name, category, etc.).
