import { api } from '../../api/client.js';

/**
 * 1. Fetch Adjustments, Returns & Disposals with filtering and search
 */
export async function fetchAdjustments(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.type) query.append('type', params.type);
  if (params.farm) query.append('farm', params.farm);
  if (params.medicine) query.append('medicine', params.medicine);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/adjustments${queryString}`);
}

/**
 * 2. Record a Shed Return (Unused medicine returned from shed back to store)
 * @param {Object} returnData - { medicineId, batchId, farmId, shed, quantity, reason, returnedBy, adjustmentDate, remarks }
 */
export async function createReturnApi(returnData) {
  return await api('/medicine/adjustments/return', {
    method: 'POST',
    body: returnData,
  });
}

/**
 * 3. Record a Physical Stock Audit Adjustment (Surplus or Shortage/Breakage)
 * @param {Object} adjData - { medicineId, batchId, farmId, direction: 'IN'|'OUT', quantity, reason, witnessedBy, adjustmentDate, remarks }
 */
export async function createStockAdjustmentApi(adjData) {
  return await api('/medicine/adjustments/stock-audit', {
    method: 'POST',
    body: adjData,
  });
}

/**
 * 4. Record a Biosecure Safe Disposal Write-Off (Expired or Spoiled Medicine)
 * @param {Object} disposalData - { medicineId, batchId, farmId, quantity, disposalMethod, reason, witnessedBy, adjustmentDate, remarks }
 */
export async function createDisposalApi(disposalData) {
  return await api('/medicine/adjustments/disposal', {
    method: 'POST',
    body: disposalData,
  });
}

/**
 * 5. Fetch single Adjustment by ID
 */
export async function fetchAdjustmentById(id) {
  return await api(`/medicine/adjustments/${id}`);
}
