'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkActivityConflict } = require('../../src/services/rules/activityConflict');
const { makeContext } = require('../fixtures/context');
const { user, shift, activity, activityAssignment, resetIds } = require('../fixtures/builders');

beforeEach(() => resetIds());

describe('checkActivityConflict', () => {
  test('no findings when the user has no activity assignments at all', () => {
    const u = user();
    const s = shift();
    const context = makeContext({ shifts: [s], users: [u] });
    const findings = checkActivityConflict(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.deepEqual(findings, []);
  });

  test('PERSON_ON_ACTIVITY when the candidate shift overlaps an activity the user is on', () => {
    const u = user();
    const s = shift({ date: '2026-08-09', time_start: '14:00', time_end: '16:00' });
    const a = activity({ date: '2026-08-09', time_start: '15:00', time_end: '15:30' });
    const link = activityAssignment({ user_id: u.user_id, master_plan_id: a.record_id });
    const context = makeContext({ shifts: [s], users: [u], activities: [a], activityAssignments: [link] });

    const findings = checkActivityConflict(context, { shift_id: s.shift_id, user_id: u.user_id });
    const found = findings.find((f) => f.code === 'PERSON_ON_ACTIVITY');
    assert.ok(found);
    assert.equal(found.context.conflicting[0].record_id, a.record_id);
  });

  test('no finding when the activity does not overlap the candidate shift time', () => {
    const u = user();
    const s = shift({ date: '2026-08-09', time_start: '14:00', time_end: '16:00' });
    const a = activity({ date: '2026-08-09', time_start: '09:00', time_end: '09:30' });
    const link = activityAssignment({ user_id: u.user_id, master_plan_id: a.record_id });
    const context = makeContext({ shifts: [s], users: [u], activities: [a], activityAssignments: [link] });

    const findings = checkActivityConflict(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.deepEqual(findings, []);
  });

  test('no finding when a DIFFERENT user is on the overlapping activity', () => {
    const u = user();
    const other = user();
    const s = shift({ date: '2026-08-09', time_start: '14:00', time_end: '16:00' });
    const a = activity({ date: '2026-08-09', time_start: '15:00', time_end: '15:30' });
    const link = activityAssignment({ user_id: other.user_id, master_plan_id: a.record_id });
    const context = makeContext({ shifts: [s], users: [u, other], activities: [a], activityAssignments: [link] });

    const findings = checkActivityConflict(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.deepEqual(findings, []);
  });

  test('is_daily activity conflicts on any date at the same time of day', () => {
    const u = user();
    const s = shift({ date: '2026-08-11', time_start: '08:00', time_end: '08:30' });
    const a = activity({ date: null, is_daily: true, time_start: '08:15', time_end: '08:45' });
    const link = activityAssignment({ user_id: u.user_id, master_plan_id: a.record_id });
    const context = makeContext({ date: '2026-08-11', shifts: [s], users: [u], activities: [a], activityAssignments: [link] });

    const findings = checkActivityConflict(context, { shift_id: s.shift_id, user_id: u.user_id });
    assert.ok(findings.some((f) => f.code === 'PERSON_ON_ACTIVITY'));
  });
});
