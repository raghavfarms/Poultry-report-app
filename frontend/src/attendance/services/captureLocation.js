// One fresh reading per scan. No continuous location tracking and no cached position.
// Resolves with a status on every location failure so the scanner can still submit attendance.
export function captureLocation({ geolocation = globalThis.navigator?.geolocation, timeoutMs = 4000, maximumAge = 60000 } = {}) {
  if (!geolocation?.getCurrentPosition) return Promise.resolve({ status: 'UNSUPPORTED' });
  const timeout = Number.isFinite(timeoutMs) ? Math.max(1, Math.min(timeoutMs, 15000)) : 4000;
  const maxAge = Number.isFinite(maximumAge) ? Math.max(0, maximumAge) : 60000;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    // Also bound browsers that leave their permission prompt unanswered.
    const timer = setTimeout(() => finish({ status: 'TIMEOUT' }), timeout);
    try {
      geolocation.getCurrentPosition((position) => {
        const { latitude, longitude, accuracy } = position.coords || {};
        const timestamp = new Date(position.timestamp);
        if (![latitude, longitude, accuracy, position.timestamp].every((value) => typeof value === 'number' && Number.isFinite(value)) ||
            !Number.isFinite(timestamp.getTime())) return finish({ status: 'UNAVAILABLE' });
        finish({ status: 'CAPTURED', latitude, longitude, accuracyMetres: accuracy, capturedAt: timestamp.toISOString() });
      }, (error) => finish({ status: ({ 1: 'PERMISSION_DENIED', 2: 'UNAVAILABLE', 3: 'TIMEOUT' })[error?.code] || 'UNAVAILABLE' }),
      { enableHighAccuracy: true, maximumAge: maxAge, timeout });
    } catch {
      finish({ status: 'UNAVAILABLE' });
    }
  });
}
