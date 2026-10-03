import { api } from '../../api/client.js';

/**
 * 1. Fetch Real-time Dashboard KPIs, Stock Valuation & Expiry Radar
 * @param {Object} params - { farm }
 */
export async function fetchDashboardStats(params = {}) {
  const query = new URLSearchParams();
  if (params.farm) query.append('farm', params.farm);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/reports/dashboard-stats${queryString}`);
}

/**
 * 2. Fetch Reverse Batch Traceability
 * Returns complete lifecycle: PO ➔ GRN ➔ Store Verification ➔ Issues ➔ Returns ➔ Balance
 * Supports search by Batch Number OR Medicine Name / Alias / Code, and optional batchId
 * @param {string} batchQuery
 * @param {Object} [params] - { batchId }
 */
export async function fetchBatchTraceability(batchQuery, params = {}) {
  if (!batchQuery && !params.batchId) throw new Error('Medicine name or batch number is required');
  const query = new URLSearchParams();
  if (params.batchId) query.append('batchId', params.batchId);
  const queryString = query.toString() ? `?${query.toString()}` : '';
  const paramVal = batchQuery ? encodeURIComponent(batchQuery.trim()) : 'current';
  return await api(`/medicine/reports/traceability/${paramVal}${queryString}`);
}

/**
 * 3. Fetch Stock Movement Audit Ledger
 * Filterable history of all receipts, issues, returns, adjustments and disposals
 * @param {Object} params - { medicine, transactionType, startDate, endDate, page, limit }
 */
export async function fetchStockLedger(params = {}) {
  const query = new URLSearchParams();
  if (params.medicine) query.append('medicine', params.medicine);
  if (params.transactionType) query.append('transactionType', params.transactionType);
  if (params.farm) query.append('farm', params.farm);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/reports/ledger${queryString}`);
}

/**
 * 4. Fetch Flock-wise Lifetime Treatment Costing
 * @param {Object} params - { farm, startDate, endDate }
 */
export async function fetchFlockCosting(params = {}) {
  const query = new URLSearchParams();
  if (params.farm) query.append('farm', params.farm);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/reports/flock-costing${queryString}`);
}

/**
 * 5. Update Batch Details (Admin / Developer Only)
 * @param {string} batchId
 * @param {Object} updateData - { batchNumber, expiryDate }
 */
export async function updateBatchApi(batchId, updateData) {
  return await api(`/medicine/reports/batches/${batchId}`, {
    method: 'PATCH',
    body: updateData,
  });
}

