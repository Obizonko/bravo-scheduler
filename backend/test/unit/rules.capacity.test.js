'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkCapacity, shiftShortfallFinding } = require('../../src/services/rules/capacity');
const { makeContext } = require('../fixtures/context');
const { user, shift, activity, assignment, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('checkCapacity', () => {
  test('max_people: 0 is SHIFT_CLOSED, not silently skipped (regression for the old falsy-check bug)', () => {
    const u = user();
    const s = shift({ max_people: 0 });
    const context = makeContext({ shifts: [s], users: [u] });
    const findings = checkCapacity(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.ok(findings.some((f) => f.code === 'SHIFT_CLOSED'));
  });

  test('no explicit quota falls back to the derived default (Склад standard = 2)', () => {
    const u1 = user();
    const u2 = user();
    const u3 = user();
    const s = shift({ service_type: 'Склад' }); // min/max null -> derive
    const existing = [
      assignment({ shift_id: s.shift_id, user_id: u1.user_id }),
      assignment({ shift_id: s.shift_id, user_id: u2.user_id }),
    ];
    const context = makeContext({ shifts: [s], users: [u1, u2, u3], schedules: existing });

    const findings = checkCapacity(context, { shift_id: s.shift_id, user_id: u3.user_id });
    const found = findings.find((f) => f.code === 'SHIFT_CAPACITY_EXCEEDED');
    assert.ok(found, 'a 3rd person on default Склад quota (max 2) must be rejected');
    assert.equal(found.context.max_people, 2);
  });

  test('Completed assignments do not count toward capacity', () => {
    const u1 = user();
    const u2 = user();
    const s = shift({ service_type: 'ТЕЦ', max_people: 2 });
    const existing = [
      assignment({ shift_id: s.shift_id, user_id: u1.user_id, status: 'Completed' }),
    ];
    const context = makeContext({ shifts: [s], users: [u1, u2], schedules: existing });

    const findings = checkCapacity(context, { shift_id: s.shift_id, user_id: u2.user_id });
    assert.equal(findings.some((f) => f.code === 'SHIFT_CAPACITY_EXCEEDED'), false);
  });

  test('QUOTA_OVER_RECOMMENDED when explicit max exceeds the policy recommendation for a quiet overlapping activity', () => {
    const u = user();
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00', max_people: 5 });
    const quietActivity = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const context = makeContext({ shifts: [s], users: [u], activities: [quietActivity] });

    const findings = checkCapacity(context, { shift_id: s.shift_id, user_id: u.user_id });
    const found = findings.find((f) => f.code === 'QUOTA_OVER_RECOMMENDED');
    assert.ok(found);
    assert.equal(found.context.recommended_max, 1); // Склад.min під час quiet
  });

  test('allowDriverPair bumps effective max by 1 when a driver is among assignees (all_hands)', () => {
    const driver = user({ is_driver: true });
    const nonDriver = user({ is_driver: false });
    const s = shift({ service_type: 'Склад', time_start: '18:00', time_end: '19:00' }); // no explicit quota
    const allHands = activity({ workload: 'all_hands', time_start: '17:30', time_end: '19:30' });
    const existing = [assignment({ shift_id: s.shift_id, user_id: driver.user_id })];
    const context = makeContext({ shifts: [s], users: [driver, nonDriver], schedules: existing, activities: [allHands] });

    // Базова тиха квота = 1 (зайнята водієм), другий - не-водій - має пройти завдяки 1+1
    const findings = checkCapacity(context, { shift_id: s.shift_id, user_id: nonDriver.user_id });
    assert.equal(findings.some((f) => f.code === 'SHIFT_CAPACITY_EXCEEDED'), false);
  });

  test('without a driver present, all_hands quota stays at 1 and a 2nd non-driver is rejected', () => {
    const nonDriver1 = user({ is_driver: false });
    const nonDriver2 = user({ is_driver: false });
    const s = shift({ service_type: 'Склад', time_start: '18:00', time_end: '19:00' });
    const allHands = activity({ workload: 'all_hands', time_start: '17:30', time_end: '19:30' });
    const existing = [assignment({ shift_id: s.shift_id, user_id: nonDriver1.user_id })];
    const context = makeContext({
      shifts: [s],
      users: [nonDriver1, nonDriver2],
      schedules: existing,
      activities: [allHands],
    });

    const findings = checkCapacity(context, { shift_id: s.shift_id, user_id: nonDriver2.user_id });
    assert.ok(findings.some((f) => f.code === 'SHIFT_CAPACITY_EXCEEDED'));
  });
});

describe('shiftShortfallFinding (day-report level, not called from assign/check)', () => {
  test('reports MIN_PEOPLE_SHORTFALL when below the effective minimum', () => {
    const u = user();
    const s = shift({ service_type: 'Склад' }); // default min = 1
    const context = makeContext({ shifts: [s], users: [u], schedules: [] });
    const found = shiftShortfallFinding(context, s);
    assert.ok(found);
    assert.equal(found.code, 'MIN_PEOPLE_SHORTFALL');
  });

  test('no shortfall once minimum is met', () => {
    const u = user();
    const s = shift({ service_type: 'Склад' });
    const existing = [assignment({ shift_id: s.shift_id, user_id: u.user_id })];
    const context = makeContext({ shifts: [s], users: [u], schedules: existing });
    assert.equal(shiftShortfallFinding(context, s), null);
  });
});
