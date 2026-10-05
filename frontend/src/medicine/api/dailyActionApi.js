import { api } from '../../api/client.js';

export function fetchMedicineLocations(farm) {
  const query = farm ? `?farm=${encodeURIComponent(farm)}` : '';
  return api(`/medicine/daily-action/locations${query}`);
}

export function createMedicineLocation(name, farm) {
  const query = farm ? `?farm=${encodeURIComponent(farm)}` : '';
  return api(`/medicine/daily-action/locations${query}`, { method: 'POST', body: { name, farm } });
}

export function removeMedicineLocation(name, farm) {
  const query = farm ? `?farm=${encodeURIComponent(farm)}` : '';
  return api(`/medicine/daily-action/locations${query}`, { method: 'DELETE', body: { name, farm } });
}

/**
 * 1. Fast Inward (Medicine Arrived)
 * Saves scanned/typed batch & quantity -> Instantly active in stock!
 */
export async function postFastInward(inwardData) {
  return await api('/medicine/daily-action/inward', {
    method: 'POST',
    body: inwardData,
  });
}

/**
 * 2. Fast Outward (Give to Birds / Shed Dose)
 * Automatic FEFO: Deducts from earliest expiring batch
 */
export async function postFastOutward(outwardData) {
  return await api('/medicine/daily-action/outward', {
    method: 'POST',
    body: outwardData,
  });
}

/**
 * 3. Get Today's Activity Stream
 * Returns list of today's In & Out logs
 */
export async function fetchTodayActivity(params = {}) {
  const query = new URLSearchParams();
  if (params?.farm) query.set('farm', params.farm);
  const qStr = query.toString();
  return await api(`/medicine/daily-action/today${qStr ? `?${qStr}` : ''}`);
}

/**
 * 4. Scan Medicine Label (Cloud Vision AI Endpoint)
 * Sends frame base64 to backend AI for instant human-level extraction
 */
export async function postScanLabel(imageBase64) {
  return await api('/medicine/daily-action/scan-label', {
    method: 'POST',
    body: { imageBase64 },
  });
}

