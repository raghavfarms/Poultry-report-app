const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isTransportComplete(entry) {
  if (!entry) return false;
  const reading = entry.closingReading;
  if (reading == null || reading === '') return false;
  const num = Number(reading);
  return Number.isFinite(num) && num > 0;
}

export function transportEditExpiresAt(entry) {
  if (!isTransportComplete(entry)) return null;

  const completedTime = entry.completedAt
    ? new Date(entry.completedAt).getTime()
    : entry.createdAt
      ? new Date(entry.createdAt).getTime()
      : new Date(`${entry.openingDate}T${entry.openingTime || '00:00'}:00Z`).getTime();

  return Number.isFinite(completedTime) ? completedTime + EDIT_WINDOW_MS : null;
}

export function canEditTransportEntry(entry, role, now = Date.now()) {
  if (['admin', 'developer'].includes(role)) return true;
  if (!isTransportComplete(entry)) return true;

  const expiresAt = transportEditExpiresAt(entry);
  return expiresAt != null && now < expiresAt;
}

