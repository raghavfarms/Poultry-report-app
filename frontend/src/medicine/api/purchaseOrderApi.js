import { api } from '../../api/client.js';

/**
 * 1. Fetch all Purchase Orders with optional search, supplier, status, date filters
 * Example: fetchPurchaseOrders({ status: 'ISSUED', search: 'PO-2026' })
 */
export async function fetchPurchaseOrders(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.supplier) query.append('supplier', params.supplier);
  if (params.status) query.append('status', params.status);
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/purchase-orders${queryString}`);
}

/**
 * 2. Fetch a single Purchase Order by ID (with populated supplier & medicine details)
 */
export async function fetchPurchaseOrderById(id) {
  return await api(`/medicine/purchase-orders/${id}`);
}

/**
 * 3. Create a new Purchase Order
 * @param {Object} poData - { supplier, orderDate, expectedDeliveryDate, items, notes }
 */
export async function createPurchaseOrderApi(poData) {
  return await api('/medicine/purchase-orders', {
    method: 'POST',
    body: poData,
  });
}

/**
 * 4. Update an existing Purchase Order (DRAFT only)
 */
export async function updatePurchaseOrderApi(id, poData) {
  return await api(`/medicine/purchase-orders/${id}`, {
    method: 'PUT',
    body: poData,
  });
}

/**
 * 5. Update PO Status (e.g., 'ISSUED' or 'CANCELLED')
 */
export async function updatePurchaseOrderStatusApi(id, status) {
  return await api(`/medicine/purchase-orders/${id}/status`, {
    method: 'PATCH',
    body: { status },
  });
}