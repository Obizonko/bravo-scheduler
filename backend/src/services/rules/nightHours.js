'use strict';

const time = require('../../domain/time');
const { finding } = require('./codes');
const rulesConfig = require('../../config/rules');

/** candidate-рівень: чи потрапляє сама зміна у нічне вікно 23:00-06:00. Завжди попередження, не блок. */
function checkNightHours(context, candidate) {
  const interval = context.intervalByShiftId.get(candidate.shift_id);
  if (!interval) return [];
  if (!time.intersectsWindow(interval, rulesConfig.nightWindow)) return [];
  return [
    finding('OFF_HOURS_SHIFT', {
      shift_id: candidate.shift_id,
      window: rulesConfig.nightWindow,
      minutes_in_window: time.minutesInWindow(interval, rulesConfig.nightWindow),
    }),
  ];
}

/** День-рівень (звіти): чи є нічні зміни в контексті без налаштованого екстреного контакту. */
function nightContactFinding(context) {
  const hasNightShift = context.shifts.some((s) => {
    const interval = context.intervalByShiftId.get(s.shift_id);
    return interval && time.intersectsWindow(interval, rulesConfig.nightWindow);
  });
  if (hasNightShift && !rulesConfig.nightDuty.emergencyUserId) {
    return finding('OFF_HOURS_NO_EMERGENCY_CONTACT', {});
  }
  return null;
}

/** День-рівень (звіти): активності activity_kind==='memorial' без чергового одразу після (у межах буфера). */
function postMemorialDutyFindings(context) {
  const findings = [];
  const memorialActivities = context.activityIntervals.filter(
    ({ activity }) => activity.activity_kind === 'memorial'
  );
  for (const { activity, interval: activityInterval } of memorialActivities) {
    const covered = context.shifts.some((s) => {
      const shiftInterval = context.intervalByShiftId.get(s.shift_id);
      if (!shiftInterval) return false;
      const gap = time.gapMinutes(activityInterval, shiftInterval);
      const startsSoonAfter = gap !== null && gap >= 0 && gap <= rulesConfig.buffer.totalMin;
      if (!startsSoonAfter) return false;
      const assignees = (context.schedulesByShiftId.get(s.shift_id) || []).filter(
        (r) => r.status !== 'Completed'
      );
      return assignees.length > 0;
    });
    if (!covered) {
      findings.push(
        finding('NO_POST_MEMORIAL_DUTY', {
          activity: {
            record_id: activity.record_id,
            name_of_activity: activity.name_of_activity,
            time_end: activity.time_end,
          },
        })
      );
    }
  }
  return findings;
}

/** День-рівень (звіти): чи покриті пільгові gracePeriodMin хв після кінця робочого часу для складу/ТЕЦ. */
function gracePeriodFindings(context) {
  const findings = [];
  const graceStartMin = time.hhmmToMinutes(rulesConfig.workingHours.end);
  const graceEnd = time.minutesToHhmm(graceStartMin + rulesConfig.gracePeriodMin);
  const graceInterval = time.toInterval(context.date, rulesConfig.workingHours.end, graceEnd);
  if (!graceInterval) return findings;

  for (const serviceType of rulesConfig.serviceGroups.static) {
    const covered = context.shifts.some((s) => {
      if (s.service_type !== serviceType) return false;
      const interval = context.intervalByShiftId.get(s.shift_id);
      return interval && time.overlaps(interval, graceInterval);
    });
    if (!covered) {
      findings.push(
        finding('GRACE_PERIOD_UNCOVERED', { service_type: serviceType, grace_minutes: rulesConfig.gracePeriodMin })
      );
    }
  }
  return findings;
}

module.exports = { checkNightHours, nightContactFinding, postMemorialDutyFindings, gracePeriodFindings };
