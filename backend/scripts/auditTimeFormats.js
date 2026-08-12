#!/usr/bin/env node
'use strict';

/**
 * Read-only аудит: перелічує рядки Shift/MasterPlan, чий date/time_start/time_end
 * не відповідає канонічному формату (YYYY-MM-DD / HH:mm). Нічого не пише в БД.
 *
 * Рушій правил і так толерує такі рядки на читанні (domain/time.js#parseLoose*,
 * деградує в попередження DATA_TIME_UNPARSEABLE замість падіння), але для
 * довгострокової чистоти даних їх варто виправити вручну через UI/адмінку -
 * автовиправлення тут навмисно немає (ризиковано вгадувати намір з "09.08.2026").
 *
 * Запуск: node scripts/auditTimeFormats.js
 */

const { assertRequiredConfig } = require('../src/config/env');
const { connectMongo, disconnectMongo } = require('../src/database/mongoClient');
const shiftRepository = require('../src/repositories/shiftRepository');
const masterPlanRepository = require('../src/repositories/masterPlanRepository');
const { DATE_PATTERN, TIME_PATTERN, isValidCalendarDate } = require('../src/domain/time');

function isCanonicalDate(value) {
  return typeof value === 'string' && DATE_PATTERN.test(value) && isValidCalendarDate(value);
}

function isCanonicalTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/**
 * @param {string} entityLabel - мітка для виводу ('shift' | 'master_plan')
 * @param {object} row - сирий запис (з полем id для ідентифікації в лозі)
 * @param {string} id
 * @param {boolean} dateRequired - false для MasterPlan: is_daily-активності легітимно не мають date
 * @returns {boolean} true, якщо знайдено хоч одну проблему
 */
function auditRow(entityLabel, row, id, dateRequired) {
  const problems = [];
  const hasDate = row.date !== null && row.date !== undefined && row.date !== '';
  if (dateRequired || hasDate) {
    if (!isCanonicalDate(row.date)) problems.push(`date="${row.date}"`);
  }
  if (!isCanonicalTime(row.time_start)) problems.push(`time_start="${row.time_start}"`);
  if (!isCanonicalTime(row.time_end)) problems.push(`time_end="${row.time_end}"`);

  if (problems.length > 0) {
    console.log(`[${entityLabel}] ${id}: ${problems.join('; ')}`);
    return true;
  }
  return false;
}

async function main() {
  assertRequiredConfig();
  await connectMongo();

  console.log('Аудит канонічності date/time_* (read-only, нічого не змінює)\n');

  const shifts = await shiftRepository.findAll();
  const badShifts = shifts.filter((s) => auditRow('shift', s, s.shift_id, true)).length;

  const activities = await masterPlanRepository.findAll();
  const badActivities = activities.filter((a) => auditRow('master_plan', a, a.record_id, false)).length;

  const total = badShifts + badActivities;
  console.log(
    `\nПідсумок: ${badShifts}/${shifts.length} змін, ${badActivities}/${activities.length} активностей з неканонічним date/time.`
  );
  console.log(total === 0 ? 'Усі дати/час у канонічному форматі.' : 'Виправте вручну через UI/адмінку.');

  await disconnectMongo();
  process.exitCode = total > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('Аудит завершився помилкою:', err.message);
  process.exitCode = 2;
});
