import { badRequest } from '../../utils/http.js';

export function validateInwardExpiry(expiryDate, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const parsed = typeof expiryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate)
    ? new Date(`${expiryDate}T00:00:00Z`) : new Date(NaN);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== expiryDate) {
    throw badRequest('Please select a valid expiry date.');
  }
  if (expiryDate <= today) throw badRequest('Expiry date must be after today. Select tomorrow or a later date.');
}
