
 import express from 'express'
import {
    createMedicine,
    getMedicines,
    getMedicineById,
    updateMedicine,
    toggleMedicineStatus,
}   from '../controllers/medicine.controller.js'
import { protect } from '../../middleware/auth.js'

const router= express.Router();

 router.use(protect);   //every single route defined below it will automatically execute protect first.

 // 1 GET /api/medicine/masters  - fetch all medicines
 // 2 PUT api/medicines/masters/:id
 router.route('/').get(getMedicines)         // <-- 'protect' already ran!
                  .post(createMedicine);         // <-- 'protect' already ran!

     // 3. GET /api/medicine/masters/:id - Fetch single medicine details
// 4. PUT /api/medicine/masters/:id - Update medicine details

router.route('/:id')
             .get(getMedicineById)  // <-- 'protect' already ran!
             .put(updateMedicine);    // <-- 'protect' already ran!

             
// 5. PATCH /api/medicine/masters/:id/status - Toggle active/inactive

 router.patch('/:id/status',toggleMedicineStatus)         // <-- 'protect' already ran!

  
 export default router;





