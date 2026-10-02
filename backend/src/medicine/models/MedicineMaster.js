

import mongoose from 'mongoose';
import { nextMedicineCode } from '../services/medicineCode.js';

const medicineSchema=new mongoose.Schema({
 
     // unique code for every medicine (e.g MED-001)
     // uppercase true ensures 'med-001'  is saved as MED-001


      code:{
        type:String,
        trim:true,
        uppercase:true,
        unique:true,
        sparse:true, // Allows multiple documents without breaking unique index
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

      aliasName:{
        type:String,
        trim:true,
        default:'',
        maxlength:120,
      },





      category:{
      type: String ,
      required: [true,'Category is required'],
       trim: true,
      },

       //  unit of Measurement (e.g  bottle,litre,tablet)

        unit: {
          type: String,
          required: [true, 'Unit of measurement is required'],
          trim: true,
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

     suppliers: [
       {
         type: mongoose.Schema.Types.ObjectId,
         ref: 'Supplier',
       },
     ],

    createdBy:{
        type : mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },

},{
    timestamps:true
});

// Both medicine entry flows share the same sequential code allocator.
medicineSchema.pre('validate', async function () {
  if (!this.code) this.code = await nextMedicineCode(this.constructor);
});

export default mongoose.model('MedicineMaster',medicineSchema);  

// Argument 1 ('MedicineMaster'): The Name of the model.
// Argument 2 (medicineSchema): The Rules & Structure (the Schema you wrote with code, name, category, etc.).
