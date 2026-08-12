'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkDriver } = require('../../src/services/rules/driver');
const { makeContext } = require('../fixtures/context');
const { user, shift, activity, assignment, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('checkDriver — DRIVER_ON_STATIC_DURING_TRIP (narrow hard block)', () => {
  test('driver already on an overlapping trip cannot also take a static shift', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const staticShift = shift({ service_type: 'Склад', time_start: '15:00', time_end: '17:00' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: driver.user_id })];
    const context = makeContext({ shifts: [trip, staticShift], users: [driver], schedules: existing });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: driver.user_id });
    assert.ok(findings.some((f) => f.code === 'DRIVER_ON_STATIC_DURING_TRIP'));
  });

  test('a non-driver assigned to a static shift is not subject to driver-only rules', () => {
    const nonDriver = user({ is_driver: false });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const staticShift = shift({ service_type: 'Склад', time_start: '15:00', time_end: '17:00' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: nonDriver.user_id })];
    const context = makeContext({ shifts: [trip, staticShift], users: [nonDriver], schedules: existing });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: nonDriver.user_id });
    assert.deepEqual(findings, []);
  });

  test('assigning the driver to the trip itself is not a static/trip conflict', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const context = makeContext({ shifts: [trip], users: [driver] });

    const findings = checkDriver(context, { shift_id: trip.shift_id, user_id: driver.user_id });
    assert.equal(findings.some((f) => f.code === 'DRIVER_ON_STATIC_DURING_TRIP'), false);
  });

  test('a driver whose trip does NOT overlap the static shift is unaffected', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '08:00', time_end: '09:00' });
    const staticShift = shift({ service_type: 'Склад', time_start: '15:00', time_end: '17:00' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: driver.user_id })];
    const context = makeContext({ shifts: [trip, staticShift], users: [driver], schedules: existing });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: driver.user_id });
    assert.equal(findings.some((f) => f.code === 'DRIVER_ON_STATIC_DURING_TRIP'), false);
  });
});

describe('checkDriver — QUIET_HOUR_DRIVER_UNPAIRED', () => {
  test('a lone driver on a quiet-hour shift is unpaired', () => {
    const driver = user({ is_driver: true });
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const context = makeContext({ shifts: [s], users: [driver], activities: [quiet] });

    const findings = checkDriver(context, { shift_id: s.shift_id, user_id: driver.user_id });
    assert.ok(findings.some((f) => f.code === 'QUIET_HOUR_DRIVER_UNPAIRED'));
  });

  test('driver paired with a non-driver on the same quiet shift is fine', () => {
    const driver = user({ is_driver: true });
    const nonDriver = user({ is_driver: false });
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const existing = [assignment({ shift_id: s.shift_id, user_id: nonDriver.user_id })];
    const context = makeContext({ shifts: [s], users: [driver, nonDriver], schedules: existing, activities: [quiet] });

    const findings = checkDriver(context, { shift_id: s.shift_id, user_id: driver.user_id });
    assert.equal(findings.some((f) => f.code === 'QUIET_HOUR_DRIVER_UNPAIRED'), false);
  });

  test('two drivers on the same quiet shift is still unpaired (no non-driver present)', () => {
    const driver1 = user({ is_driver: true });
    const driver2 = user({ is_driver: true });
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' });
    const quiet = activity({ workload: 'quiet', time_start: '12:30', time_end: '16:00' });
    const existing = [assignment({ shift_id: s.shift_id, user_id: driver1.user_id })];
    const context = makeContext({ shifts: [s], users: [driver1, driver2], schedules: existing, activities: [quiet] });

    const findings = checkDriver(context, { shift_id: s.shift_id, user_id: driver2.user_id });
    assert.ok(findings.some((f) => f.code === 'QUIET_HOUR_DRIVER_UNPAIRED'));
  });

  test('no quiet/all_hands overlap means no pairing requirement at all', () => {
    const driver = user({ is_driver: true });
    const s = shift({ service_type: 'Склад', time_start: '13:00', time_end: '15:00' }); // default quota, no activity overlap
    const context = makeContext({ shifts: [s], users: [driver] });

    const findings = checkDriver(context, { shift_id: s.shift_id, user_id: driver.user_id });
    assert.equal(findings.some((f) => f.code === 'QUIET_HOUR_DRIVER_UNPAIRED'), false);
  });
});

