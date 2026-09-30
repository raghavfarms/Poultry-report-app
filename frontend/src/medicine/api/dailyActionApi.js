import { api } from '../../api/client.js';

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
