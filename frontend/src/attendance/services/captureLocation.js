// Multi-tier resilient location acquisition:
// 1. Attempts High Accuracy (GPS hardware) first.
// 2. Automatically falls back to Standard Accuracy (Wi-Fi/cellular triangulation).
// 3. Employs session caching so subsequent scans resolve instantaneously (0ms).
// 4. Falls back to secure IP-based network geolocation if the device has no GPS hardware,
//    or if using privacy browsers (like Brave) where Google Location Service is stripped.
let sessionCachedLocation = null;

export function captureLocation({
  geolocation = globalThis.navigator?.geolocation,
  timeoutMs = 6000,
  maximumAge = 120000,
} = {}) {
  const timeout = Number.isFinite(timeoutMs) ? Math.max(1000, Math.min(timeoutMs, 20000)) : 6000;
  const maxAge = Number.isFinite(maximumAge) ? Math.max(0, maximumAge) : 120000;

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

  const fetchIpLocation = async () => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 2200);
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
      const tid = setTimeout(() => controller.abort(), 2000);
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
    // Stage 1: Try high accuracy with half the timeout (max 2500ms)
    const highAccTimeout = Math.min(Math.max(1500, Math.floor(timeout * 0.45)), 2500);
    const highResult = await querySingle({
      enableHighAccuracy: true,
      maximumAge: maxAge,
      timeout: highAccTimeout,
    });

    if (highResult?.status === 'CAPTURED') {
      return resolve(highResult);
    }

    // Stage 2: Fall back to standard accuracy (Wi-Fi, cellular, IP network location)
    const standardTimeout = Math.max(2000, timeout - highAccTimeout);
    const standardResult = await querySingle({
      enableHighAccuracy: false,
      maximumAge: Math.max(maxAge, 300000), // accept recent position up to 5 mins
      timeout: standardTimeout,
    });

    if (standardResult?.status === 'CAPTURED') {
      return resolve(standardResult);
    }

    // Stage 3: If real-time queries timed out, check if we have a recent valid position from this session
    const fallback = getFallbackLocation();
    if (fallback) {
      return resolve(fallback);
    }

    // Stage 4: IP Geolocation fallback (solves Brave browser and desktop PCs with no GPS hardware)
    const ipLoc = await fetchIpLocation();
    if (ipLoc) {
      return resolve(ipLoc);
    }

    // If permission was explicitly denied and no IP location was retrieved
    if (highResult?.status === 'PERMISSION_DENIED' || highResult?.code === 1) {
      return resolve(highResult);
    }

    // If all failed, return the most descriptive failure status
    resolve(standardResult?.status !== 'UNAVAILABLE' ? standardResult : highResult);
  });
}
