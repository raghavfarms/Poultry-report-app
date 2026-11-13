import FeedMedRawMaster from "../models/FeedMedRawMaster.js";

/**
 * Generates the next sequential code for Feed Medicine & Raw Material Master.
 * Format: FMR-001, FMR-002, ... FMR-999
 */


export async function getNextFeedMedRawCode(){
    // Find the single document with the highest code starting with "FMR-"
const lastItem = await FeedMedRawMaster.findOne({ code: /^FMR-\d+$/ })
                                         .sort({code:-1})
                                         .select('code')
                                         .lean();
                                
   if(!lastItem || !lastItem.code){
        return 'FMR-001'; // If no items exist, start with FMR-001
   }

    // Extract the numeric part of the code, increment it, and format it with leading zeros
       const numericPart = lastItem.code.replace('FMR-', '');
        const lastNumber = parseInt(numericPart, 10);
       const nextNumber = (isNaN(lastNumber) ? 0 : lastNumber) + 1;

    // Pad to 3 digits: 1 -> "001", 15 -> "015", 100 -> "100"
     return `FMR-${String(nextNumber).padStart(3, '0')}`;



}