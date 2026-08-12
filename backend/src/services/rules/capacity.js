'use strict';

const { finding } = require('./codes');
const quota = require('./quota');

/**
 * candidate = { shift_id, user_id, status }
 * Поглинає стару перевірку max_people зі scheduleService.assign() і робить
 * правильно випадок max_people === 0 (раніше `if (shift.max_people)` мовчки
 * пропускав перевірку для "закритої" зміни, бо 0 - хибне значення в JS).
 */
function checkCapacity(context, candidate) {
  const findings = [];
  const shift = context.shiftsById.get(candidate.shift_id);
  if (!shift) return findings; // відсутність зміни - відповідальність оркестратора (404), не рушія правил

  const q = quota.deriveQuota(context, shift);

  if (q.max === 0) {
    findings.push(finding('SHIFT_CLOSED', { shift_id: shift.shift_id }));
    return findings;
  }

  const existing = (context.schedulesByShiftId.get(candidate.shift_id) || []).filter(
    (r) => r.status !== 'Completed' && r.user_id !== candidate.user_id
  );
  const assigneeUserIds = [...existing.map((r) => r.user_id), candidate.user_id];
  const effMax = quota.effectiveMax(q, context, assigneeUserIds);
  const projectedCount = existing.length + 1;

  if (projectedCount > effMax) {
    findings.push(
      finding('SHIFT_CAPACITY_EXCEEDED', {
        shift_id: shift.shift_id,
        max_people: effMax,
        current_count: existing.length,
        source: q.source,
      })
    );
  }

  if (q.source === 'shift_explicit' && shift.max_people != null && shift.max_people > q.policyMax) {
    findings.push(
      finding('QUOTA_OVER_RECOMMENDED', {
        shift_id: shift.shift_id,
        effective_max: shift.max_people,
        recommended_max: q.policyMax,
        workload_level: q.workloadLevel,
      })
    );
  }

  return findings;
}

/**
 * День-рівень (не викликається з assign()/check - лише зі звітних ендпоінтів):
 * чи не менше на зміні людей, ніж ефективний мінімум.
 */
function shiftShortfallFinding(context, shift) {
  const q = quota.deriveQuota(context, shift);
  const activeCount = (context.schedulesByShiftId.get(shift.shift_id) || []).filter(
    (r) => r.status !== 'Completed'
  ).length;
  if (activeCount < q.min) {
    return finding('MIN_PEOPLE_SHORTFALL', {
      shift_id: shift.shift_id,
      current_count: activeCount,
      min_people: q.min,
    });
  }
  return null;
}

module.exports = { checkCapacity, shiftShortfallFinding };
