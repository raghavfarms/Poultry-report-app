import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDistanceMetres, formatDistanceMetres, verifyAttendanceGeofence } from '../src/attendance/services/location.service.js';
import { getAutoCutShiftDetails } from '../src/attendance/services/attendance.service.js';
import { masterPayload } from '../src/attendance/validation.js';

test('calculateDistanceMetres computes accurate Haversine distances', () => {
  // Same point
  assert.equal(calculateDistanceMetres(18.5204, 73.8567, 18.5204, 73.8567), 0);

  // Pune to Mumbai is approx 120 km (115–125 km great-circle distance)
  const puneToMumbai = calculateDistanceMetres(18.5204, 73.8567, 19.0760, 72.8777);
  assert.ok(puneToMumbai > 115000 && puneToMumbai < 125000, `Expected ~120km, got ${puneToMumbai}m`);

  // Small distance ~111 meters for 0.001 degree latitude
  const smallDist = calculateDistanceMetres(18.5200, 73.8567, 18.5210, 73.8567);
  assert.ok(smallDist > 105 && smallDist < 115, `Expected ~111m, got ${smallDist}m`);
});

test('formatDistanceMetres formats meters and km nicely', () => {
  assert.equal(formatDistanceMetres(450), '450 metres');
  assert.equal(formatDistanceMetres(1000), '1.0 km');
  assert.equal(formatDistanceMetres(14200), '14.2 km');
});

test('verifyAttendanceGeofence behavior', () => {
  const farmLocation = {
    name: 'Raghav Farm Campus',
    latitude: 18.5200,
    longitude: 73.8500,
    radiusMetres: 500,
    active: true,
  };

  const officeLocation = {
    name: 'Head Office (Testing)',
    latitude: 18.5600,
    longitude: 73.8900,
    radiusMetres: 300,
    isOfficeTesting: true,
    active: true,
  };

  // 1. Geofences empty or not configured -> allowed
  assert.equal(verifyAttendanceGeofence({ location: null, geofences: [] }).allowed, true);

  // 2. Geofence active, but location permission denied
  const deniedRes = verifyAttendanceGeofence({
    location: { status: 'PERMISSION_DENIED' },
    geofences: [farmLocation],
  });
  assert.equal(deniedRes.allowed, false);
  assert.match(deniedRes.message, /Location permission denied/);

  // 3. Geofence active, location unavailable
  const unavailRes = verifyAttendanceGeofence({
    location: { status: 'UNAVAILABLE' },
    geofences: [farmLocation],
  });
  assert.equal(unavailRes.allowed, false);
  assert.match(unavailRes.message, /GPS signal unavailable/);

  // 4. Worker is inside farm boundary (approx 90m away)
  const insideScan = {
    status: 'CAPTURED',
    latitude: 18.5208,
    longitude: 73.8500,
  };
  const insideRes = verifyAttendanceGeofence({
    location: insideScan,
    geofences: [farmLocation],
  });
  assert.equal(insideRes.allowed, true);
  assert.equal(insideRes.match, 'FARM');
  assert.ok(insideRes.distanceMetres <= 500);

  // 5. Worker is outside farm boundary (approx 5.5 km away)
  const outsideScan = {
    status: 'CAPTURED',
    latitude: 18.4700,
    longitude: 73.8500,
  };
  const outsideRes = verifyAttendanceGeofence({
    location: outsideScan,
    geofences: [farmLocation],
    firmName: 'Raghav Farms',
  });
  assert.equal(outsideRes.allowed, false);
  assert.equal(outsideRes.reason, 'OUTSIDE_GEOFENCE');
  assert.match(outsideRes.message, /Outside allowed boundary/);
  assert.match(outsideRes.message, /Raghav Farm Campus/);

  // 6. Worker is at Office Testing location
  const officeScan = {
    status: 'CAPTURED',
    latitude: 18.5605, // ~60m from office
    longitude: 73.8900,
  };
  const officeRes = verifyAttendanceGeofence({
    location: officeScan,
    geofences: [farmLocation, officeLocation],
  });
  assert.equal(officeRes.allowed, true);
  assert.equal(officeRes.match, 'OFFICE_TESTING');
});

test('masterPayload validates geofence configuration properly', () => {
  // Valid geofence
  const valid = masterPayload('geofences', {
    name: 'Raghav Farm Main',
    latitude: 18.52,
    longitude: 73.85,
    radiusMetres: 500,
  });
  assert.equal(valid.name, 'Raghav Farm Main');
  assert.equal(valid.latitude, 18.52);
  assert.equal(valid.longitude, 73.85);
  assert.equal(valid.radiusMetres, 500);

  // Out of bounds coordinates throw 400
  assert.throws(() => masterPayload('geofences', {
    name: 'Test',
    latitude: 95,
    longitude: 73.85,
  }), { status: 400 });

  // Negative or excessive radius throws 400
  assert.throws(() => masterPayload('geofences', {
    name: 'Test',
    latitude: 18.52,
    longitude: 73.85,
    radiusMetres: -5,
  }), { status: 400 });
});

test('getAutoCutShiftDetails correctly detects night vs day shifts', () => {
  // 8:00 PM IST (14:30 UTC) -> Night Shift (12 hrs)
  const night1 = getAutoCutShiftDetails(new Date('2026-09-16T14:30:00.000Z'));
  assert.equal(night1.isNightShift, true);
  assert.equal(night1.shiftHours, 12);
  assert.equal(night1.shiftMinutes, 720);

  // 2:00 AM IST (20:30 UTC previous day) -> Night Shift (12 hrs)
  const night2 = getAutoCutShiftDetails(new Date('2026-09-16T20:30:00.000Z'));
  assert.equal(night2.isNightShift, true);
  assert.equal(night2.shiftHours, 12);

  // 8:00 AM IST (02:30 UTC) -> Day Shift (8 hrs)
  const day1 = getAutoCutShiftDetails(new Date('2026-09-16T02:30:00.000Z'));
  assert.equal(day1.isNightShift, false);
  assert.equal(day1.shiftHours, 8);
  assert.equal(day1.shiftMinutes, 480);

  // 2:00 PM IST (08:30 UTC) -> Day Shift (8 hrs)
  const day2 = getAutoCutShiftDetails(new Date('2026-09-16T08:30:00.000Z'));
  assert.equal(day2.isNightShift, false);
  assert.equal(day2.shiftHours, 8);
});

