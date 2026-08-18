'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createShiftSchema, updateShiftSchema } = require('../../src/validators/shiftValidator');
const {
  createMasterPlanSchema,
  updateMasterPlanSchema,
} = require('../../src/validators/masterPlanValidator');

describe('shiftValidator — createShiftSchema', () => {
  const base = {
    date: '2026-08-09',
    time_start: '14:00',
    time_end: '16:00',
    service_type: 'Склад',
  };

  test('accepts a well-formed shift with explicit quota', () => {
    const { error, value } = createShiftSchema.validate({ ...base, min_people: 1, max_people: 3 });
    assert.equal(error, undefined);
    assert.equal(value.min_people, 1);
  });

  test('quota is optional — null means "derive from rules engine"', () => {
    const { error, value } = createShiftSchema.validate(base);
    assert.equal(error, undefined);
    assert.equal(value.min_people, undefined); // not sent, no default forced
  });

  test('rejects a non-canonical date format', () => {
    const { error } = createShiftSchema.validate({ ...base, date: '09.08.2026' });
    assert.ok(error);
  });

  test('rejects a calendar-impossible date', () => {
    const { error } = createShiftSchema.validate({ ...base, date: '2026-02-30' });
    assert.ok(error);
  });

  test('rejects time_end === time_start', () => {
    const { error } = createShiftSchema.validate({
      ...base,
      time_start: '14:00',
      time_end: '14:00',
    });
    assert.ok(error);
    assert.match(error.message, /time_end/);
  });

  test('allows time_end < time_start (midnight crossing)', () => {
    const { error } = createShiftSchema.validate({
      ...base,
      time_start: '22:00',
      time_end: '02:00',
    });
    assert.equal(error, undefined);
  });

  test('rejects max_people < min_people', () => {
    const { error } = createShiftSchema.validate({ ...base, min_people: 3, max_people: 1 });
    assert.ok(error);
    assert.match(error.message, /max_people/);
  });

  test('rejects an unknown service_type', () => {
    const { error } = createShiftSchema.validate({ ...base, service_type: 'Кухня' });
    assert.ok(error);
  });

  test('escort is optional — a trip with nobody accompanying the driver is normal', () => {
    const { error } = createShiftSchema.validate(base);
    assert.equal(error, undefined);
  });

  test('escort accepts a name and trims it', () => {
    const { error, value } = createShiftSchema.validate({ ...base, escort: '  Дельтюк  ' });
    assert.equal(error, undefined);
    assert.equal(value.escort, 'Дельтюк');
  });

  test('escort accepts an empty string — the field was cleared, not left unset', () => {
    const { error } = createShiftSchema.validate({ ...base, escort: '' });
    assert.equal(error, undefined);
  });

  test('rejects an escort name longer than the column allows', () => {
    const { error } = createShiftSchema.validate({ ...base, escort: 'я'.repeat(101) });
    assert.ok(error);
  });
});

describe('shiftValidator — updateShiftSchema (regression: max/min cross-check was previously lost here)', () => {
  test('rejects max_people < min_people on partial update too', () => {
    const { error } = updateShiftSchema.validate({ min_people: 3, max_people: 1 });
    assert.ok(error, 'update schema must enforce max_people >= min_people just like create');
  });

  test('accepts a single-field partial update', () => {
    const { error } = updateShiftSchema.validate({ workload: 'peak' });
    assert.equal(error, undefined);
  });

  test('rejects an empty update body', () => {
    const { error } = updateShiftSchema.validate({});
    assert.ok(error);
  });

  test('escort can be cleared on update — an empty string is a real value here', () => {
    const { error, value } = updateShiftSchema.validate({ escort: '' });
    assert.equal(error, undefined);
    assert.equal(value.escort, '');
  });
});

describe('masterPlanValidator — date XOR is_daily', () => {
  const base = { name_of_activity: 'Руханка', time_start: '08:00', time_end: '08:40' };

  test('accepts a dated, non-recurring activity', () => {
    const { error, value } = createMasterPlanSchema.validate({ ...base, date: '2026-08-09' });
    assert.equal(error, undefined);
    assert.equal(value.is_daily, false);
  });

  test('accepts a recurring daily activity with no date', () => {
    const { error, value } = createMasterPlanSchema.validate({ ...base, is_daily: true });
    assert.equal(error, undefined);
    assert.equal(value.date, undefined);
  });

  test('rejects neither date nor is_daily (the default-vs-xor trap)', () => {
    const { error } = createMasterPlanSchema.validate({ ...base });
    assert.ok(
      error,
      'omitting both date and is_daily must fail, not silently pass via the is_daily default'
    );
  });

  test('rejects both date and is_daily:true at once', () => {
    const { error } = createMasterPlanSchema.validate({
      ...base,
      date: '2026-08-09',
      is_daily: true,
    });
    assert.ok(error);
  });

  test('rejects an out-of-vocabulary workload value', () => {
    const { error } = createMasterPlanSchema.validate({
      ...base,
      date: '2026-08-09',
      workload: 'super-busy',
    });
    assert.ok(error);
  });

  test('accepts a controlled workload value', () => {
    const { error } = createMasterPlanSchema.validate({
      ...base,
      date: '2026-08-09',
      workload: 'all_hands',
    });
    assert.equal(error, undefined);
  });
});

describe('masterPlanValidator — updateMasterPlanSchema (partial)', () => {
  test('a partial update touching neither date nor is_daily is fine', () => {
    const { error } = updateMasterPlanSchema.validate({ workload: 'quiet' });
    assert.equal(error, undefined);
  });

  test('setting is_daily:true while also sending a date in the same request is rejected', () => {
    const { error } = updateMasterPlanSchema.validate({ is_daily: true, date: '2026-08-09' });
    assert.ok(error);
  });
});
