'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkBuffers } = require('../../src/services/rules/buffers');
const { makeContext } = require('../fixtures/context');
const { shift, activity, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('checkBuffers — activity buffer boundaries', () => {
  test('gap exactly 30 minutes is clean', () => {
    const morning = activity({ time_start: '08:00', time_end: '08:40' });
    const s = shift({ time_start: '09:10', time_end: '10:00' }); // 30 min gap
    const context = makeContext({ shifts: [s], activities: [morning] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.equal(findings.some((f) => f.code === 'ACTIVITY_BUFFER_TOO_SHORT'), false);
  });

  test('gap of 29 minutes warns', () => {
    const morning = activity({ time_start: '08:00', time_end: '08:40' });
    const s = shift({ time_start: '09:09', time_end: '10:00' }); // 29 min gap
    const context = makeContext({ shifts: [s], activities: [morning] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    const found = findings.find((f) => f.code === 'ACTIVITY_BUFFER_TOO_SHORT');
    assert.ok(found);
    assert.equal(found.context.gap_minutes, 29);
  });

  test('an activity ending 23:50 day D and a shift starting 00:10 day D+1 has a 20 min gap (needs the ±1 day window)', () => {
    const evening = activity({ date: '2026-08-09', time_start: '23:00', time_end: '23:50' });
    const s = shift({ date: '2026-08-10', time_start: '00:10', time_end: '01:00' });
    const context = makeContext({ date: '2026-08-10', shifts: [s], activities: [evening] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    const found = findings.find((f) => f.code === 'ACTIVITY_BUFFER_TOO_SHORT');
    assert.ok(found);
    assert.equal(found.context.gap_minutes, 20);
  });

  test('an activity overlapping the shift is OVERLAPS_ALL_HANDS_ACTIVITY, not a buffer warning', () => {
    const allHands = activity({ workload: 'all_hands', time_start: '13:00', time_end: '14:30' });
    const s = shift({ time_start: '14:00', time_end: '16:00' }); // overlaps the activity
    const context = makeContext({ shifts: [s], activities: [allHands] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.ok(findings.some((f) => f.code === 'OVERLAPS_ALL_HANDS_ACTIVITY'));
    assert.equal(findings.some((f) => f.code === 'ACTIVITY_BUFFER_TOO_SHORT'), false);
  });

  test('the nearest preceding activity drives the reported gap', () => {
    const far = activity({ time_start: '06:00', time_end: '06:30' });
    const near = activity({ time_start: '08:50', time_end: '09:00' });
    const s = shift({ time_start: '09:10', time_end: '11:00' }); // 10 min after "near", way more after "far"
    const context = makeContext({ shifts: [s], activities: [far, near] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    const found = findings.find((f) => f.code === 'ACTIVITY_BUFFER_TOO_SHORT');
    assert.ok(found);
    assert.equal(found.context.gap_minutes, 10);
    assert.equal(found.context.activity.record_id, near.record_id);
  });
});

describe('checkBuffers — catering window changeovers', () => {
  test('start exactly at the window lower bound (07:30) warns', () => {
    const s = shift({ time_start: '07:30', time_end: '08:30' });
    const context = makeContext({ shifts: [s] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.ok(findings.some((f) => f.code === 'CATERING_WINDOW_CHANGEOVER'));
  });

  test('start exactly at the window upper bound (09:00) is clean (exclusive)', () => {
    const s = shift({ time_start: '09:00', time_end: '10:00' });
    const context = makeContext({ shifts: [s] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.equal(findings.some((f) => f.code === 'CATERING_WINDOW_CHANGEOVER'), false);
  });

  test('a shift ending exactly at 12:40 (lunch start) warns', () => {
    const s = shift({ time_start: '11:00', time_end: '12:40' });
    const context = makeContext({ shifts: [s] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.ok(findings.some((f) => f.code === 'CATERING_WINDOW_CHANGEOVER'));
  });

  test('a shift that fully contains a catering window has no changeover (naive "intersects" gets this wrong)', () => {
    const s = shift({ time_start: '07:00', time_end: '10:00' }); // fully contains 07:30-09:00
    const context = makeContext({ shifts: [s] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.equal(findings.some((f) => f.code === 'CATERING_WINDOW_CHANGEOVER'), false);
  });

  test('a shift entirely outside any catering window is clean', () => {
    const s = shift({ time_start: '10:00', time_end: '11:00' });
    const context = makeContext({ shifts: [s] });
    const findings = checkBuffers(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.equal(findings.some((f) => f.code === 'CATERING_WINDOW_CHANGEOVER'), false);
  });
});
