'use strict';

const time = require('../../domain/time');
const { finding } = require('./codes');
const rulesConfig = require('../../config/rules');

function pickActivityFields(activity) {
  return {
    record_id: activity.record_id,
    name_of_activity: activity.name_of_activity,
    time_start: activity.time_start,
    time_end: activity.time_end,
    workload: activity.workload,
  };
}

/**
 * candidate = { shift_id, user_id, status }. user_id тут не впливає на результат
 * (буфер і кейтеринг - властивості самої зміни, не конкретної людини), але
 * лишається в сигнатурі для однорідності з іншими check*-функціями рушія.
 */
function checkBuffers(context, candidate) {
  const findings = [];
  const interval = context.intervalByShiftId.get(candidate.shift_id);
  if (!interval) return findings;

  // --- Буфер 20+10 хв після загальної активності ---
  // Активність, що ПЕРЕТИНАЄТЬСЯ зі зміною (а не передує їй), - це не питання буфера,
  // а OVERLAPS_ALL_HANDS_ACTIVITY; враховуємо лише найближчу активність, що закінчується
  // до початку зміни.
  let nearestGap = null;
  let nearestActivity = null;
  let overlappingAllHands = null;
  for (const { activity, interval: activityInterval } of context.activityIntervals) {
    if (time.overlaps(interval, activityInterval)) {
      if (activity.workload === 'all_hands' && !overlappingAllHands) overlappingAllHands = activity;
      continue;
    }
    const gap = time.gapMinutes(activityInterval, interval);
    if (gap !== null && gap >= 0 && (nearestGap === null || gap < nearestGap)) {
      nearestGap = gap;
      nearestActivity = activity;
    }
  }
  if (overlappingAllHands) {
    findings.push(finding('OVERLAPS_ALL_HANDS_ACTIVITY', { activity: pickActivityFields(overlappingAllHands) }));
  }
  if (nearestActivity && nearestGap < rulesConfig.buffer.totalMin) {
    findings.push(
      finding('ACTIVITY_BUFFER_TOO_SHORT', {
        activity: pickActivityFields(nearestActivity),
        gap_minutes: nearestGap,
        required_minutes: rulesConfig.buffer.totalMin,
      })
    );
  }

  // --- Вікна кейтерингу: жодних перезмінок, якщо старт АБО кінець зміни потрапляє у вікно ---
  for (const window of rulesConfig.cateringWindows) {
    const startIn = time.pointInWindow(interval.start, window);
    const endIn = time.pointInWindow(interval.end, window);
    if (startIn || endIn) {
      findings.push(
        finding('CATERING_WINDOW_CHANGEOVER', {
          window,
          boundary: startIn && endIn ? 'both' : startIn ? 'start' : 'end',
        })
      );
    }
  }

  return findings;
}

module.exports = { checkBuffers };
