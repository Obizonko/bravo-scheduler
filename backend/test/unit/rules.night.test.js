'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const nightHours = require('../../src/services/rules/nightHours');
const rulesConfig = require('../../src/config/rules');
const { makeContext } = require('../fixtures/context');
const { user, shift, activity, assignment, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('checkNightHours — per-candidate', () => {
  test('a shift fully inside the pre-midnight part of the night window warns', () => {
    const s = shift({ time_start: '23:30', time_end: '23:59' });
    const context = makeContext({ shifts: [s] });
    const findings = nightHours.checkNightHours(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.ok(findings.some((f) => f.code === 'OFF_HOURS_SHIFT'));
  });

  test('a shift crossing into the post-midnight part still warns, with correct minutes_in_window', () => {
    const s = shift({ time_start: '05:30', time_end: '07:00' });
    const context = makeContext({ shifts: [s] });
    const findings = nightHours.checkNightHours(context, { shift_id: s.shift_id, user_id: 'u' });
    const found = findings.find((f) => f.code === 'OFF_HOURS_SHIFT');
    assert.ok(found);
    assert.equal(found.context.minutes_in_window, 30);
  });

  test('a daytime shift never triggers OFF_HOURS_SHIFT', () => {
    const s = shift({ time_start: '10:00', time_end: '12:00' });
    const context = makeContext({ shifts: [s] });
    const findings = nightHours.checkNightHours(context, { shift_id: s.shift_id, user_id: 'u' });
    assert.deepEqual(findings, []);
  });
});

describe('nightContactFinding — day-report level', () => {
  const originalEmergencyUserId = rulesConfig.nightDuty.emergencyUserId;
  afterEach(() => {
    // rulesConfig - process-wide singleton (config/rules.js); ці тести навмисно
    // мутують nightDuty.emergencyUserId для перевірки обох гілок, тому обов'язково
    // відновлюємо початкове значення, щоб не протікати в інші тестові файли.
    rulesConfig.nightDuty.emergencyUserId = originalEmergencyUserId;
  });

  test('warns when a night shift exists but no emergency contact is configured', () => {
    rulesConfig.nightDuty.emergencyUserId = null;
    const s = shift({ time_start: '23:30', time_end: '23:59' });
    const context = makeContext({ shifts: [s] });
    assert.equal(nightHours.nightContactFinding(context)?.code, 'OFF_HOURS_NO_EMERGENCY_CONTACT');
  });

  test('no warning once an emergency contact is configured', () => {
    rulesConfig.nightDuty.emergencyUserId = 'user_000001';
    const s = shift({ time_start: '23:30', time_end: '23:59' });
    const context = makeContext({ shifts: [s] });
    assert.equal(nightHours.nightContactFinding(context), null);
  });

  test('no warning when there are simply no night shifts in the context', () => {
    rulesConfig.nightDuty.emergencyUserId = null;
    const s = shift({ time_start: '10:00', time_end: '12:00' });
    const context = makeContext({ shifts: [s] });
    assert.equal(nightHours.nightContactFinding(context), null);
  });
});

describe('postMemorialDutyFindings', () => {
  test('warns when a memorial activity has no shift covering the aftermath', () => {
    const memorial = activity({
      activity_kind: 'memorial',
      name_of_activity: 'Вечір Пам\'яті',
      time_start: '20:00',
      time_end: '21:00',
    });
    const context = makeContext({ shifts: [], activities: [memorial] });
    const findings = nightHours.postMemorialDutyFindings(context);
    assert.ok(findings.some((f) => f.code === 'NO_POST_MEMORIAL_DUTY'));
  });

  test('no warning when a staffed shift starts within the buffer window right after', () => {
    const memorial = activity({
      activity_kind: 'memorial',
      name_of_activity: 'Вечір Пам\'яті',
      time_start: '20:00',
      time_end: '21:00',
    });
    const dutyPerson = user();
    const s = shift({ service_type: 'Склад', time_start: '21:10', time_end: '22:00' }); // 10 min after
    const existing = [assignment({ shift_id: s.shift_id, user_id: dutyPerson.user_id })];
    const context = makeContext({ shifts: [s], users: [dutyPerson], schedules: existing, activities: [memorial] });
    const findings = nightHours.postMemorialDutyFindings(context);
    assert.equal(findings.some((f) => f.code === 'NO_POST_MEMORIAL_DUTY'), false);
  });

  test('an unstaffed shift right after does not count as coverage', () => {
    const memorial = activity({ activity_kind: 'memorial', time_start: '20:00', time_end: '21:00' });
    const s = shift({ service_type: 'Склад', time_start: '21:10', time_end: '22:00' });
    const context = makeContext({ shifts: [s], activities: [memorial] }); // no schedules
    const findings = nightHours.postMemorialDutyFindings(context);
    assert.ok(findings.some((f) => f.code === 'NO_POST_MEMORIAL_DUTY'));
  });

  test('non-memorial activities are ignored entirely', () => {
    const regular = activity({ activity_kind: 'other', time_start: '20:00', time_end: '21:00' });
    const context = makeContext({ shifts: [], activities: [regular] });
    assert.deepEqual(nightHours.postMemorialDutyFindings(context), []);
  });
});

describe('gracePeriodFindings', () => {
  test('warns per static service type when nothing covers the grace window after working hours', () => {
    const context = makeContext({ shifts: [] });
    const findings = nightHours.gracePeriodFindings(context);
    const services = findings.filter((f) => f.code === 'GRACE_PERIOD_UNCOVERED').map((f) => f.context.service_type);
    assert.ok(services.includes('Склад'));
    assert.ok(services.includes('ТЕЦ'));
  });

  test('no warning for a service type whose shift covers the grace window', () => {
    // workingHours.end = 23:00, gracePeriodMin = 30 -> grace window 23:00-23:30
    const covering = shift({ service_type: 'Склад', time_start: '22:30', time_end: '23:30' });
    const context = makeContext({ shifts: [covering] });
    const findings = nightHours.gracePeriodFindings(context);
    const uncoveredServices = findings.map((f) => f.context.service_type);
    assert.equal(uncoveredServices.includes('Склад'), false);
    assert.ok(uncoveredServices.includes('ТЕЦ')); // ТЕЦ still uncovered
  });
});
