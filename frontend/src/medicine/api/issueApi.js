import { api } from '../../api/client.js';

/**
 * 1. Fetch FEFO Recommendations for a specific Medicine & Farm
 * Returns batches sorted with earliest expiry date first and highlights the recommended batch.
 */
export async function fetchFefoRecommendations(medicineId, farmId) {
  return await api(`/medicine/issues/fefo-recommendations?medicineId=${medicineId}&farmId=${farmId}`);
}

/**
 * 2. Fetch Medicine Issues with search and filters
 */
export async function fetchIssues(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.farm) query.append('farm', params.farm);
  if (params.medicine) query.append('medicine', params.medicine);
  if (params.shed) query.append('shed', params.shed);
  if (params.purpose) query.append('purpose', params.purpose);
  if (params.startDate) query.append('startDate', params.startDate);
  if (params.endDate) query.append('endDate', params.endDate);
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/medicine/issues${queryString}`);
}

/**
 * 3. Create a new Medicine Issue (Outward consumption)
 * @param {Object} issueData
 */
export async function createIssueApi(issueData) {
  return await api('/medicine/issues', {
    method: 'POST',
    body: issueData,
  });
}

/**
 * 4. Fetch Issue by ID
 */
export async function fetchIssueById(id) {
  return await api(`/medicine/issues/${id}`);
}
