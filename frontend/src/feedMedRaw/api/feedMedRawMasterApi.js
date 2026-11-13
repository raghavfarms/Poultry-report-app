import { api } from '../../api/client.js';

/**
 * 1. Fetch all Feed & Raw Material items with optional filters
 * @param {Object} params - { search: '', itemType: '', status: 'active' | 'inactive' | 'all' }
 */
export async function fetchFeedItems(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.append('search', params.search);
  if (params.itemType && params.itemType !== 'All') query.append('itemType', params.itemType);
  if (params.status && params.status !== 'all') query.append('status', params.status);

  const queryString = query.toString() ? `?${query.toString()}` : '';
  return await api(`/feed-med-raw/master${queryString}`);
}

/**
 * 2. Fetch single item by ID
 */
export async function fetchFeedItemById(id) {
  return await api(`/feed-med-raw/master/${id}`);
}

/**
 * 3. Create a new Feed Medicine or Raw Material item
 */
export async function createFeedItemApi(itemData) {
  return await api('/feed-med-raw/master', {
    method: 'POST',
    body: itemData,
  });
}

/**
 * 4. Update an existing item
 */
export async function updateFeedItemApi(id, itemData) {
  return await api(`/feed-med-raw/master/${id}`, {
    method: 'PUT',
    body: itemData,
  });
}

/**
 * 5. Toggle active / inactive status
 */
export async function toggleFeedItemStatusApi(id) {
  return await api(`/feed-med-raw/master/${id}/toggle`, {
    method: 'PATCH',
  });
}
