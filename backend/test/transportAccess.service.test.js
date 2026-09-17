import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditTransportEntry, transportEditExpiresAt } from '../src/services/transportAccess.service.js';

const completedEntry = {
  openingDate: '2026-09-01',
  openingTime: '00:00',
  closingReading: 15000,
  completedAt: '2026-09-10T06:00:00Z',
  createdAt: '2026-09-10T06:00:00Z',
};
const expiry = Date.parse('2026-09-11T06:00:00Z');

test('users can always edit open/incomplete entries regardless of elapsed time', () => {
  for (const emptyClosing of [null, undefined, '', 0]) {
    const openEntry = { openingDate: '2026-09-01', openingTime: '00:00', closingReading: emptyClosing, createdAt: '2026-09-01T06:00:00Z' };
    assert.equal(transportEditExpiresAt(openEntry), null);
    // even 10 days later, driver can edit/close it
    assert.equal(canEditTransportEntry(openEntry, 'user', Date.parse('2026-09-11T06:00:00Z')), true);
  }
});


test('users can edit completed entries for 24 hours from completion', () => {
  assert.equal(transportEditExpiresAt(completedEntry), expiry);
  assert.equal(canEditTransportEntry(completedEntry, 'user', expiry - 1), true);
  assert.equal(canEditTransportEntry(completedEntry, 'user', expiry), false);
  assert.equal(canEditTransportEntry(completedEntry, 'user', expiry + 1), false);
});

test('subsequent saves do not extend the editing window of completed entry', () => {
  assert.equal(canEditTransportEntry({ ...completedEntry, updatedAt: new Date(expiry).toISOString() }, 'user', expiry), false);
});

test('administrators retain access after expiry', () => {
  for (const role of ['admin', 'developer']) assert.equal(canEditTransportEntry(completedEntry, role, expiry + 1000), true);
});

test('legacy completed records use their createdAt or opening timestamp and invalid timestamps deny user edits', () => {
  assert.equal(transportEditExpiresAt({ closingReading: 15000, createdAt: '2026-09-10T06:00:00Z' }), expiry);
  assert.equal(transportEditExpiresAt({ closingReading: 15000, openingDate: '2026-09-10', openingTime: '06:00' }), expiry);
  assert.equal(canEditTransportEntry({ closingReading: 15000, createdAt: 'invalid' }, 'user', expiry), false);
});
