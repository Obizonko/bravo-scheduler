'use strict';

const time = require('../../domain/time');
const rulesConfig = require('../../config/rules');

const SEVERITY_ORDER = rulesConfig.workloadSeverityOrder;

/** Активності Master Plan (з context.activityIntervals), що перетинаються із заданим інтервалом зміни. */
function overlappingActivities(context, shiftInterval) {
  if (!shiftInterval) return [];
  return context.activityIntervals
    .filter(({ interval }) => time.overlaps(shiftInterval, interval))
    .map(({ activity }) => activity);
}

/** Найсуворіший рівень навантаження серед активностей (перший, що трапиться, за workloadSeverityOrder). */
function mostRestrictiveWorkload(activities) {
  for (const level of SEVERITY_ORDER) {
    if (activities.some((a) => a.workload === level)) return level;
  }
  return null;
}

/**
 * Виводить ефективну квоту для зміни.
 * Пріоритет: 1) явні min/max_people на самій зміні ('shift_explicit');
 * 2) модифікатор найсуворішого перетину з Master Plan над базовою квотою
 *    служби ('masterplan:<level>'); 3) стандартна квота служби ('default').
 *
 * policyMin/policyMax - це те, що рекомендувала б політика, ІГНОРУЮЧИ явний
 * override на зміні. Використовується для QUOTA_OVER_RECOMMENDED (capacity.js) -
 * порівняння "адмін дозволив більше, ніж радить політика".
 */
function deriveQuota(context, shift) {
  const base = rulesConfig.quotas[shift.service_type] || { min: 0, standard: 1, max: 1 };
  const shiftInterval = context.intervalByShiftId.get(shift.shift_id);
  const activities = overlappingActivities(context, shiftInterval);
  const workloadLevel = mostRestrictiveWorkload(activities);

  let policyMax = base.standard;
  let policySource = 'default';
  if (workloadLevel) {
    const modifier = rulesConfig.workloadQuotaModifiers[workloadLevel];
    const bucket = modifier ? modifier.use : 'standard';
    policyMax = base[bucket] != null ? base[bucket] : base.standard;
    policySource = `masterplan:${workloadLevel}`;
  }
  const policyMin = base.min;

  const hasExplicit = shift.min_people != null || shift.max_people != null;
  const min = shift.min_people != null ? shift.min_people : policyMin;
  const max = shift.max_people != null ? shift.max_people : policyMax;

  const modifier = workloadLevel ? rulesConfig.workloadQuotaModifiers[workloadLevel] : null;

  return {
    min,
    max,
    source: hasExplicit ? 'shift_explicit' : policySource,
    policyMin,
    policyMax,
    policySource,
    workloadLevel,
    allowDriverPair: Boolean(modifier && modifier.allowDriverPair),
  };
}

/**
 * Ефективний максимум з урахуванням allowDriverPair: якщо квота дозволяє пару
 * (тиха година/all_hands) і серед призначених (включно з кандидатом) є хоча б
 * один водій, максимум зростає на 1 - це і є "1, або 1+1 якщо серед них водій".
 */
function effectiveMax(quota, context, assigneeUserIds) {
  if (!quota.allowDriverPair) return quota.max;
  const hasDriver = assigneeUserIds.some((uid) => {
    const user = context.usersById.get(uid);
    return user && user.is_driver;
  });
  return hasDriver ? quota.max + 1 : quota.max;
}

module.exports = { deriveQuota, overlappingActivities, mostRestrictiveWorkload, effectiveMax };