describe('checkDriver — DRIVER_RESERVED_FOR_TRIP', () => {
  test('warns when parking the last free driver on a static shift starves an unstaffed overlapping trip', () => {
    const onlyDriver = user({ is_driver: true });
    const staticShift = shift({ service_type: 'Склад', time_start: '14:00', time_end: '16:00' });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:30', time_end: '15:30' }); // overlaps, no driver assigned
    const context = makeContext({ shifts: [staticShift, trip], users: [onlyDriver] });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: onlyDriver.user_id });
    assert.ok(findings.some((f) => f.code === 'DRIVER_RESERVED_FOR_TRIP'));
  });

  test('no warning when another driver remains free for the overlapping trip', () => {
    const driverA = user({ is_driver: true });
    const driverB = user({ is_driver: true });
    const staticShift = shift({ service_type: 'Склад', time_start: '14:00', time_end: '16:00' });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:30', time_end: '15:30' });
    const context = makeContext({ shifts: [staticShift, trip], users: [driverA, driverB] });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: driverA.user_id });
    assert.equal(findings.some((f) => f.code === 'DRIVER_RESERVED_FOR_TRIP'), false);
  });

  test('no warning when the overlapping trip already has its own driver', () => {
    const driver = user({ is_driver: true });
    const tripDriver = user({ is_driver: true });
    const staticShift = shift({ service_type: 'Склад', time_start: '14:00', time_end: '16:00' });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:30', time_end: '15:30' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: tripDriver.user_id })];
    const context = makeContext({ shifts: [staticShift, trip], users: [driver, tripDriver], schedules: existing });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: driver.user_id });
    assert.equal(findings.some((f) => f.code === 'DRIVER_RESERVED_FOR_TRIP'), false);
  });
});

describe('checkDriver — combined findings on a genuinely conflicting assignment', () => {
  test('a driver double-booked onto a static shift during their own trip produces exactly the expected code set', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const staticShift = shift({ service_type: 'Склад', time_start: '15:00', time_end: '17:00' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: driver.user_id })];
    const context = makeContext({ shifts: [trip, staticShift], users: [driver], schedules: existing });

    const findings = checkDriver(context, { shift_id: staticShift.shift_id, user_id: driver.user_id });
    const codes = findings.map((f) => f.code).sort();
    assert.deepEqual(codes, ['DRIVER_ON_STATIC_DURING_TRIP']);
  });
});

describe('checkDriver — TRIP_WITHOUT_DRIVER', () => {
  test('warns when a non-driver is assigned to a Поїздка shift', () => {
    const nonDriver = user({ is_driver: false });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const context = makeContext({ shifts: [trip], users: [nonDriver] });

    const findings = checkDriver(context, { shift_id: trip.shift_id, user_id: nonDriver.user_id });
    assert.deepEqual(findings.map((f) => f.code), ['TRIP_WITHOUT_DRIVER']);
  });

  test('no warning when a driver is assigned to a Поїздка shift', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const context = makeContext({ shifts: [trip], users: [driver] });

    const findings = checkDriver(context, { shift_id: trip.shift_id, user_id: driver.user_id });
    assert.equal(findings.some((f) => f.code === 'TRIP_WITHOUT_DRIVER'), false);
  });

  test('non-driver on a non-trip shift never gets TRIP_WITHOUT_DRIVER', () => {
    const nonDriver = user({ is_driver: false });
    const s = shift({ service_type: 'ТЕЦ', time_start: '14:00', time_end: '16:00' });
    const context = makeContext({ shifts: [s], users: [nonDriver] });

    const findings = checkDriver(context, { shift_id: s.shift_id, user_id: nonDriver.user_id });
    assert.deepEqual(findings, []);
  });
});
