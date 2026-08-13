'use strict';

const { checkOverlap } = require('./overlap');
const { checkActivityConflict } = require('./activityConflict');
const { checkCapacity, shiftShortfallFinding } = require('./capacity');
const { checkDriver } = require('./driver');
const { checkBuffers } = require('./buffers');
const { checkNightHours, nightContactFinding, postMemorialDutyFindings, gracePeriodFindings } = require('./nightHours');
const quota = require('./quota');

function byCode(a, b) {
  return a.code.localeCompare(b.code);
}

/**
 * Оцінює одного кандидата на призначення (shift_id, user_id) проти повного
 * DayContext. Чиста функція - жодних запитів до БД, жодних побічних ефектів,
 * той самий вхід завжди дає структурно рівний вихід (важливо для тестів і
 * стабільного порядку в UI - знахідки сортуються за кодом наприкінці).
 *
 * @param {object} context - DayContext, побудований rules/context.js
 * @param {{shift_id:string, user_id:string, status?:string}} candidate
 * @returns {{ok:boolean, violations:object[], warnings:object[], meta:object}}
 */
function evaluate(context, candidate) {
  const shift = context.shiftsById.get(candidate.shift_id);

  // DATA_TIME_UNPARSEABLE стосується лише ТІЄЇ зміни, на яку призначаємо -
  // решта dataWarnings контексту (сусідні дні, DATA_MASTERPLAN_NO_DATE) до
  // цього конкретного кандидата не стосуються і показуються лише у звітах
  // (evaluateDayReport), інакше кожне призначення шуміло б чужими проблемами даних.
  const ownDataWarnings = context.dataWarnings.filter(
    (w) => w.code === 'DATA_TIME_UNPARSEABLE' && w.context.entity === `shift:${candidate.shift_id}`
  );

  const all = [
    ...checkOverlap(context, candidate),
    ...checkActivityConflict(context, candidate),
    ...checkCapacity(context, candidate),
    ...checkDriver(context, candidate),
    ...checkBuffers(context, candidate),
    ...checkNightHours(context, candidate),
    ...ownDataWarnings,
  ];

  const violations = all.filter((f) => f.severity === 'violation').sort(byCode);
  const warnings = all.filter((f) => f.severity === 'warning').sort(byCode);

  const activeCount = (context.schedulesByShiftId.get(candidate.shift_id) || []).filter(
    (r) => r.status !== 'Completed' && r.user_id !== candidate.user_id
  ).length;

  return {
    ok: violations.length === 0,
    violations,
    warnings,
    meta: {
      shift_id: candidate.shift_id,
      user_id: candidate.user_id,
      date: context.date,
      current_count: activeCount,
      quota: shift ? quota.deriveQuota(context, shift) : null,
      evaluated_at: new Date().toISOString(),
    },
  };
}

/**
 * Знахідки день-рівня, що не залежать від конкретного кандидата: недобір людей,
 * відсутність нічного контакту, непокрита активність "Вечір Пам'яті", непокриті
 * пільгові хвилини. Використовується лише звітними ендпоінтами (/status,
 * /reports/conflicts) - НІКОЛИ не викликається з assign()/check, щоб недобір не
 * шумів попередженням на кожен окремий POST (перша людина з двох обов'язкових
 * завжди викликала б "недобір", що марно).
 */
function evaluateDayReport(context) {
  const findings = [...context.dataWarnings];

  for (const shift of context.shifts) {
    if (shift.date !== context.date) continue; // сусідні дні контексту - лише для перетинів/буферів, не для власного звіту
    const shortfall = shiftShortfallFinding(context, shift);
    if (shortfall) findings.push(shortfall);
  }

  const contactFinding = nightContactFinding(context);
  if (contactFinding) findings.push(contactFinding);
  findings.push(...postMemorialDutyFindings(context));
  findings.push(...gracePeriodFindings(context));

  return findings.sort(byCode);
}

module.exports = { evaluate, evaluateDayReport };
