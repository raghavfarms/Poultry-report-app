import { api } from '../../api/client.js';

/**
 * 1. Fetch all Receipts with optional status, supplier, farm, search filters
 */
export async function fetchReceipts(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.status) query.append('status', params.status);
  if (params.supplier) query.append('supplier', params.supplier);
  if (params.farm) query.append('farm', params.farm);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/receipts${queryString}`);
}

/**
 * 2. Create a new Medicine Receipt (GRN)
 * @param {Object} receiptData - { purchaseOrder, medicine, supplier, farm, batchNumber, manufacturingDate, expiryDate, receivedQuantity, unit, invoiceOrChallanNo }
 */
export async function createReceiptApi(receiptData) {
  return await api('/medicine/receipts', {
    method: 'POST',
    body: receiptData,
  });
}

/**
 * 3. Storekeeper Acceptance (Transitions to STORE_ACCEPTED & creates batch stock!)
 * @param {string} receiptId
 * @param {Object} acceptData - { acceptedQuantity, verificationRemarks }
 */
export async function acceptReceiptApi(receiptId, acceptData) {
  return await api(`/medicine/receipts/${receiptId}/accept`, {
    method: 'PATCH',
    body: acceptData,
  });
}

/**
 * 4. Fetch Live Batch-wise Inventory (sorted by earliest expiry / FEFO)
 */
export async function fetchBatchStock(params = {}) {
  const query = new URLSearchParams();
  if (params.farm) query.append('farm', params.farm);
  if (params.medicine) query.append('medicine', params.medicine);
  if (params.status) query.append('status', params.status);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/receipts/batches/stock${queryString}`);
}