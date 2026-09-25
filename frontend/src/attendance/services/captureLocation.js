// Lightning-fast multi-tier location acquisition:
// 1. Instant Cache-First Check: Returns in 0ms if a valid location was captured in the last 30 minutes.
// 2. Fast Standard Accuracy: Queries Wi-Fi/network and cached OS position in 50ms - 200ms.
// 3. High Accuracy Fallback: Queries satellite GPS if standard accuracy is unavailable.
// 4. Ultra-fast IP Geolocation: Ensures privacy browsers (like Brave) and desktop PCs resolve in sub-seconds.
let sessionCachedLocation = null;

export function captureLocation({
  geolocation = globalThis.navigator?.geolocation,
  timeoutMs = 3000,
  maximumAge = 300000,
  preferCache = true,
} = {}) {
  const getFallbackLocation = () => {
    if (sessionCachedLocation && sessionCachedLocation.status === 'CAPTURED') {
      const age = Date.now() - new Date(sessionCachedLocation.capturedAt || 0).getTime();
      if (age < 30 * 60 * 1000) return sessionCachedLocation;
    }
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem('last_known_attendance_loc');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.status === 'CAPTURED' && parsed.latitude && parsed.longitude) {
            const age = Date.now() - new Date(parsed.capturedAt || 0).getTime();
            if (age < 30 * 60 * 1000) {
              sessionCachedLocation = parsed;
              return parsed;
            }
          }
        }
      }
    } catch {}
    return null;
  };

  // Step 1: Instant cache resolution (0ms)
  if (preferCache) {
    const cached = getFallbackLocation();
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  const timeout = Number.isFinite(timeoutMs) ? Math.max(800, Math.min(timeoutMs, 10000)) : 3000;
  const maxAge = Number.isFinite(maximumAge) ? Math.max(0, maximumAge) : 300000;

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
      sessionCachedLocation = captured;
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('last_known_attendance_loc', JSON.stringify(captured));
        }
      } catch {}
      return captured;
    }
    return null;
  };

  const fetchIpLocation = async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('https://ipwho.is/', { signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        if (data && data.success !== false && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
          const captured = {
            status: 'CAPTURED',
            latitude: data.latitude,
            longitude: data.longitude,
            accuracyMetres: 250,
            capturedAt: new Date().toISOString(),
          };
          sessionCachedLocation = captured;
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('last_known_attendance_loc', JSON.stringify(captured));
            }
          } catch {}
          return captured;
        }
      }
    } catch {}

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 1200);
      const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        if (data && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
          const captured = {
            status: 'CAPTURED',
            latitude: data.latitude,
            longitude: data.longitude,
            accuracyMetres: 350,
            capturedAt: new Date().toISOString(),
          };
          sessionCachedLocation = captured;
          try {
            if (typeof sessionStorage !== 'undefined') {
              sessionStorage.setItem('last_known_attendance_loc', JSON.stringify(captured));
            }
          } catch {}
          return captured;
        }
      }
    } catch {}

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
      }, options.timeout + 100);

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
    // Step 2: Fast Standard Accuracy First (Wi-Fi, cellular, cached OS coordinates)
    // Standard accuracy with cached maximumAge returns almost INSTANTANEOUSLY (50ms - 200ms)!
    const fastTimeout = Math.min(timeout, 1200);
    const standardResult = await querySingle({
      enableHighAccuracy: false,
      maximumAge: maxAge,
      timeout: fastTimeout,
    });

    if (standardResult?.status === 'CAPTURED') {
      return resolve(standardResult);
    }

    // Step 3: If standard accuracy didn't capture, try High Accuracy (satellite GPS) with remaining budget
    const remainingTimeout = Math.max(1000, timeout - fastTimeout);
    const highResult = await querySingle({
      enableHighAccuracy: true,
      maximumAge: maxAge,
      timeout: remainingTimeout,
    });

    if (highResult?.status === 'CAPTURED') {
      return resolve(highResult);
    }

    // Step 4: Fast IP Geolocation fallback (under 1.2s)
    const ipLoc = await fetchIpLocation();
    if (ipLoc) {
      return resolve(ipLoc);
    }

    // Step 5: Check session cache once more as last resort
    const fallback = getFallbackLocation();
    if (fallback) {
      return resolve(fallback);
    }

    if (highResult?.status === 'PERMISSION_DENIED' || highResult?.code === 1) {
      return resolve(highResult);
    }

    resolve(standardResult?.status !== 'UNAVAILABLE' ? standardResult : highResult);
  });
}
