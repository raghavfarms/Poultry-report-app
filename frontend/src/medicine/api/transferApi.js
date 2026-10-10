import { api } from '../../api/client.js';

/**
 * 1. Create a new inter-firm transfer request (Places stock on hold at sender)
 */
export async function createMedicineTransfer(transferData) {
  return await api('/medicine/transfers', {
    method: 'POST',
    body: transferData,
  });
}

/**
 * 2. Get list of all transfer audit history with filters
 */
export async function fetchMedicineTransfers(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.append('status', params.status);
  if (params.farm) query.append('farm', params.farm);
  if (params.direction) query.append('direction', params.direction);
  if (params.fromFarm) query.append('fromFarm', params.fromFarm);
  if (params.toFarm) query.append('toFarm', params.toFarm);
  if (params.search) query.append('search', params.search);
  if (params.limit) query.append('limit', params.limit);
  if (params.page) query.append('page', params.page);
  const qStr = query.toString();
  return await api(`/medicine/transfers${qStr ? `?${qStr}` : ''}`);
}

/**
 * 3. Get pending incoming/outgoing transfers for notification badge
 */
export async function fetchPendingTransfers(farm) {
  const query = farm ? `?farm=${encodeURIComponent(farm)}` : '';
  return await api(`/medicine/transfers/pending${query}`);
}

/**
 * 4. Accept a pending transfer (Inwards into receiver stock, releases sender hold)
 */
export async function acceptMedicineTransfer(transferId) {
  return await api(`/medicine/transfers/${transferId}/accept`, {
    method: 'PATCH',
  });
}

/**
 * 5. Reject a pending transfer (Restores stock back to sender, marks rejected)
 */
export async function rejectMedicineTransfer(transferId, reason = '') {
  return await api(`/medicine/transfers/${transferId}/reject`, {
    method: 'PATCH',
    body: { reason },
  });
}

/**
 * 6. Cancel a pending transfer (By sender before accepted)
 */
export async function cancelMedicineTransfer(transferId) {
  return await api(`/medicine/transfers/${transferId}/cancel`, {
    method: 'PATCH',
  });
}

/**
 * 7. Fetch all batches with available stock for a specific sender farm
 */
export async function fetchAvailableStockForTransfer(farmId) {
  return await api(`/medicine/transfers/available-stock?farm=${encodeURIComponent(farmId)}`);
}

