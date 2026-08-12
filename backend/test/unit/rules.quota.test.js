'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const quota = require('../../src/services/rules/quota');
const { makeContext } = require('../fixtures/context');
const { user, shift, activity, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('deriveQuota', () => {
  test('no explicit quota, no overlapping activity -> default (Склад standard = 2)', () => {
    const s = shift({ service_type: 'Склад' });
    const context = makeContext({ shifts: [s] });
    const q = quota.deriveQuota(context, s);
    assert.equal(q.source, 'default');
    assert.equal(q.min, 1);
    assert.equal(q.max, 2);
  });

  test('overlapping quiet activity collapses both min and max to the service minimum', () => {
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const context = makeContext({ shifts: [s], activities: [quiet] });
    const q = quota.deriveQuota(context, s);
    assert.equal(q.source, 'masterplan:quiet');
    assert.equal(q.max, 1);
    assert.equal(q.allowDriverPair, true);
  });

  test('overlapping peak activity raises max to the service ceiling', () => {
    const s = shift({ service_type: 'Склад', time_start: '07:00', time_end: '08:00' });
    const peak = activity({ workload: 'peak', time_start: '06:30', time_end: '08:30' });
    const context = makeContext({ shifts: [s], activities: [peak] });
    const q = quota.deriveQuota(context, s);
    assert.equal(q.source, 'masterplan:peak');
    assert.equal(q.max, 3); // Склад.max
  });

  test('when peak and all_hands both overlap, all_hands (more restrictive) wins', () => {
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '14:00' });
    const peak = activity({ workload: 'peak', time_start: '12:00', time_end: '15:00' });
    const allHands = activity({ workload: 'all_hands', time_start: '13:30', time_end: '14:30' });
    const context = makeContext({ shifts: [s], activities: [peak, allHands] });
    const q = quota.deriveQuota(context, s);
    assert.equal(q.workloadLevel, 'all_hands');
    assert.equal(q.max, 1);
  });

  test('explicit shift min/max always wins over any workload-derived quota', () => {
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00', min_people: 2, max_people: 4 });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const context = makeContext({ shifts: [s], activities: [quiet] });
    const q = quota.deriveQuota(context, s);
    assert.equal(q.source, 'shift_explicit');
    assert.equal(q.min, 2);
    assert.equal(q.max, 4);
    // Policy-only (ignoring the override) is still tracked, for QUOTA_OVER_RECOMMENDED:
    assert.equal(q.policyMax, 1);
  });
});

describe('effectiveMax — driver pairing bump', () => {
  test('bumps max by 1 when a driver is among the assignees and allowDriverPair is set', () => {
    const driver = user({ is_driver: true });
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const context = makeContext({ shifts: [s], users: [driver], activities: [quiet] });
    const q = quota.deriveQuota(context, s);
    assert.equal(quota.effectiveMax(q, context, [driver.user_id]), 2);
  });

  test('does not bump when no driver is present', () => {
    const nonDriver = user({ is_driver: false });
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const context = makeContext({ shifts: [s], users: [nonDriver], activities: [quiet] });
    const q = quota.deriveQuota(context, s);
    assert.equal(quota.effectiveMax(q, context, [nonDriver.user_id]), 1);
  });

  test('does not bump when allowDriverPair is not set for the current quota (e.g. normal load)', () => {
    const driver = user({ is_driver: true });
    const s = shift({ service_type: 'Склад' }); // default quota, no workload override
    const context = makeContext({ shifts: [s], users: [driver] });
    const q = quota.deriveQuota(context, s);
    assert.equal(quota.effectiveMax(q, context, [driver.user_id]), q.max);
  });
});
