const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export function transportEditExpiresAt(entry) {
  const start = entry.createdAt
    ? new Date(entry.createdAt).getTime()
    : new Date(`${entry.openingDate}T${entry.openingTime || '00:00'}:00Z`).getTime();
  return Number.isFinite(start) ? start + EDIT_WINDOW_MS : null;
}

export function canEditTransportEntry(entry, role, now = Date.now()) {
  if (['admin', 'developer'].includes(role)) return true;
  const expiresAt = transportEditExpiresAt(entry);
  return expiresAt != null && now < expiresAt;
}
