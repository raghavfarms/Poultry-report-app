import test from 'node:test';
import assert from 'node:assert/strict';
import { canEditDieselEntry } from '../src/services/dieselAccess.service.js';

test('administrators and developers can edit any saved entry regardless of age', () => {
  for (const role of ['admin', 'developer']) {
    assert.equal(canEditDieselEntry({ date: '2026-10-01', role, referenceDate: '2026-10-10' }), true);
    assert.equal(canEditDieselEntry({ date: '2026-10-09', role, referenceDate: '2026-10-10' }), true);
    assert.equal(canEditDieselEntry({ date: '2026-10-10', role, referenceDate: '2026-10-10' }), true);
    assert.equal(canEditDieselEntry({ date: '2026-10-12', role, referenceDate: '2026-10-10' }), true);
  }
});

test('users can edit today and last day (yesterday) entry within 48 hour window', () => {
  const referenceDate = '2026-10-10'; // e.g. Day 10
  // Day 10 (today)
  assert.equal(canEditDieselEntry({ date: '2026-10-10', role: 'user', referenceDate }), true);
  // Day 9 (yesterday / last day entry)
  assert.equal(canEditDieselEntry({ date: '2026-10-09', role: 'user', referenceDate }), true);
  // Day 8 (2 days ago / after 48 hours) -> expired, converts to false
  assert.equal(canEditDieselEntry({ date: '2026-10-08', role: 'user', referenceDate }), false);
  // Earlier dates -> expired
  assert.equal(canEditDieselEntry({ date: '2026-10-04', role: 'user', referenceDate }), false);
});

test('when Day 11 arrives, Day 9 edit window expires and Day 10 becomes editable last day entry', () => {
  const referenceDate = '2026-10-11'; // e.g. Day 11 comes
  // Day 11 (today)
  assert.equal(canEditDieselEntry({ date: '2026-10-11', role: 'user', referenceDate }), true);
  // Day 10 (yesterday / last day entry)
  assert.equal(canEditDieselEntry({ date: '2026-10-10', role: 'user', referenceDate }), true);
  // Day 9 (now >48 hours / 2 days ago) -> edit option disappears
  assert.equal(canEditDieselEntry({ date: '2026-10-09', role: 'user', referenceDate }), false);
});

test('missing rows and future dates are not editable by standard users', () => {
  assert.equal(canEditDieselEntry({ date: '2026-10-10', isMissing: true, role: 'user', referenceDate: '2026-10-10' }), false);
  assert.equal(canEditDieselEntry({ date: '2026-10-11', role: 'user', referenceDate: '2026-10-10' }), false);
});

