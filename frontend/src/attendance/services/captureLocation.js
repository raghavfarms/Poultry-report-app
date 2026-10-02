// Hardware GPS-driven location acquisition:
// 1. In-memory short cache (valid for 30s only) to avoid redundant GPS battery wakeups during rapid consecutive scans.
// 2. High Accuracy First (satellite GPS) to ensure real physical presence at farm/office.
// 3. Fallback to standard device accuracy if high accuracy is unsupported.
// NOTE: IP geolocation is intentionally NEVER used for attendance geofencing,
// because mobile 4G/5G carriers route traffic through regional gateway nodes 120km+ away.

let inMemoryCachedLocation = null;

// Clean up any legacy 30-minute stale location cached from previous sessions
try {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('last_known_attendance_loc');
  }
} catch {}

export function captureLocation({
  geolocation = globalThis.navigator?.geolocation,
  timeoutMs = 5000,
  maximumAge = 15000,
  preferCache = true,
} = {}) {
  // Check short in-memory cache (30s max, and accuracy must be reliable <= 500m)
  if (preferCache && inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
    const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
    if (age < 30 * 1000 && (!inMemoryCachedLocation.accuracyMetres || inMemoryCachedLocation.accuracyMetres <= 500)) {
      return Promise.resolve(inMemoryCachedLocation);
    }
  }

  const timeout = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(timeoutMs, 10000)) : 5000;
  const maxAge = Number.isFinite(maximumAge) ? Math.max(0, maximumAge) : 15000;

  const parsePosition = (position) => {
    const { latitude, longitude, accuracy } = position?.coords || {};
    const timestamp = position?.timestamp ? new Date(position.timestamp) : new Date();
    if (
      [latitude, longitude, accuracy].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
      Number.isFinite(timestamp.getTime())
    ) {
      const captured = {
        status: 'CAPTURED',
        latitude,
        longitude,
        accuracyMetres: accuracy,
        capturedAt: timestamp.toISOString(),
      };
      // Only cache if reasonable accuracy (<= 1500m)
      if (accuracy <= 1500) {
        inMemoryCachedLocation = captured;
      }
      return captured;
    }
    return null;
  };

  const querySingle = (options) =>
    new Promise((resolve) => {
      if (!geolocation?.getCurrentPosition) {
        return resolve({ status: 'UNSUPPORTED' });
      }

      let done = false;
      const tid = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ status: 'TIMEOUT' });
        }
      }, options.timeout + 150);

      try {
        geolocation.getCurrentPosition(
          (pos) => {
            if (done) return;
            done = true;
            clearTimeout(tid);
            const parsed = parsePosition(pos);
            resolve(parsed || { status: 'UNAVAILABLE' });
          },
          (err) => {
            if (done) return;
            done = true;
            clearTimeout(tid);
            const status = ({ 1: 'PERMISSION_DENIED', 2: 'UNAVAILABLE', 3: 'TIMEOUT' })[err?.code] || 'UNAVAILABLE';
            resolve({ status, code: err?.code });
          },
          options
        );
      } catch {
        if (!done) {
          done = true;
          clearTimeout(tid);
          resolve({ status: 'UNAVAILABLE' });
        }
      }
    });

  return new Promise(async (resolve) => {
    // Attempt 1: High Accuracy (Satellite GPS) - vital for accurate farm/office geofencing
    const highResult = await querySingle({
      enableHighAccuracy: true,
      maximumAge: maxAge,
      timeout,
    });

    if (highResult?.status === 'CAPTURED') {
      return resolve(highResult);
    }

    if (highResult?.status === 'PERMISSION_DENIED' || highResult?.code === 1) {
      return resolve(highResult);
    }

    // Attempt 2: Standard Accuracy fallback (Wi-Fi / Cell tower) if GPS timed out
    const standardResult = await querySingle({
      enableHighAccuracy: false,
      maximumAge: maxAge,
      timeout: Math.min(timeout, 3000),
    });

    if (standardResult?.status === 'CAPTURED') {
      return resolve(standardResult);
    }

    // If both failed, return the in-memory cache if still recent (< 60s)
    if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
      const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
      if (age < 60 * 1000) {
        return resolve(inMemoryCachedLocation);
      }
    }

    resolve(highResult?.status !== 'UNAVAILABLE' ? highResult : standardResult);
  });
}

