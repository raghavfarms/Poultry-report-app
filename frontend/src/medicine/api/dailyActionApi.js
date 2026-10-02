import { api } from '../../api/client.js';

export function fetchMedicineLocations() {
  return api('/medicine/daily-action/locations');
}

export function createMedicineLocation(name) {
  return api('/medicine/daily-action/locations', { method: 'POST', body: { name } });
}

export function removeMedicineLocation(name) {
  return api('/medicine/daily-action/locations', { method: 'DELETE', body: { name } });
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
export async function fetchTodayActivity() {
  return await api('/medicine/daily-action/today');
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

