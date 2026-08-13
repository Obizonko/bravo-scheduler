'use strict';

const time = require('../../domain/time');
const { finding } = require('./codes');

/**
 * candidate = { shift_id, user_id, status }.
 *
 * PERSON_ON_ACTIVITY - людину вже записано (activity_assignments) на активність
 * Master Plan, чий інтервал перетинається з кандидатською зміною. На відміну
 * від OVERLAPS_ALL_HANDS_ACTIVITY (buffers.js, дивиться лише на факт наявності
 * якоїсь активності в цей час) - тут важливо саме те, що ЦЯ КОНКРЕТНА людина на
 * ЦІЙ КОНКРЕТНІЙ активності, тому й жорсткий блок, а не порада.
 */
function checkActivityConflict(context, candidate) {
  const findings = [];
  const interval = context.intervalByShiftId.get(candidate.shift_id);
  if (!interval) return findings;

  const myAssignments = context.activityAssignmentsByUserId.get(candidate.user_id) || [];
  if (myAssignments.length === 0) return findings;

  const myActivityIds = new Set(myAssignments.map((a) => a.master_plan_id));
  const conflicting = [];
  for (const { activity, interval: activityInterval } of context.activityIntervals) {
    if (!myActivityIds.has(activity.record_id)) continue;
    if (time.overlaps(interval, activityInterval)) {
      conflicting.push({
        record_id: activity.record_id,
        name_of_activity: activity.name_of_activity,
        time_start: activity.time_start,
        time_end: activity.time_end,
      });
    }
  }

  if (conflicting.length > 0) {
    findings.push(finding('PERSON_ON_ACTIVITY', { user_id: candidate.user_id, conflicting }));
  }
  return findings;
}

module.exports = { checkActivityConflict };
