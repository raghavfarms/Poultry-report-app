import {api} from '../../api/client.js'

/*
 * 1. Fetch all medicines with optional search and category filters
 * @param {Object} params - { search: '', category: '', includeInactive: false }
 * Example: fetchMedicines({ search: 'amox', category: 'VACCINATION' })
 * URL generated: /medicine/masters?search=amox&category=VACCINATION
 */

 export async function fetchMedicines(params={}){     

      // URLSearchParams automatically converts an object into query string:
    // e.g. { search: 'paracetamol' } -> "?search=paracetamol"
 
     const query =new URLSearchParams();
     if(params.search)  query.append('search',params.search);
     if(params.category) query.append('category',params.category);
     if(params.includeInactive) query.append('includeInactive','true');

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return await api(`/medicine/masters${queryString}`);

 }

 /*
 * 2. Fetch a single medicine by its MongoDB _id
 * @param {string} id - Medicine _id
 */

  export  async function fetchMedicineById(id){
    return await api(`/medicine/masters/${id}`);
  }

/*
 * 3. Create a new medicine
 * @param {Object} medicineData - { code, name, category, unit, ... }
 */

   export async function createMedicineApi(medicineData){
    return await api('/medicine/masters',{
        method:'POST',
        body:medicineData,
    });
   }

/*
 * 4. Update an existing medicine
 * @param {string} id - Medicine _id
 * @param {Object} updateData - { name, category, unit, ... }
 */

   export async function updateMedicineApi(id,updateData){
    return await api(`/medicine/masters/${id}`,{
        method:'PUT',
        body:updateData,
    });
   }

/*
 * 5. Toggle Active/Inactive status (Soft Delete)
 * @param {string} id - Medicine _id
 */
 export async function toggleMedicineStatusApi(id){
    return await api(`/medicine/masters/${id}/status`,{
        method:'PATCH',
    });
 }


















