import { api } from '../../api/client.js';

/**
 * 1. Fetch all formulations with search and filters
 * @param {Object} params - { search: '', feedType: '', status: 'active' | 'inactive' | 'all' }
 */
export async function fetchFormulations(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.feedType && params.feedType !== 'All') query.append('feedType', params.feedType);
  if (params.status && params.status !== 'all') query.append('status', params.status);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/feed-med-raw/formulations${queryString}`);
}

/**
 * 2. Fetch single formulation by ID
 */
export async function fetchFormulationById(id) {
  return await api(`/feed-med-raw/formulations/${id}`);
}

/**
 * 3. Create new formulation (BOM)
 */
export async function createFormulationApi(formData) {
  return await api('/feed-med-raw/formulations', {
    method: 'POST',
    body: formData,
  });
}

/**
 * 4. Update an existing formulation
 */
export async function updateFormulationApi(id, formData) {
  return await api(`/feed-med-raw/formulations/${id}`, {
    method: 'PUT',
    body: formData,
  });
}

/**
 * 5. Toggle active / inactive status
 */
export async function toggleFormulationStatusApi(id) {
  return await api(`/feed-med-raw/formulations/${id}/toggle`, {
    method: 'PATCH',
  });
}
