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
  const timestamp = typeof capturedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capturedAt)
    ? new Date(capturedAt) : new Date(NaN);
  const validTime = Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === capturedAt;
  if (!finite(latitude) || latitude < -90 || latitude > 90 ||
      !finite(longitude) || longitude < -180 || longitude > 180 ||
      !finite(accuracyMetres) || accuracyMetres < 0 || !validTime) {
    return unavailable('INVALID');
  }
  return { status: 'CAPTURED', latitude, longitude, accuracyMetres, capturedAt: timestamp };
}

export function attendanceLocationReport(location) {
  const status = location?.status;
  const safeStatus = Object.hasOwn(locationMessages, status) ? status : 'NOT_PROVIDED';
  return { status: safeStatus, message: locationMessages[safeStatus], needsAttention: safeStatus !== 'CAPTURED' };
}
