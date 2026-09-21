
import MedicineMaster from "../models/MedicineMaster.js";
import { badRequest,notFoundError,conflictError } from "../../utils/http.js";

// 1 Create a new Medicine 

export  async function createMedicine(req,res){
    const {code,name,category,
        unit,manufacturer,shelfLifeMonths,
        minimumStock,reorderLevel}  =   req.body;


       // validation 
       if(!code  || !name ||!unit || !category){
        throw badRequest('Code,name,category and unit are required fields');
       }

     //  check medicine with same code already exist 
     const existing =await MedicineMaster.findOne({code:code.trim().toUpperCase()});
     if(existing){
        throw conflictError(`Medicine with code '${code.toUpperCase()}' already exist  ` )
     }

     // create document in mongodb
     const medicine=await MedicineMaster.create({
        code,
        name,
        category,
        unit,
        manufacturer,
        shelfLifeMonths,
        minimumStock,
        reorderLevel,
        createdBy: req.user._id, // extarct automatic from jwt by protect middleware 
     });
  
      res.status(201).json({
        success:true,
        message:'Medicine created Succesfully ',
        medicine, 
      });

}


// 2.  GET all Medicines (with Search ,Category filter, inactive toggle)

export async function getMedicines(req,res){

  const {search,category,includeInactive}=req.query;

  // Build dynamic MongoDB query Filter 
   const filter={};

   // By default, only show active medicines unless includeInactive==='true'
     if(includeInactive!=='true'){
        filter.active=true;
     }

   //  Filter by category if selected 
    if(category){
        filter.category=category;
    }

  //  Search by code or name using Case-Insensitive Regular Expression($regex)
  if(search){
    filter.$or=[
        {name:{$regex:search.trim(),$options:'i'}},
        {code:{$regex:search.trim(),$options:'i'}},
    ];
  }

  // Query database ,sort alphabetically by name and populate who created it 
  const medicines= await MedicineMaster.find(filter)
          .populate('createdBy','name email')
          .sort({name:1})
          .lean();

       res.json({
        success:true,
        count:medicines.length,
        medicines,
       })
}

 // 3 GET a single Medicine By ID

  export async function getMedicineById(req,res){

     const medicine =await MedicineMaster.findById(req.params.id)
                                    .populate('createdBy','name email')
                                    .lean();

     if(!medicine){
        throw notFoundError('Medicine not found');

     }

  res.json({
    success:true, medicine
  });

  }


  // 4 Update a  Medicine 

  export  async function updateMedicine (req,res){

     const {name ,category,unit,manufacturer,
        shelfLifeMonths,minimumStock,reorderLevel}=req.body;

        const medicine =await MedicineMaster.findById(req.params.id);
        if(!medicine){
            throw notFoundError('medicine not found')
        }

   // update all fields except 'code ' to prevent breaking history
    if(name ) medicine.name=name;
    if(category) medicine.category=category;
    if(unit)   medicine.unit=unit ;
    if(manufacturer!==undefined)  medicine.manufacturer=manufacturer;
    if(shelfLifeMonths!==undefined) medicine.shelfLifeMonths=shelfLifeMonths;
    if(minimumStock!==undefined)  medicine.minimumStock=minimumStock;
    if(reorderLevel!==undefined) medicine.reorderLevel=reorderLevel;

    await medicine.save();

    res.json({
        success: true,
        message:'Medicine updated successfully',
        medicine 
    });

  }

    
   // 5 . Activate and Deactivate  (soft delete )

   export async function toggleMedicineStatus(req,res){

    const medicine = await MedicineMaster.findById(req.params.id);

    if(!medicine){
        throw notFoundError('Medicine not Found ');
    }
 
     medicine.active=!medicine.active;
     await medicine.save();

     res.json({
        success: true,
        message:`Medicine ${medicine.active? 'activated ' : 'deactivated'} successfully `,
        medicine 
     })
 
   }








