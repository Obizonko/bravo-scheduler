'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const time = require('../../src/domain/time');

describe('isValidCalendarDate / dayIndex', () => {
  test('accepts a real date', () => {
    assert.equal(time.isValidCalendarDate('2026-08-09'), true);
  });

  test('rejects a calendar-impossible date (Feb 31)', () => {
    assert.equal(time.isValidCalendarDate('2026-02-31'), false);
  });

  test('dayIndex is consistent day-to-day (no DST drift)', () => {
    const d1 = time.dayIndex('2026-08-09');
    const d2 = time.dayIndex('2026-08-10');
    assert.equal(d2 - d1, 1);
  });

  test('addDays round-trips through dateStrFromDayIndex', () => {
    assert.equal(time.addDays('2026-08-09', 1), '2026-08-10');
    assert.equal(time.addDays('2026-01-01', -1), '2025-12-31');
  });
});

describe('hhmmToMinutes / minutesToHhmm', () => {
  test('converts a normal time', () => {
    assert.equal(time.hhmmToMinutes('14:30'), 870);
    assert.equal(time.minutesToHhmm(870), '14:30');
  });

  test('rejects 24:00 and other out-of-range values', () => {
    assert.equal(time.hhmmToMinutes('24:00'), null);
    assert.equal(time.hhmmToMinutes('9:30'), null); // не 2-цифровий формат
  });

  test('minutesToHhmm wraps values beyond a day', () => {
    assert.equal(time.minutesToHhmm(1440 + 30), '00:30');
  });
});

describe('toInterval', () => {
  test('same-day interval', () => {
    const i = time.toInterval('2026-08-09', '14:00', '16:00');
    assert.equal(i.crossesMidnight, false);
    assert.equal(i.end - i.start, 120);
  });

  test('time_end === time_start is invalid', () => {
    assert.equal(time.toInterval('2026-08-09', '14:00', '14:00'), null);
  });

  test('time_end < time_start crosses midnight', () => {
    const i = time.toInterval('2026-08-09', '22:00', '02:00');
    assert.equal(i.crossesMidnight, true);
    assert.equal(i.end - i.start, 240); // 22:00 -> 02:00 next day = 4h
  });

  test('invalid date or time yields null', () => {
    assert.equal(time.toInterval('2026-13-01', '10:00', '11:00'), null);
    assert.equal(time.toInterval('2026-08-09', '25:00', '11:00'), null);
  });
});

describe('overlaps — the midnight-crossing cases that break naive implementations', () => {
  test('crossing shift overlaps a shift on the next calendar day', () => {
    const a = time.toInterval('2026-08-09', '22:00', '02:00'); // D 22:00 -> D+1 02:00
    const b = time.toInterval('2026-08-10', '01:00', '03:00'); // D+1 01:00 -> 03:00
    assert.equal(time.overlaps(a, b), true);
  });

  test('touching endpoints do NOT overlap (half-open)', () => {
    const a = time.toInterval('2026-08-09', '22:00', '02:00');
    const b = time.toInterval('2026-08-09', '21:00', '22:00'); // ends exactly when a starts
    assert.equal(time.overlaps(a, b), false);
  });

  test('non-overlapping same-day shifts', () => {
    const a = time.toInterval('2026-08-09', '09:00', '10:00');
    const b = time.toInterval('2026-08-09', '10:30', '11:00');
    assert.equal(time.overlaps(a, b), false);
  });

  test('null interval never overlaps', () => {
    const a = time.toInterval('2026-08-09', '09:00', '10:00');
    assert.equal(time.overlaps(a, null), false);
    assert.equal(time.overlaps(null, null), false);
  });
});

describe('gapMinutes — buffer boundaries', () => {
  test('activity ending 23:50 day D, shift starting 00:10 day D+1 -> 20 min gap', () => {
    const activity = time.toInterval('2026-08-09', '23:00', '23:50');
    const shift = time.toInterval('2026-08-10', '00:10', '01:00');
    assert.equal(time.gapMinutes(activity, shift), 20);
  });

  test('gap exactly 30 vs 29', () => {
    const activity = time.toInterval('2026-08-09', '08:00', '08:40');
    const exact30 = time.toInterval('2026-08-09', '09:10', '10:00');
    const short29 = time.toInterval('2026-08-09', '09:09', '10:00');
    assert.equal(time.gapMinutes(activity, exact30), 30);
    assert.equal(time.gapMinutes(activity, short29), 29);
  });

  test('overlapping intervals produce a non-positive gap', () => {
    const activity = time.toInterval('2026-08-09', '08:00', '09:30');
    const shift = time.toInterval('2026-08-09', '09:00', '10:00');
    assert.ok(time.gapMinutes(activity, shift) <= 0);
  });
});

describe('pointInWindow — catering boundary semantics', () => {
  const lunch = { start: '12:40', end: '14:00' };

  test('lower bound is inclusive', () => {
    const point = time.toInterval('2026-08-09', '12:40', '12:41').start;
    assert.equal(time.pointInWindow(point, lunch), true);
  });

  test('upper bound is exclusive', () => {
    const point = time.toInterval('2026-08-09', '13:59', '14:00').end; // == 14:00
    assert.equal(time.pointInWindow(point, lunch), false);
  });

  test('a point just before the window is outside it', () => {
    const point = time.toInterval('2026-08-09', '12:39', '12:40').start;
    assert.equal(time.pointInWindow(point, lunch), false);
  });
});

describe('intersectsWindow / minutesInWindow — night window crosses midnight', () => {
  const night = { start: '23:00', end: '06:00' };

  test('a shift fully inside the pre-midnight part of the night window', () => {
    const shift = time.toInterval('2026-08-09', '23:30', '23:59');
    assert.equal(time.intersectsWindow(shift, night), true);
  });

  test('a shift crossing into the post-midnight part still intersects', () => {
    const shift = time.toInterval('2026-08-09', '05:30', '07:00');
    assert.equal(time.intersectsWindow(shift, night), true);
    // 30 minutes (05:30-06:00) fall inside the night window
    assert.equal(time.minutesInWindow(shift, night), 30);
  });

  test('a daytime shift does not intersect the night window', () => {
    const shift = time.toInterval('2026-08-09', '10:00', '12:00');
    assert.equal(time.intersectsWindow(shift, night), false);
    assert.equal(time.minutesInWindow(shift, night), 0);
  });
});

describe('determinism', () => {
  test('same inputs always produce structurally equal intervals', () => {
    const a = time.toInterval('2026-08-09', '14:00', '16:00');
    const b = time.toInterval('2026-08-09', '14:00', '16:00');
    assert.deepEqual(a, b);
  });
});

describe('loose parsing for legacy data — degrades, never throws', () => {
  test('accepts DD.MM.YYYY and short H:mm', () => {
    const i = time.toIntervalLoose('09.08.2026', '9:5'.replace('9:5', '09:05'), '10:00');
    assert.ok(i);
  });

  test('DD/MM/YYYY variant', () => {
    assert.equal(time.parseLooseDate('09/08/2026'), '2026-08-09');
  });

  test('unparseable input yields null, not a throw', () => {
    assert.doesNotThrow(() => {
      const result = time.toIntervalLoose('not-a-date', 'nope', 'nope');
      assert.equal(result, null);
    });
  });
});
