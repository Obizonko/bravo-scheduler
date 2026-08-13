'use strict';

const time = require('../../domain/time');
const { finding } = require('./codes');
const { inList } = require('../../repositories/criteria');
const shiftRepository = require('../../repositories/shiftRepository');
const scheduleRepository = require('../../repositories/scheduleRepository');
const userRepository = require('../../repositories/userRepository');
const masterPlanRepository = require('../../repositories/masterPlanRepository');
const activityAssignmentRepository = require('../../repositories/activityAssignmentRepository');

/**
 * @typedef {Object} DayContext
 * @property {string} date - 'YYYY-MM-DD', якір контексту
 * @property {string[]} windowDates - [date-1, date, date+1]
 * @property {object[]} shifts - зміни за windowDates (сирі, з репозиторію)
 * @property {object[]} schedules - записи графіка для цих змін
 * @property {object[]} activities - усі активності Master Plan, передані на вхід
 * @property {object[]} activityAssignments - усі записи участі (хто на якій активності), передані на вхід
 * @property {Map<string,object>} usersById
 * @property {Map<string,object>} shiftsById
 * @property {Map<string,object[]>} schedulesByShiftId
 * @property {Map<string,object[]>} schedulesByUserId
 * @property {Map<string,object[]>} activityAssignmentsByUserId
 * @property {Map<string,{start:number,end:number,crossesMidnight:boolean,date:string}|null>} intervalByShiftId
 * @property {{activity:object, interval:object}[]} activityIntervals - активності, матеріалізовані на конкретні дати windowDates (is_daily - на кожну дату; дата-прив'язані - лише якщо їхня date входить у windowDates)
 * @property {object[]} dataWarnings - DATA_TIME_UNPARSEABLE / DATA_MASTERPLAN_NO_DATE, зібрані під час індексації
 */

/**
 * Чисто (без БД) перетворює сирі масиви на DayContext із Map-індексами,
 * побудованими один раз. Викликається і продакшен-завантажувачем
 * (buildDayContext, Фаза 4, ходить у репозиторії), і тестовими фікстурами
 * (test/fixtures/context.js) - обидва мають працювати з тотожною формою даних,
 * інакше тести рушія правил перевіряють не те, що реально виконується в проді.
 *
 * @param {{date:string, shifts?:object[], schedules?:object[], users?:object[], activities?:object[], activityAssignments?:object[]}} raw
 * @returns {DayContext}
 */
function indexContext(raw) {
  const { date, shifts = [], schedules = [], users = [], activities = [], activityAssignments = [] } = raw;
  const dataWarnings = [];

  const windowDates = [time.addDays(date, -1), date, time.addDays(date, 1)].filter(
    (d) => d !== null
  );

  const usersById = new Map(users.map((u) => [u.user_id, u]));
  const shiftsById = new Map(shifts.map((s) => [s.shift_id, s]));

  const schedulesByShiftId = new Map();
  const schedulesByUserId = new Map();
  for (const record of schedules) {
    if (!schedulesByShiftId.has(record.shift_id)) schedulesByShiftId.set(record.shift_id, []);
    schedulesByShiftId.get(record.shift_id).push(record);
    if (!schedulesByUserId.has(record.user_id)) schedulesByUserId.set(record.user_id, []);
    schedulesByUserId.get(record.user_id).push(record);
  }

  const intervalByShiftId = new Map();
  for (const shift of shifts) {
    const interval = time.toIntervalLoose(shift.date, shift.time_start, shift.time_end);
    if (!interval) {
      dataWarnings.push(finding('DATA_TIME_UNPARSEABLE', { entity: `shift:${shift.shift_id}` }));
    }
    intervalByShiftId.set(shift.shift_id, interval);
  }

  // Матеріалізація активностей на дати вікна: is_daily - на кожну дату вікна;
  // дата-прив'язані - лише якщо їхня власна date входить у вікно; ті, що не мають
  // ні дати, ні is_daily, дають DATA_MASTERPLAN_NO_DATE і в часову математику не йдуть.
  const activityIntervals = [];
  for (const activity of activities) {
    if (activity.is_daily) {
      for (const d of windowDates) {
        const interval = time.toIntervalLoose(d, activity.time_start, activity.time_end);
        if (interval) activityIntervals.push({ activity, interval });
      }
    } else if (activity.date) {
      if (!windowDates.includes(activity.date)) continue;
      const interval = time.toIntervalLoose(activity.date, activity.time_start, activity.time_end);
      if (interval) {
        activityIntervals.push({ activity, interval });
      } else {
        dataWarnings.push(
          finding('DATA_TIME_UNPARSEABLE', { entity: `masterplan:${activity.record_id}` })
        );
      }
    } else {
      dataWarnings.push(
        finding('DATA_MASTERPLAN_NO_DATE', {
          name_of_activity: activity.name_of_activity,
          record_id: activity.record_id,
        })
      );
    }
  }

  const activityAssignmentsByUserId = new Map();
  for (const record of activityAssignments) {
    if (!activityAssignmentsByUserId.has(record.user_id)) activityAssignmentsByUserId.set(record.user_id, []);
    activityAssignmentsByUserId.get(record.user_id).push(record);
  }

  return {
    date,
    windowDates,
    shifts,
    schedules,
    activities,
    activityAssignments,
    usersById,
    shiftsById,
    schedulesByShiftId,
    schedulesByUserId,
    activityAssignmentsByUserId,
    intervalByShiftId,
    activityIntervals,
    dataWarnings,
  };
}

/**
 * Продакшен-завантажувач DayContext. Рівно 5 запитів незалежно від обсягу даних -
 * саме це і захищає від N+1: одні зміни за вікно ±1 день, одні записи графіка для
 * цих змін, усі користувачі, усі активності Master Plan, усі записи участі в
 * активностях (для перевірки конфлікту активність↔чергування, rules/activityConflict.js).
 * Побудова Map-індексів (indexContext) далі повністю синхронна й pure.
 *
 * @param {string} date - 'YYYY-MM-DD', якір контексту
 * @returns {Promise<DayContext>}
 */
async function buildDayContext(date) {
  const windowDates = [time.addDays(date, -1), date, time.addDays(date, 1)].filter(
    (d) => d !== null
  );

  const shifts = await shiftRepository.findAll({ date: inList(windowDates) });
  const shiftIds = shifts.map((s) => s.shift_id);
  const schedules =
    shiftIds.length > 0 ? await scheduleRepository.findAll({ shift_id: inList(shiftIds) }) : [];
  const users = await userRepository.findAll();
  const activities = await masterPlanRepository.findAll();
  const activityAssignments = await activityAssignmentRepository.findAll();

  return indexContext({ date, shifts, schedules, users, activities, activityAssignments });
}

module.exports = { indexContext, buildDayContext };
