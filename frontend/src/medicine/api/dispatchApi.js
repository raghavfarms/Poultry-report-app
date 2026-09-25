import { api } from '../../api/client.js';

/**
 * 1. Fetch Dispatches with optional filters
 * @param {Object} params - { destinationFarm, status, search }
 */
export async function fetchDispatches(params = {}) {
  const query = new URLSearchParams();
  if (params.destinationFarm) query.append('destinationFarm', params.destinationFarm);
  if (params.status) query.append('status', params.status);
  if (params.search) query.append('search', params.search);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/dispatches${queryString}`);
}

/**
 * 2. Create a new Head Office dispatch (Status: DISPATCHED / IN_TRANSIT)
 * @param {Object} dispatchData
 */
export async function createDispatchApi(dispatchData) {
  return await api('/medicine/dispatches', {
    method: 'POST',
    body: dispatchData,
  });
}

/**
 * 3. Gate Security Arrival Confirmation (Step 2 - Changes status to GATE_RECEIVED)
 * @param {string} dispatchId
 * @param {Object} gateData - { packagesCount, hasVisibleDamage, remarks }
 */
export async function confirmGateReceiptApi(dispatchId, gateData) {
  return await api(`/medicine/dispatches/${dispatchId}/gate-confirm`, {
    method: 'POST',
    body: gateData,
  });
}

/**
 * 4. Storekeeper Verification & Formal Stock Acceptance (Step 3 - Updates available stock)
 * @param {string} dispatchId
 * @param {Object} storeData - { remarks }
 */
export async function storeAcceptDispatchApi(dispatchId, storeData = {}) {
  return await api(`/medicine/dispatches/${dispatchId}/store-accept`, {
    method: 'POST',
    body: storeData,
  });
}
