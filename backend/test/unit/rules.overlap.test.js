'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkOverlap } = require('../../src/services/rules/overlap');
const { makeContext } = require('../fixtures/context');
const { user, shift, assignment, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('checkOverlap', () => {
  test('no findings when the user has no existing assignments', () => {
    const u = user();
    const s = shift();
    const context = makeContext({ shifts: [s], users: [u] });
    const findings = checkOverlap(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.deepEqual(findings, []);
  });

  test('DUPLICATE_ASSIGNMENT when already assigned (non-Completed) to the same shift', () => {
    const u = user();
    const s = shift();
    const existing = assignment({ shift_id: s.shift_id, user_id: u.user_id, status: 'Assigned' });
    const context = makeContext({ shifts: [s], users: [u], schedules: [existing] });
    const findings = checkOverlap(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.ok(findings.some((f) => f.code === 'DUPLICATE_ASSIGNMENT'));
  });

  test('a Completed record on the same shift does not count as duplicate', () => {
    const u = user();
    const s = shift();
    const existing = assignment({ shift_id: s.shift_id, user_id: u.user_id, status: 'Completed' });
    const context = makeContext({ shifts: [s], users: [u], schedules: [existing] });
    const findings = checkOverlap(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.equal(findings.some((f) => f.code === 'DUPLICATE_ASSIGNMENT'), false);
  });

  test('PERSON_DOUBLE_BOOKED when candidate shift overlaps another active assignment', () => {
    const u = user();
    const shiftA = shift({ time_start: '14:00', time_end: '16:00', service_type: 'ТЕЦ' });
    const shiftB = shift({ time_start: '15:00', time_end: '17:00', service_type: 'Склад' });
    const existing = assignment({ shift_id: shiftA.shift_id, user_id: u.user_id, status: 'Assigned' });
    const context = makeContext({ shifts: [shiftA, shiftB], users: [u], schedules: [existing] });

    const findings = checkOverlap(context, { shift_id: shiftB.shift_id, user_id: u.user_id });
    const found = findings.find((f) => f.code === 'PERSON_DOUBLE_BOOKED');
    assert.ok(found);
    assert.equal(found.context.conflicting[0].service_type, 'ТЕЦ');
  });

  test('non-overlapping shifts for the same user produce no violation', () => {
    const u = user();
    const shiftA = shift({ time_start: '09:00', time_end: '10:00' });
    const shiftB = shift({ time_start: '10:30', time_end: '11:00' });
    const existing = assignment({ shift_id: shiftA.shift_id, user_id: u.user_id });
    const context = makeContext({ shifts: [shiftA, shiftB], users: [u], schedules: [existing] });

    const findings = checkOverlap(context, { shift_id: shiftB.shift_id, user_id: u.user_id });
    assert.deepEqual(findings, []);
  });

  test('Completed assignments never trigger PERSON_DOUBLE_BOOKED', () => {
    const u = user();
    const shiftA = shift({ time_start: '14:00', time_end: '16:00' });
    const shiftB = shift({ time_start: '15:00', time_end: '17:00' });
    const existing = assignment({ shift_id: shiftA.shift_id, user_id: u.user_id, status: 'Completed' });
    const context = makeContext({ shifts: [shiftA, shiftB], users: [u], schedules: [existing] });

    const findings = checkOverlap(context, { shift_id: shiftB.shift_id, user_id: u.user_id });
    assert.deepEqual(findings, []);
  });

  test('midnight-crossing shifts on adjacent calendar days overlap correctly', () => {
    const u = user();
    const shiftA = shift({ date: '2026-08-09', time_start: '22:00', time_end: '02:00', service_type: 'Поїздка' });
    const shiftB = shift({ date: '2026-08-10', time_start: '01:00', time_end: '03:00', service_type: 'Склад' });
    const existing = assignment({ shift_id: shiftA.shift_id, user_id: u.user_id });
    // Контекст будується з якорем на дату shiftB - shiftA (попередній день) все одно
    // потрапляє у вікно ±1 день, тому overlap виявляється навіть із сусіднього дня.
    const context = makeContext({ date: '2026-08-10', shifts: [shiftA, shiftB], users: [u], schedules: [existing] });

    const findings = checkOverlap(context, { shift_id: shiftB.shift_id, user_id: u.user_id });
    assert.ok(findings.some((f) => f.code === 'PERSON_DOUBLE_BOOKED'));
  });
});
