'use strict';

let counter = 0;
function nextId(prefix) {
  counter += 1;
  return `${prefix}${String(counter).padStart(6, '0')}`;
}

function resetIds() {
  counter = 0;
}

function user(overrides = {}) {
  return {
    user_id: overrides.user_id || nextId('user_'),
    name: overrides.name || 'Тест Тестовий',
    is_driver: overrides.is_driver || false,
    telegram_id: overrides.telegram_id || '',
    role: overrides.role || 'member',
    ...overrides,
  };
}

function shift(overrides = {}) {
  return {
    shift_id: overrides.shift_id || nextId('shift_'),
    date: overrides.date || '2026-08-09',
    time_start: overrides.time_start || '10:00',
    time_end: overrides.time_end || '12:00',
    workload: overrides.workload || '',
    service_type: overrides.service_type || 'Склад',
    min_people: overrides.min_people === undefined ? null : overrides.min_people,
    max_people: overrides.max_people === undefined ? null : overrides.max_people,
    ...overrides,
  };
}

function activity(overrides = {}) {
  return {
    record_id: overrides.record_id || nextId('activity_'),
    name_of_activity: overrides.name_of_activity || 'Тестова активність',
    time_start: overrides.time_start || '08:00',
    time_end: overrides.time_end || '08:40',
    workload: overrides.workload || 'normal',
    date: overrides.date === undefined ? '2026-08-09' : overrides.date,
    is_daily: overrides.is_daily || false,
    activity_kind: overrides.activity_kind || 'other',
    ...overrides,
  };
}

function assignment(overrides = {}) {
  return {
    record_id: overrides.record_id || nextId('record_'),
    shift_id: overrides.shift_id,
    user_id: overrides.user_id,
    status: overrides.status || 'Assigned',
    ...overrides,
  };
}

module.exports = { user, shift, activity, assignment, nextId, resetIds };
