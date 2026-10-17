
import ThermometerSpot from "../models/ThermometerSpot.js";
import { getPermittedFirmsForModule } from "../../utils/userFirms.js";

  //  GET all spot 
   export const getSpots=async(req,res)=>{
  try{

    const {firm}=req.query;
    if(!firm){
      return res.status(400).json({
        success:false,
        message:`Firm Id is required`,
      })
    }
    
    const permittedFirms = getPermittedFirmsForModule(req.user, 'temperature');
    if (firm !== 'all' && permittedFirms !== null && !permittedFirms.includes(String(firm))) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to spots for this farm.',
      });
    }

    const query = firm === 'all'
      ? (permittedFirms === null ? { active: true } : { firm: { $in: permittedFirms }, active: true })
      : { firm, active: true };

    const spots= await ThermometerSpot.find(query).sort({
      shed:1,
      line:1,
      orderIndex:1,
    });

    return res.status(200).json({
      success:true,
      count:spots.length,
      data:spots,
    });  


  }catch(error){
    console.log('Error fetching thermometer spots :',error);
    return res.status(500).json({
      success:false,
      message:'server error while fetching thermometer spots',
    });
  }

     };

  //  create spot function 

    export const createSpot=async(req,res)=>{

       try{

       const {spotCode,firm,firmName,shed,line,position}=req.body;

       if(!firm || !firmName || !shed || !position){
        return res.status(400).json({
          success:false,
          message:`Firm,Firm Name ,Shed,position are required fields`
        })
       }


      let orderIndex=2; // Default to Middle
      if(position==='Pad Side')  orderIndex=1;
      if(position==='Fan Side')  orderIndex=3;
    
      //  Auto -generate spotCode if not supplied

     const cleanShed = shed.replace(/\s+/g, '').toUpperCase();
    const cleanLine = (line || 'Line 1').replace(/\s+/g, '').toUpperCase();
    const cleanPos = position.replace(/\s+/g, '').toUpperCase();
    const code = spotCode ? spotCode.trim().toUpperCase() : `TH-${cleanShed}-${cleanLine}-${cleanPos}`;
 
      const newSpot=await ThermometerSpot.create({
         spotCode:code,
         firm,
         firmName:firmName.trim(),
         shed:shed.trim(),
         line:(line ||'Line 1').trim(),
         position,
         orderIndex,
      });

   return res.status(201).json({
    success:true,
    message:`Thermometer spot  created successfully`,
    data:newSpot,
   });

       }catch(error){
        if(error.code===11000){
          return res.status(409).json({
               success:false,
               message:`A thermometer spot already exists at this location or spot code is already in use `
          });
        }

         console.error('Error creating thermometer spot:',error);
         return res.status(500).json({
          success:false,
          message:'Server error while creating thermometer spot '
         });
       }

    }

 
 //  quickSetupSpots (The 1-Click Setup for Sheds 1 to 4)

 export const quickSetupSpots=async(req,res)=>{
  try{

      const {firm,firmName,shedCount=4,line='line 1'}  =req.body;
      if(!firm || !firmName){
        return res.status(400).json({
          success:false,
          message:'Firm Id and Firm Name are required ',
        });
      }

    const positions=[
           {name:'Pad Side',order:1,tag:'PAD'},
           {name:'Middle',order:2,tag:'MID'},
           {name:'Fan Side', order:3 ,tag:'FAN'},
    ];
  
     const standardSpots=[];
     const count =Math.min(Math.max(Number(shedCount)|| 4,1),12);

    for(let s=1;s<=count;s++){
      const shedName=`Shed ${s}`;
      for(const pos of positions){
         const spotCode = `TH-S${s}-${line.replace(/\s+/g, '').toUpperCase()}-${pos.tag}`;
         standardSpots.push({
          spotCode,
          firm,
          firmName,
          shed: shedName,
          line:line.trim(),
          position:pos.name,
          orderIndex:pos.order,
          active:true,
         })
      }
    }

      // check each spot : only insert if it is not present 

        let createCount=0;
        for(const spot of standardSpots){
          const exists=await ThermometerSpot.findOne({
            firm:spot.firm,
            shed:spot.shed,
            line:spot.line,
            position:spot.position,
          })
        

      if(!exists){
        await ThermometerSpot.create(spot);
        createCount++;
      }
    }

      const allSpots=await ThermometerSpot.find({
        firm,active:true
      }).sort({
        shed : 1,
        line:1,
        orderIndex:1,

      })

    return res.status(200).json({
      success:true,
      message:`Quick setup complete . Added ${createCount}  new spots. Total: ${allSpots.length} spots ready`,
      data : allSpots,
    })

    
  }catch(error){
    console.log(`Error in quickSetupSpots:`,error);
    return res.status(500).json({
      success:false,
      message:`server error during quick setup`,
    });
  }
 };


   //  Delete spot 

    export const deleteSpot=async(req,res)=>{
      try{
         
         const {id}=req.params;
          const spot= await  ThermometerSpot.findByIdAndDelete(id);
          if(!spot){
            return res.status(404).json({
              success:false,
              message:'Thermometer spot not  found',
            })
          }

          return res.status(200).json({
             success: true,
      message: `Thermometer spot ${spot.spotCode} deleted successfully`,
          })

      }catch(error){
        console.error(`Error deleting spot`,error);
        return res.status(500).json({
          success:false,
          message:`server error deleting thermometer spot`
        });
      }
    }


    
     export const updateSpot = async (req, res) => {
  try {
    const { id } = req.params;
    const { shed, line, position, spotCode } = req.body;

    // 1. Ek empty object banayein jisme sirf vahi fields jayengi jo update karni hain
    const updateFields = {};

    if (shed) updateFields.shed = shed.trim();
    if (line) updateFields.line = line.trim();

    // 2. Position aur uska orderIndex
    if (position) {
      updateFields.position = position;
      if (position === 'Pad Side') updateFields.orderIndex = 1;
      if (position === 'Middle') updateFields.orderIndex = 2; // Fixed: space removed
      if (position === 'Fan Side') updateFields.orderIndex = 3;
    }

    if (spotCode) updateFields.spotCode = spotCode.trim().toUpperCase();

    // 3. Database mein update karein (Notice: 'updatedSpot' with 'd')
    const updatedSpot = await ThermometerSpot.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedSpot) {
      return res.status(404).json({
        success: false,
        message: 'Thermometer spot not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Thermometer spot updated successfully',
      data: updatedSpot,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A spot already exists at this location or spot code is in use',
      });
    }
    console.error('Error updating spot:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating thermometer spot',
    });
  }
};

 

        export const toggleSpotStatus = async (req, res) => {
            try {
          const { id } = req.params;
          const spot = await ThermometerSpot.findById(id);
              if (!spot) {
                  return res.status(404).json({
                       success: false,
                      message: 'Thermometer spot not found',
                            });
                      }
          // Flip the active boolean (true -> false, or false -> true)
                spot.active = !spot.active;
               await spot.save();
               return res.status(200).json({
               success: true,
              message: `Spot ${spot.spotCode} is now ${spot.active ? 'Active' : 'Deactivated'}`,
               data: spot,
          });
          } catch (error) {
       console.error('Error toggling spot status:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error while toggling spot status',
       });
      } 
    };



