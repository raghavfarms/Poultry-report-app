import { api, API_URL } from '../../api/client.js';

export function attendancePath(resource, filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  }
  return `/attendance/${resource}${query.size ? `?${query}` : ''}`;
}
export const saveAttendance = (resource, body = {}, method = 'POST') =>
  api(attendancePath(resource), {
    method,
    ...(method !== 'GET' && method !== 'DELETE' ? { body: JSON.stringify(body) } : {}),
  });
export async function uploadWorkerPhoto(id, file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('Choose a JPEG, PNG or WebP photo up to 2 MB.');
  return api(attendancePath(`workers/${id}/photo`), { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
}
export async function fetchWorkerPhoto(id, signal) {
  const response = await fetch(`${API_URL}${attendancePath(`workers/${id}/photo`)}`, {
    signal, headers: { Authorization: `Bearer ${localStorage.getItem('poultry_token') || ''}` },
  });
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('auth-expired'));
    throw new Error('Photo unavailable.');
  }
  return response.blob();
}

export async function enrolFace(workerId, descriptor, quality = {}) {
  return api(attendancePath(`workers/${workerId}/face`), {
    method: 'POST',
    body: JSON.stringify({ descriptor, quality }),
  });
}

export async function clearFaceRegistration(workerId) {
  return api(attendancePath(`workers/${workerId}/face`), {
    method: 'DELETE',
  });
}

export async function fetchFirmFaceDescriptors(firmId) {
  return api(attendancePath('face-descriptors', { firmId }));
}

export async function recordAttendanceEvent(payload) {
  return api(attendancePath('events'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteWorker(workerId) {
  return api(attendancePath(`workers/${workerId}`), {
    method: 'DELETE',
  });
}

export function sortFirmsOrder(firms = []) {
  return [...firms].sort((a, b) => {
    const nameA = typeof a === 'string' ? a : (a?.name || '');
    const nameB = typeof b === 'string' ? b : (b?.name || '');
    const codeA = a?.code || '';
    const codeB = b?.code || '';

    const isOfficeA = codeA === 'OFFICE' || /office/i.test(nameA);
    const isOfficeB = codeB === 'OFFICE' || /office/i.test(nameB);
    if (isOfficeA !== isOfficeB) return isOfficeA ? 1 : -1; // office always last

    const isRaghavA = /raghav/i.test(nameA);
    const isRaghavB = /raghav/i.test(nameB);
    if (isRaghavA !== isRaghavB) return isRaghavA ? -1 : 1; // Raghav first

    const isSanjanaA = /sanjana/i.test(nameA);
    const isSanjanaB = /sanjana/i.test(nameB);
    if (isSanjanaA !== isSanjanaB) return isSanjanaA ? -1 : 1; // Sanjana second

    return nameA.localeCompare(nameB);
  });
}

export const ATTENDANCE_FIRM_STORAGE_KEY = 'attendance_selected_firm';

export function getStoredAttendanceFirm(defaultVal = '') {
  try {
    return localStorage.getItem(ATTENDANCE_FIRM_STORAGE_KEY) || defaultVal;
  } catch {
    return defaultVal;
  }
}

export function setStoredAttendanceFirm(firmId) {
  try {
    if (firmId !== undefined && firmId !== null) {
      localStorage.setItem(ATTENDANCE_FIRM_STORAGE_KEY, String(firmId));
    }
  } catch {}
}

export function getDefaultFirmId(firms = [], currentId = '') {
  const stored = getStoredAttendanceFirm();
  const candidate = currentId || stored;
  if (candidate && (candidate === 'all' || firms.some((f) => String(f._id || f) === String(candidate)))) {
    return candidate;
  }
  const raghav = firms.find((f) => /raghav/i.test(f?.name || (typeof f === 'string' ? f : '')));
  const nonOffice = firms.find((f) => f?.code !== 'OFFICE' && !/office/i.test(f?.name || (typeof f === 'string' ? f : '')));
  const target = raghav || nonOffice || firms[0];
  return target ? (target._id || target) : '';
}


