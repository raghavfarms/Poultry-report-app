import { api } from '../../api/client.js';

/**
 * 1. Fetch all suppliers with optional search and inactive filter
 * @param {Object} params - { search: '', includeInactive: false }
 * Example: fetchSuppliers({ search: 'medico', includeInactive: true })
 */
export async function fetchSuppliers(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.includeInactive) query.append('includeInactive', 'true');

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/suppliers${queryString}`);
}

/**
 * 2. Fetch a single supplier by ID
 */
export async function fetchSupplierById(id) {
  return await api(`/medicine/suppliers/${id}`);
}

/**
 * 3. Create a new supplier
 * @param {Object} supplierData - { code, name, contactPerson, mobile, email, address, gstin }
 */
export async function createSupplierApi(supplierData) {
  return await api('/medicine/suppliers', {
    method: 'POST',
    body: supplierData,
  });
}

/**
 * 4. Update an existing supplier
 */
export async function updateSupplierApi(id, updateData) {
  return await api(`/medicine/suppliers/${id}`, {
    method: 'PUT',
    body: updateData,
  });
}

/**
 * 5. Toggle Active/Inactive status (Soft delete)
 */
export async function toggleSupplierStatusApi(id) {
  return await api(`/medicine/suppliers/${id}/status`, {
    method: 'PATCH',
  });
}