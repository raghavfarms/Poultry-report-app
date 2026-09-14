import { api, API_URL } from '../../api/client.js';

export function attendancePath(resource, filters = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, String(value));
  }
  return `/attendance/${resource}${query.size ? `?${query}` : ''}`;
}
export const saveAttendance = (resource, body, method = 'POST') => api(attendancePath(resource), { method, body: JSON.stringify(body) });
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


