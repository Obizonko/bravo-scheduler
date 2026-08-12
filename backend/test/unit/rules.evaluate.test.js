'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { evaluate, evaluateDayReport } = require('../../src/services/rules');
const { makeContext } = require('../fixtures/context');
const { user, shift, activity, assignment, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('evaluate — composition', () => {
  test('ok:true and empty findings for a perfectly clean candidate', () => {
    const u = user();
    const s = shift({ service_type: 'Склад', time_start: '10:00', time_end: '11:00' });
    const context = makeContext({ shifts: [s], users: [u] });
    const result = evaluate(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  });

  test('ok:false whenever any violation is present, even alongside warnings', () => {
    const u = user();
    const s = shift({ service_type: 'Склад', time_start: '07:30', time_end: '08:30', max_people: 0 }); // closed + catering window
    const context = makeContext({ shifts: [s], users: [u] });
    const result = evaluate(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.equal(result.ok, false);
    assert.ok(result.violations.some((f) => f.code === 'SHIFT_CLOSED'));
    assert.ok(result.warnings.some((f) => f.code === 'CATERING_WINDOW_CHANGEOVER'));
  });

  test('ok:true when only warnings are present (warnings never block)', () => {
    const u = user();
    const s = shift({ service_type: 'Склад', time_start: '07:30', time_end: '08:30' }); // catering warning only
    const context = makeContext({ shifts: [s], users: [u] });
    const result = evaluate(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.equal(result.ok, true);
    assert.ok(result.warnings.length > 0);
  });

  test('a driver double-booked onto a static shift during their own trip fires exactly both expected codes', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const staticShift = shift({ service_type: 'Склад', time_start: '15:00', time_end: '17:00' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: driver.user_id })];
    const context = makeContext({ shifts: [trip, staticShift], users: [driver], schedules: existing });

    const result = evaluate(context, { shift_id: staticShift.shift_id, user_id: driver.user_id });
    const codes = [...result.violations, ...result.warnings].map((f) => f.code).sort();
    assert.deepEqual(codes, ['DRIVER_ON_STATIC_DURING_TRIP', 'PERSON_DOUBLE_BOOKED']);
  });

  test('violations and warnings are sorted by code', () => {
    const driver = user({ is_driver: true });
    const trip = shift({ service_type: 'Поїздка', time_start: '14:00', time_end: '16:00' });
    const staticShift = shift({ service_type: 'Склад', time_start: '15:00', time_end: '17:00' });
    const existing = [assignment({ shift_id: trip.shift_id, user_id: driver.user_id })];
    const context = makeContext({ shifts: [trip, staticShift], users: [driver], schedules: existing });

    const result = evaluate(context, { shift_id: staticShift.shift_id, user_id: driver.user_id });
    const codes = result.violations.map((f) => f.code);
    assert.deepEqual(codes, [...codes].sort());
  });

  test('determinism: evaluating the same context and candidate twice yields deep-equal results (except the timestamp)', () => {
    const u = user();
    const s = shift({ service_type: 'Склад' });
    const context = makeContext({ shifts: [s], users: [u] });
    const candidate = { shift_id: s.shift_id, user_id: u.user_id };

    const r1 = evaluate(context, candidate);
    const r2 = evaluate(context, candidate);
    assert.deepEqual(r1.violations, r2.violations);
    assert.deepEqual(r1.warnings, r2.warnings);
    assert.deepEqual({ ...r1.meta, evaluated_at: null }, { ...r2.meta, evaluated_at: null });
  });

  test('an unparseable shift time degrades to a warning instead of throwing', () => {
    const u = user();
    const s = shift({ time_start: 'not-a-time', time_end: '11:00' });
    const context = makeContext({ shifts: [s], users: [u] });
    assert.doesNotThrow(() => {
      const result = evaluate(context, { shift_id: s.shift_id, user_id: u.user_id });
      assert.ok(result.warnings.some((f) => f.code === 'DATA_TIME_UNPARSEABLE'));
    });
  });

  test('meta includes the derived quota for the candidate shift', () => {
    const u = user();
    const s = shift({ service_type: 'ТЕЦ' });
    const context = makeContext({ shifts: [s], users: [u] });
    const result = evaluate(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.equal(result.meta.quota.max, 1); // ТЕЦ.standard
  });
});

describe('evaluateDayReport — day-level aggregate, never called from assign()/check', () => {
  test('includes MIN_PEOPLE_SHORTFALL for an understaffed shift on the anchor date', () => {
    const s = shift({ service_type: 'Склад', date: '2026-08-09' });
    const context = makeContext({ date: '2026-08-09', shifts: [s] });
    const findings = evaluateDayReport(context);
    assert.ok(findings.some((f) => f.code === 'MIN_PEOPLE_SHORTFALL'));
  });

  test('ignores shifts from the adjacent context days when reporting shortfall for the anchor date', () => {
    const neighbor = shift({ service_type: 'Склад', date: '2026-08-08' });
    const context = makeContext({ date: '2026-08-09', shifts: [neighbor] });
    const findings = evaluateDayReport(context);
    assert.equal(findings.some((f) => f.code === 'MIN_PEOPLE_SHORTFALL'), false);
  });

  test('is sorted by code', () => {
    const s = shift({ service_type: 'Склад', date: '2026-08-09' });
    const context = makeContext({ date: '2026-08-09', shifts: [s] });
    const codes = evaluateDayReport(context).map((f) => f.code);
    assert.deepEqual(codes, [...codes].sort());
  });
});
