// Hardware GPS-driven location acquisition:
// 1. In-memory verified GPS session cache (retained for 10 minutes) once physical presence inside farm/office is established.
// 2. High Accuracy First (satellite GPS on phones / Wi-Fi positioning on laptops) to ensure real physical presence.
// 3. Strict cell-tower rejection: Filters out coarse network triangulation (> 800m) to stop 5-6km carrier tower jumps, while allowing laptops & indoor phones.
// 4. MaximumAge (30s): Uses fast recent OS position cache on initial load to prevent cold-start timeouts.

let inMemoryCachedLocation = null;
const GPS_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes verified session retention
const MAX_ACCEPTABLE_ACCURACY = 800; // Filter out cell towers (1500m-5000m) while allowing indoor GPS & laptop Wi-Fi

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
  timeoutMs = 9000,
  maximumAge = 30000,
  preferCache = true,
  forceFresh = false,
} = {}) {
  // If forceFresh is requested, purge any cached fix
  if (forceFresh) {
    inMemoryCachedLocation = null;
  }

  // Check verified in-memory session cache (10 minutes max)
  if (preferCache && !forceFresh && inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
    const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
    if (age < GPS_SESSION_TTL_MS && (!inMemoryCachedLocation.accuracyMetres || inMemoryCachedLocation.accuracyMetres <= MAX_ACCEPTABLE_ACCURACY)) {
      return Promise.resolve(inMemoryCachedLocation);
    }
  }

  const timeout = Number.isFinite(timeoutMs) ? Math.max(2000, Math.min(timeoutMs, 15000)) : 9000;
  const maxAge = forceFresh ? 0 : (Number.isFinite(maximumAge) ? Math.max(0, maximumAge) : 30000);

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
      // Only cache genuine GPS/Wi-Fi fixes (accuracy <= 800m, never coarse 5km cell towers)
      if (accuracy <= MAX_ACCEPTABLE_ACCURACY) {
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
    // Attempt 1: High Accuracy (Satellite GPS on phones / High precision on PC)
    const highResult = await querySingle({
      enableHighAccuracy: true,
      maximumAge: maxAge,
      timeout,
    });

    if (highResult?.status === 'CAPTURED') {
      if (!highResult.accuracyMetres || highResult.accuracyMetres <= MAX_ACCEPTABLE_ACCURACY) {
        inMemoryCachedLocation = highResult;
        return resolve(highResult);
      }
    }

    if (highResult?.status === 'PERMISSION_DENIED' || highResult?.code === 1) {
      return resolve(highResult);
    }

    // If high accuracy timed out or had high drift, but we have a valid 10-minute cache:
    if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
      const age = Date.now() - new Date(inMemoryCachedLocation.capturedAt || 0).getTime();
      if (age < GPS_SESSION_TTL_MS) {
        return resolve(inMemoryCachedLocation);
      }
    }

    // Attempt 2: Standard Accuracy (Wi-Fi triangulation fallback for laptops or indoor phones)
    const standardResult = await querySingle({
      enableHighAccuracy: false,
      maximumAge: maxAge,
      timeout: Math.min(timeout, 5000),
    });

    if (standardResult?.status === 'CAPTURED') {
      if (!standardResult.accuracyMetres || standardResult.accuracyMetres <= MAX_ACCEPTABLE_ACCURACY) {
        inMemoryCachedLocation = standardResult;
        return resolve(standardResult);
      }
      if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
        return resolve(inMemoryCachedLocation);
      }
      return resolve(standardResult);
    }

    // Fallback to active cache if available
    if (inMemoryCachedLocation && inMemoryCachedLocation.status === 'CAPTURED') {
      return resolve(inMemoryCachedLocation);
    }

    resolve(highResult?.status !== 'UNAVAILABLE' ? highResult : standardResult);
  });
}
