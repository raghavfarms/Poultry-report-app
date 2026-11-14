import mongoose from "mongoose";

const feedMedRawMasterSchema = new mongoose.Schema({

     code:{
       type: String,
       trim: true,
       uppercase: true,
       unique: true,
       sparse: true,
       maxlength: 30,
     },
     itemType:{
        type: String,
        required: true,
        enum:['Feed Medicine','Raw Material'],
     },
     name:{
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
     },
     companyName:{
        type: String,
        maxlength: 100,
        trim: true,
        default: ' ',
       
     },
     aliasName:{
        type: String,
        trim: true,
        maxlength: 100,
     },
     uom:{
        type: String,
        required: true,
        enum:['kg','ltr','gm','ml','ton'],
     },

      packagingType:{
        type: String,
        required: true,
        trim: true,
        default: 'Bag',
     },

     packSize:{
        type: Number,
        required: true,
        min: 0,
     },
     category:{
        type: String,
        enum:['Regular','Treatment',null]
    },

    isActive:{
        type: Boolean,
        default: true,
    },

}, { timestamps: true });  

export default mongoose.model("FeedMedRawMaster", feedMedRawMasterSchema); 
