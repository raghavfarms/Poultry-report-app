import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditTransportEntry, transportEditExpiresAt } from '../src/services/transportAccess.service.js';

const entry = { openingDate: '2026-09-01', openingTime: '00:00', createdAt: '2026-09-10T06:00:00Z' };
const expiry = Date.parse('2026-09-11T06:00:00Z');

test('users can edit for 24 hours from first save, including backdated journeys', () => {
  assert.equal(transportEditExpiresAt(entry), expiry);
  assert.equal(canEditTransportEntry(entry, 'user', expiry - 1), true);
  assert.equal(canEditTransportEntry(entry, 'user', expiry), false);
  assert.equal(canEditTransportEntry(entry, 'user', expiry + 1), false);
});

test('subsequent saves do not extend the editing window', () => {
  assert.equal(canEditTransportEntry({ ...entry, updatedAt: new Date(expiry).toISOString() }, 'user', expiry), false);
});

test('administrators retain access after expiry', () => {
  for (const role of ['admin', 'developer']) assert.equal(canEditTransportEntry(entry, role, expiry + 1000), true);
});

test('legacy records use their opening timestamp and invalid timestamps deny user edits', () => {
  assert.equal(transportEditExpiresAt({ openingDate: '2026-09-10', openingTime: '06:00' }), expiry);
  assert.equal(canEditTransportEntry({ createdAt: 'invalid' }, 'user', expiry), false);
});
