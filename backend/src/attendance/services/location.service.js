export const locationMessages = Object.freeze({
  CAPTURED: 'Location shared.',
  PERMISSION_DENIED: 'Attendance marked without location — permission not granted.',
  UNAVAILABLE: 'Attendance marked — location unavailable.',
  TIMEOUT: 'Attendance marked — location request timed out.',
  UNSUPPORTED: 'Attendance marked — this browser does not support location.',
  NOT_PROVIDED: 'Attendance marked without location — no location information received.',
  INVALID: 'Attendance marked — location information could not be validated.',
});

// Location never decides whether an otherwise valid attendance event is accepted.
// Only the normal attendance service can authorize/record the event itself.
export function normalizeAttendanceLocation(input, now = new Date()) {
  const unavailable = (status) => ({ status });
  if (input == null) return unavailable('NOT_PROVIDED');
  if (typeof input !== 'object' || Array.isArray(input)) return unavailable('INVALID');
  if (!Object.hasOwn(locationMessages, input.status)) return unavailable('INVALID');
  if (input.status !== 'CAPTURED') return unavailable(input.status);
  const { latitude, longitude, accuracyMetres, capturedAt } = input;
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const timestamp = typeof capturedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(capturedAt)
    ? new Date(capturedAt) : new Date(NaN);
  const validTime = Number.isFinite(timestamp.getTime());
  const ageMs = Math.abs(now.getTime() - timestamp.getTime());
  const isFresh = ageMs <= 60 * 60 * 1000;
  if (!finite(latitude) || latitude < -90 || latitude > 90 ||
      !finite(longitude) || longitude < -180 || longitude > 180 ||
      !finite(accuracyMetres) || accuracyMetres < 0 || !validTime || !isFresh) {
    return unavailable('INVALID');
  }
  return { status: 'CAPTURED', latitude, longitude, accuracyMetres, capturedAt: timestamp };
}

export function attendanceLocationReport(location) {
  const status = location?.status;
  const safeStatus = Object.hasOwn(locationMessages, status) ? status : 'NOT_PROVIDED';
  return { status: safeStatus, message: locationMessages[safeStatus], needsAttention: safeStatus !== 'CAPTURED' };
}

export function calculateDistanceMetres(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's mean radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function formatDistanceMetres(metres) {
  if (metres >= 1000) {
    return `${(metres / 1000).toFixed(1)} km`;
  }
  return `${metres} metres`;
}

export function verifyAttendanceGeofence({ location, geofences = [], firmName = 'farm' }) {
  // If no geofences are configured/active for this farm, attendance is permitted
  const activeGeofences = (geofences || []).filter((g) => g.active !== false && Number.isFinite(g.latitude) && Number.isFinite(g.longitude));
  if (activeGeofences.length === 0) {
    return { allowed: true, reason: 'GEOFENCE_NOT_CONFIGURED' };
  }

  // When geofences are configured, location must be successfully captured
  if (!location || location.status !== 'CAPTURED') {
    let reason = 'LOCATION_REQUIRED';
    let message = 'Location access is required: Please turn on GPS and allow location permission to mark attendance.';
    if (location?.status === 'PERMISSION_DENIED') {
      message = 'Location permission denied: Please allow browser location access in settings to mark attendance within the boundary.';
    } else if (location?.status === 'TIMEOUT') {
      message = 'GPS location timed out: Please ensure location services are enabled on your device and retry.';
    } else if (location?.status === 'UNAVAILABLE') {
      message = 'GPS signal unavailable: Please ensure location services / GPS is enabled on your device.';
    } else if (location?.status === 'UNSUPPORTED') {
      message = 'Location is unsupported or blocked by your browser. Please access the application using localhost or HTTPS.';
    }
    return { allowed: false, reason, message };
  }

  const { latitude, longitude } = location;
  let minDistance = Infinity;
  let closestGeofence = null;

  for (const geo of activeGeofences) {
    const radius = geo.radiusMetres || 500;
    const dist = calculateDistanceMetres(latitude, longitude, geo.latitude, geo.longitude);
    if (dist <= radius) {
      return {
        allowed: true,
        distanceMetres: dist,
        boundaryMetres: radius,
        geofence: geo,
        match: geo.isOfficeTesting ? 'OFFICE_TESTING' : 'FARM',
      };
    }
    if (dist < minDistance) {
      minDistance = dist;
      closestGeofence = geo;
    }
  }

  const targetName = closestGeofence?.name || firmName;
  const targetRadius = closestGeofence?.radiusMetres || 500;
  return {
    allowed: false,
    reason: 'OUTSIDE_GEOFENCE',
    distanceMetres: minDistance,
    boundaryMetres: targetRadius,
    message: `Outside allowed boundary: You are ${formatDistanceMetres(minDistance)} away from ${targetName}. Attendance must be marked within ${targetRadius}m of the location.`,
  };
}
