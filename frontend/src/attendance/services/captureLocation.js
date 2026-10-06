// Hardware GPS-driven location acquisition:
// 1. In-memory verified GPS session cache (retained for 10 minutes) once satellite lock inside farm is established.
// 2. High Accuracy First (satellite GPS) to ensure real physical presence at farm/office.
// 3. Strict cell-tower rejection: Filters out coarse network triangulation (> 300m) which causes 5-6km carrier tower jumps.
// 4. Force-fresh bypass supported when the operator explicitly taps "Refresh GPS".

let inMemoryCachedLocation = null;
const GPS_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes verified session retention

// Clean up any legacy stale storage from previous app versions
try {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('last_known_attendance_loc');
  }
} catch {}

export function clearCachedLocation() {
  inMemoryCachedLocation = null;
}

export function getCachedLocation() {
  if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
    const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
    if (age < GPS_SESSION_TTL_MS) {
      return inMemoryCachedLocation;
    }
  }
  return null;
}

export function captureLocation({
  geolocation = globalThis.navigator?.geolocation,
  timeoutMs = 6000,
  maximumAge = 15000,
  preferCache = true,
  forceFresh = false,
} = {}) {
  // If forceFresh is requested, purge any cached fix
  if (forceFresh) {
    inMemoryCachedLocation = null;
  }

  // Check verified in-memory session cache (10 minutes max, accuracy <= 300m)
  if (preferCache && !forceFresh && inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
    const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
    if (age < GPS_SESSION_TTL_MS && (!inMemoryCachedLocation.accuracyMetres || inMemoryCachedLocation.accuracyMetres <= 300)) {
      return Promise.resolve(inMemoryCachedLocation);
    }
  }

  const timeout = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(timeoutMs, 10000)) : 6000;
  const maxAge = forceFresh ? 0 : (Number.isFinite(maximumAge) ? Math.max(0, maximumAge) : 15000);

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
      // Only cache genuine GPS fixes (accuracy <= 300m, never coarse cell towers)
      if (accuracy <= 300) {
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
      // If satellite fix is high precision (<= 300m), lock into cache and return immediately
      if (!highResult.accuracyMetres || highResult.accuracyMetres <= 300) {
        inMemoryCachedLocation = highResult;
        return resolve(highResult);
      }
    }

    if (highResult?.status === 'PERMISSION_DENIED' || highResult?.code === 1) {
      return resolve(highResult);
    }

    // If satellite GPS momentarily dipped/timed out (e.g. inside tin shed), but we have a valid 10-minute cache:
    if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
      const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
      if (age < GPS_SESSION_TTL_MS) {
        return resolve(inMemoryCachedLocation);
      }
    }

    // Attempt 2: Wi-Fi / standard device accuracy (short query)
    const standardResult = await querySingle({
      enableHighAccuracy: false,
      maximumAge: maxAge,
      timeout: Math.min(timeout, 3000),
    });

    if (standardResult?.status === 'CAPTURED') {
      if (standardResult.accuracyMetres <= 300) {
        inMemoryCachedLocation = standardResult;
        return resolve(standardResult);
      }
      // If standardResult is coarse (> 300m e.g. cell tower), prefer cached session if available
      if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
        return resolve(inMemoryCachedLocation);
      }
      return resolve(standardResult);
    }

    // If both attempts failed, return the session cache if still within 10 minutes
    if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
      const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
      if (age < GPS_SESSION_TTL_MS) {
        return resolve(inMemoryCachedLocation);
      }
    }

    resolve(highResult?.status !== 'UNAVAILABLE' ? highResult : standardResult);
  });
}
