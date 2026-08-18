'use strict';

const { buildDayContext } = require('./rules/context');
const rulesEngine = require('./rules');
const quota = require('./rules/quota');
const { shiftShortfallFinding } = require('./rules/capacity');
const time = require('../domain/time');
const rulesConfig = require('../config/rules');
const { SERVICE_TYPES, TRIP_SERVICE_TYPE } = require('../domain/constants');
const { NotFoundError, ValidationError } = require('../utils/AppError');
const shiftRepository = require('../repositories/shiftRepository');
const userRepository = require('../repositories/userRepository');
const scheduleRepository = require('../repositories/scheduleRepository');
const { between, inList } = require('../repositories/criteria');

const MAX_REPORT_RANGE_DAYS = 31;

function userSummary(context, userId) {
  const u = context.usersById.get(userId);
  if (!u) return { user_id: userId, name: null, is_driver: null };
  return { user_id: u.user_id, name: u.name, is_driver: u.is_driver };
}

function shiftSummary(shift) {
  if (!shift) return null;
  return { shift_id: shift.shift_id, time_start: shift.time_start, time_end: shift.time_end };
}

/**
 * Dry-run перевірка кандидата на призначення - будує контекст на дату його
 * зміни й проганяє evaluate(). Використовується POST /schedule/check (завжди
 * 200) і scheduleService.assign() (Фаза 5, для реального enforcement).
 * Кидає NotFoundError, якщо зміна чи людина не існують взагалі.
 */
async function checkAssignment({ shift_id: shiftId, user_id: userId, status }) {
  // Спершу дізнаємось дату зміни без повного контексту, щоб знати, на яку дату
  // його будувати - buildDayContext(shift.date) сам знайде цю саму зміну знову
  // (вона впаде у власне вікно ±1 день), тож зайвого запиту тут немає.
  const shift = await shiftRepository.findById(shiftId);
  if (!shift) throw new NotFoundError('Зміну, вказану в shift_id,');
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Користувача, вказаного в user_id,');

  const context = await buildDayContext(shift.date);
  return rulesEngine.evaluate(context, { shift_id: shiftId, user_id: userId, status });
}

// Ті самі коди, що НІКОЛИ не продавлюються (scheduleService.js hasUnoverridable) -
// саме ЦІ конфлікти й підсвічуємо як "не можна призначити зараз", а не будь-яке
// порушення (капасіті тощо тут не при чому - той рахується на рівні всього слота,
// не конкретної людини).
const TIME_CONFLICT_CODES = ['PERSON_DOUBLE_BOOKED', 'PERSON_ON_ACTIVITY'];

/**
 * Доступність КОЖНОЇ людини для конкретної зміни - один DayContext на весь
 * список (ті самі 5 запитів buildDayContext), а не N окремих /schedule/check.
 * Використовується фронтендом, щоб підсвітити в select "Хто?" тих, кого зараз
 * не можна призначити, і одразу показати причину (яка активність/зміна в них
 * у цей час).
 */
async function getShiftAvailability(shiftId) {
  const shift = await shiftRepository.findById(shiftId);
  if (!shift) throw new NotFoundError('Зміну, вказану в shift_id,');

  const context = await buildDayContext(shift.date);

  return [...context.usersById.values()]
    .filter((user) => !user.is_external || shift.service_type === TRIP_SERVICE_TYPE)
    .map((user) => {
      const result = rulesEngine.evaluate(context, { shift_id: shiftId, user_id: user.user_id });
      const conflict = result.violations.find((v) => TIME_CONFLICT_CODES.includes(v.code));
      return {
        user_id: user.user_id,
        name: user.name,
        is_driver: user.is_driver,
        available: !conflict,
        reason: conflict ? conflict.message : null,
      };
    });
}

/**
 * getDailyTimelineForUser зі спеки: розклад однієї людини на конкретну дату,
 * відсортований за часом початку, збагачений співчерговими й активностями
 * програми того дня (без цього таймлайн ховає, наприклад, годину з ментором,
 * і людина не бачить, чому їй показало попередження про буфер).
 */
async function getTimelineForUser(userId, date) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Користувача');

  const context = await buildDayContext(date);
  const records = (context.schedulesByUserId.get(userId) || []).filter((r) => {
    const s = context.shiftsById.get(r.shift_id);
    return s && s.date === date;
  });

  const items = records
    .map((record) => {
      const shift = context.shiftsById.get(record.shift_id);
      const interval = context.intervalByShiftId.get(record.shift_id);
      const coAssignees = (context.schedulesByShiftId.get(record.shift_id) || [])
        .filter((r) => r.user_id !== userId && r.status !== 'Completed')
        .map((r) => userSummary(context, r.user_id));
      const result = rulesEngine.evaluate(context, {
        shift_id: record.shift_id,
        user_id: userId,
        status: record.status,
      });

      return {
        record_id: record.record_id,
        shift_id: record.shift_id,
        service_type: shift.service_type,
        status: record.status,
        date: shift.date,
        time_start: shift.time_start,
        time_end: shift.time_end,
        crosses_midnight: interval ? interval.crossesMidnight : null,
        start_minutes: interval ? interval.start : null,
        end_minutes: interval ? interval.end : null,
        co_assignees: coAssignees,
        warnings: result.warnings,
      };
    })
    .sort((a, b) => (a.start_minutes ?? 0) - (b.start_minutes ?? 0));

  const activities = context.activityIntervals
    .filter(({ interval }) => interval.date === date)
    .map(({ activity }) => ({
      record_id: activity.record_id,
      name_of_activity: activity.name_of_activity,
      time_start: activity.time_start,
      time_end: activity.time_end,
      workload: activity.workload,
    }));

  return {
    user: { user_id: user.user_id, name: user.name, is_driver: user.is_driver, role: user.role },
    date,
    items,
    activities,
    warnings: context.dataWarnings,
  };
}

/**
 * Знімок стану всіх служб на конкретний момент - живить сторінку моніторингу
 * (Сторінка 2 зі спеки). "Поточна" зміна служби = та, чий інтервал містить `at`;
 * "наступна" = найближча зі стартом після `at`.
 */
async function getStatus(date, at) {
  const atMinutes = time.hhmmToMinutes(at);
  if (atMinutes === null) {
    throw new ValidationError([{ field: 'at', message: 'at має бути у форматі HH:mm' }]);
  }

  const context = await buildDayContext(date);
  const atPoint = time.toInterval(date, at, time.minutesToHhmm(atMinutes + 1));
  const atAbsolute = atPoint.start;
  const dayShifts = context.shifts.filter((s) => s.date === date);

  const services = SERVICE_TYPES.map((serviceType) => {
    const typeShifts = dayShifts.filter((s) => s.service_type === serviceType);
    const current = typeShifts.find((s) => {
      const interval = context.intervalByShiftId.get(s.shift_id);
      return interval && atAbsolute >= interval.start && atAbsolute < interval.end;
    });
    const upcoming = typeShifts
      .filter((s) => {
        const interval = context.intervalByShiftId.get(s.shift_id);
        return interval && interval.start > atAbsolute;
      })
      .sort(
        (a, b) =>
          context.intervalByShiftId.get(a.shift_id).start -
          context.intervalByShiftId.get(b.shift_id).start
      )[0];

    if (!current) {
      return {
        service_type: serviceType,
        state: 'unstaffed',
        current: null,
        next: shiftSummary(upcoming),
        warnings: [],
      };
    }

    const q = quota.deriveQuota(context, current);
    const assignees = (context.schedulesByShiftId.get(current.shift_id) || []).filter(
      (r) => r.status !== 'Completed'
    );
    const count = assignees.length;

    let state = 'ok';
    if (q.max === 0) state = 'closed';
    else if (count < q.min) state = 'understaffed';
    else if (count > q.max) state = 'overstaffed';

    const shortfall = shiftShortfallFinding(context, current);
    return {
      service_type: serviceType,
      state,
      current: {
        shift_id: current.shift_id,
        time_start: current.time_start,
        time_end: current.time_end,
        count,
        assignees: assignees.map((r) => userSummary(context, r.user_id)),
        quota: { min: q.min, max: q.max, source: q.source },
      },
      next: shiftSummary(upcoming),
      warnings: shortfall ? [shortfall] : [],
    };
  });

  const activeActivities = context.activityIntervals
    .filter(({ interval }) => atAbsolute >= interval.start && atAbsolute < interval.end)
    .map(({ activity }) => ({
      name_of_activity: activity.name_of_activity,
      workload: activity.workload,
      time_start: activity.time_start,
      time_end: activity.time_end,
    }));

  const nightMode = time.intersectsWindow(atPoint, rulesConfig.nightWindow);
  let emergency = null;
  if (nightMode && rulesConfig.nightDuty.emergencyUserId) {
    const contact = context.usersById.get(rulesConfig.nightDuty.emergencyUserId);
    emergency = {
      contact: contact
        ? { user_id: contact.user_id, name: contact.name, telegram_id: contact.telegram_id }
        : null,
      key_location: rulesConfig.nightDuty.keyLocation,
    };
  }

  return {
    date,
    at,
    night_mode: nightMode,
    services,
    active_activities: activeActivities,
    emergency,
  };
}

/**
 * Хто де зараз - живить сторінку "Люди" (нова загальна головна, а не персональний
 * розклад). Для кожного користувача - його поточна зміна на момент `at` (якщо є) і
 * найближча наступна; плюс активності програми, що йдуть просто зараз, для контексту
 * "чому ця людина не на чергуванні, хоча мала б бути" (вона на активності).
 */
async function getPeopleStatus(date, at) {
  const atMinutes = time.hhmmToMinutes(at);
  if (atMinutes === null) {
    throw new ValidationError([{ field: 'at', message: 'at має бути у форматі HH:mm' }]);
  }

  const context = await buildDayContext(date);
  const atPoint = time.toInterval(date, at, time.minutesToHhmm(atMinutes + 1));
  const atAbsolute = atPoint.start;

  const people = [...context.usersById.values()]
    // Зовнішні водії - не команда Браво, тож у цьому списку їх немає взагалі
    // (models/User.js, is_external). Вони існують лише для сторінки "Водії".
    .filter((user) => !user.is_external)
    .map((user) => {
      const records = (context.schedulesByUserId.get(user.user_id) || []).filter(
        (r) => r.status !== 'Completed'
      );

      let current = null;
      let next = null;
      for (const record of records) {
        const shift = context.shiftsById.get(record.shift_id);
        const interval = context.intervalByShiftId.get(record.shift_id);
        if (!shift || shift.date !== date || !interval) continue;

        if (atAbsolute >= interval.start && atAbsolute < interval.end) {
          current = {
            record_id: record.record_id,
            shift_id: shift.shift_id,
            service_type: shift.service_type,
            time_start: shift.time_start,
            time_end: shift.time_end,
            status: record.status,
          };
        } else if (interval.start > atAbsolute) {
          const nextInterval = next ? context.intervalByShiftId.get(next.shift_id) : null;
          if (!next || interval.start < nextInterval.start) {
            next = {
              shift_id: shift.shift_id,
              service_type: shift.service_type,
              time_start: shift.time_start,
              time_end: shift.time_end,
            };
          }
        }
      }

      return {
        user_id: user.user_id,
        name: user.name,
        is_driver: user.is_driver,
        // Потрібен формі редагування людини на сторінці "Люди" - інакше вона не
        // мала б чим заповнити поле й мовчки стирала б збережений контакт.
        telegram_id: user.telegram_id,
        role: user.role,
        status: current ? 'on_duty' : 'free',
        current,
        next,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  const activeActivities = context.activityIntervals
    .filter(({ interval }) => atAbsolute >= interval.start && atAbsolute < interval.end)
    .map(({ activity }) => ({
      record_id: activity.record_id,
      name_of_activity: activity.name_of_activity,
      workload: activity.workload,
      time_start: activity.time_start,
      time_end: activity.time_end,
    }));

  return { date, at, people, active_activities: activeActivities };
}

/**
 * Живить таймлайн служби (Сторінка 2: "хто коли чергує" з треками-людьми):
 * зміни служби на дату, кожна з уже підтягнутими призначеними, + повний
 * список людей - усе одним запитом (ті самі фіксовані 4 запити buildDayContext,
 * без N+1 по кожній зміні окремо на фронтенді).
 */
async function getServiceBoard(date, serviceType) {
  const context = await buildDayContext(date);
  const dayShifts = context.shifts.filter((s) => s.date === date && s.service_type === serviceType);

  const shifts = dayShifts
    .map((shift) => {
      const assignees = (context.schedulesByShiftId.get(shift.shift_id) || [])
        .filter((r) => r.status !== 'Completed')
        .map((r) => {
          const u = context.usersById.get(r.user_id);
          return {
            record_id: r.record_id,
            user_id: r.user_id,
            name: u ? u.name : null,
            is_driver: u ? u.is_driver : null,
            status: r.status,
          };
        });
      const q = quota.deriveQuota(context, shift);
      return {
        shift_id: shift.shift_id,
        time_start: shift.time_start,
        time_end: shift.time_end,
        min_people: shift.min_people,
        max_people: shift.max_people,
        quota: { min: q.min, max: q.max, source: q.source },
        assignees,
      };
    })
    .sort((a, b) => a.time_start.localeCompare(b.time_start));

  const people = [...context.usersById.values()]
    // Як і в getWeekBoard: зовнішні водії потрапляють у список лише для поїздок.
    .filter((u) => !u.is_external || serviceType === TRIP_SERVICE_TYPE)
    .map((u) => ({
      user_id: u.user_id,
      name: u.name,
      is_driver: u.is_driver,
      is_external: u.is_external,
      role: u.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  return { date, service_type: serviceType, shifts, people };
}

function enumerateDates(dateFrom, dateTo) {
  const fromIdx = time.dayIndex(dateFrom);
  const toIdx = time.dayIndex(dateTo);
  if (fromIdx === null || toIdx === null || toIdx < fromIdx) return null;
  if (toIdx - fromIdx + 1 > MAX_REPORT_RANGE_DAYS) return null;
  const dates = [];
  for (let idx = fromIdx; idx <= toIdx; idx += 1) dates.push(time.dateStrFromDayIndex(idx));
  return dates;
}

/**
 * Тижневий грід служби (Склад/ТЕЦ): зміни за діапазон дат, згруповані по днях,
 * з уже підтягнутими призначеними. На відміну від getServiceBoard (один день,
 * повний DayContext з рушієм правил) тут навмисно НЕ будуємо DayContext - для
 * рендеру тижневого гріда з "до 3 смужок на зміну" потрібні лише сирі дані
 * (max_people зміни задає сам адмін при створенні), тому обходимось трьома
 * пласкими запитами замість buildDayContext на кожен з 7 днів.
 */
async function getWeekBoard(dateFrom, dateTo, serviceType) {
  const dates = enumerateDates(dateFrom, dateTo);
  if (!dates) {
    throw new ValidationError([
      { field: 'date_from/date_to', message: `невалідний діапазон або перевищено ліміт ${MAX_REPORT_RANGE_DAYS} днів` },
    ]);
  }

  const shifts = await shiftRepository.findAll({ date: between(dateFrom, dateTo), service_type: serviceType });
  const shiftIds = shifts.map((s) => s.shift_id);
  const schedules = shiftIds.length > 0 ? await scheduleRepository.findAll({ shift_id: inList(shiftIds) }) : [];
  const users = await userRepository.findAll();
  const usersById = new Map(users.map((u) => [u.user_id, u]));

  const schedulesByShiftId = new Map();
  for (const record of schedules) {
    if (record.status === 'Completed') continue;
    if (!schedulesByShiftId.has(record.shift_id)) schedulesByShiftId.set(record.shift_id, []);
    schedulesByShiftId.get(record.shift_id).push(record);
  }

  const shiftsByDate = new Map(dates.map((d) => [d, []]));
  for (const shift of shifts) {
    if (!shiftsByDate.has(shift.date)) continue; // теоретично неможливо (between гарантує діапазон), захист про всяк випадок
    const assignees = (schedulesByShiftId.get(shift.shift_id) || []).map((r) => {
      const u = usersById.get(r.user_id);
      return {
        record_id: r.record_id,
        user_id: r.user_id,
        name: u ? u.name : null,
        is_driver: u ? u.is_driver : null,
      };
    });
    shiftsByDate.get(shift.date).push({
      shift_id: shift.shift_id,
      time_start: shift.time_start,
      time_end: shift.time_end,
      min_people: shift.min_people,
      max_people: shift.max_people,
      lane: shift.lane,
      // Потрібні сторінці "Водії" (кілометраж і куди виїзд). Тижневий борд -
      // єдине джерело даних для неї, тож поля мають доїхати саме тут.
      distance_km: shift.distance_km,
      note: shift.note,
      assignees,
    });
  }
  for (const list of shiftsByDate.values()) list.sort((a, b) => a.time_start.localeCompare(b.time_start));

  // Зовнішні водії потрапляють у список ЛИШЕ на борді поїздок - саме там вони
  // й потрібні. Для Складу/ТЕЦ їх немає, тож у вибір "Хто?" вони не втрапляють
  // навіть якщо фронтенд про них забуде.
  const people = users
    .filter((u) => !u.is_external || serviceType === TRIP_SERVICE_TYPE)
    .map((u) => ({
      user_id: u.user_id,
      name: u.name,
      is_driver: u.is_driver,
      is_external: u.is_external,
      role: u.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  return {
    date_from: dateFrom,
    date_to: dateTo,
    service_type: serviceType,
    days: dates.map((date) => ({ date, shifts: shiftsByDate.get(date) })),
    people,
  };
}

/**
 * Календар чергувань однієї людини за діапазон дат (модалка на сторінці "Люди").
 * Так само пласкі запити - той самий обсяг даних, що й getWeekBoard, лише
 * відфільтрований по одному user_id замість одного service_type.
 */
async function getPersonCalendar(userId, dateFrom, dateTo) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('Користувача');

  const dates = enumerateDates(dateFrom, dateTo);
  if (!dates) {
    throw new ValidationError([
      { field: 'date_from/date_to', message: `невалідний діапазон або перевищено ліміт ${MAX_REPORT_RANGE_DAYS} днів` },
    ]);
  }

  const shifts = await shiftRepository.findAll({ date: between(dateFrom, dateTo) });
  const shiftIds = shifts.map((s) => s.shift_id);
  const schedules =
    shiftIds.length > 0 ? await scheduleRepository.findAll({ user_id: userId, shift_id: inList(shiftIds) }) : [];
  const shiftsById = new Map(shifts.map((s) => [s.shift_id, s]));

  const byDate = new Map(dates.map((d) => [d, []]));
  for (const record of schedules) {
    if (record.status === 'Completed') continue;
    const shift = shiftsById.get(record.shift_id);
    if (!shift || !byDate.has(shift.date)) continue;
    byDate.get(shift.date).push({
      record_id: record.record_id,
      shift_id: shift.shift_id,
      service_type: shift.service_type,
      time_start: shift.time_start,
      time_end: shift.time_end,
      status: record.status,
    });
  }
  for (const list of byDate.values()) list.sort((a, b) => a.time_start.localeCompare(b.time_start));

  return {
    user: { user_id: user.user_id, name: user.name, is_driver: user.is_driver, role: user.role },
    date_from: dateFrom,
    date_to: dateTo,
    days: dates.map((date) => ({ date, shifts: byDate.get(date) })),
  };
}

/**
 * Звіт для адмінки (Сторінка 3): усі порушення/попередження за діапазон дат,
 * по одному DayContext на дату - переоцінка не тягне зайвих запитів понад ті
 * ж фіксовані 4 на день.
 */
async function getConflictsReport(dateFrom, dateTo) {
  const dates = enumerateDates(dateFrom, dateTo);
  if (!dates) {
    throw new ValidationError([
      {
        field: 'date_from/date_to',
        message: `невалідний діапазон або перевищено ліміт ${MAX_REPORT_RANGE_DAYS} днів`,
      },
    ]);
  }

  const byShift = [];
  const byUserMap = new Map();
  let violationsTotal = 0;
  let warningsTotal = 0;
  let shiftsChecked = 0;
  let recordsChecked = 0;

  for (const date of dates) {
    const context = await buildDayContext(date);
    const dayReportFindings = rulesEngine.evaluateDayReport(context);
    const dayShifts = context.shifts.filter((s) => s.date === date);

    for (const shift of dayShifts) {
      shiftsChecked += 1;
      const records = (context.schedulesByShiftId.get(shift.shift_id) || []).filter(
        (r) => r.status !== 'Completed'
      );
      const shiftFindings = [];

      for (const record of records) {
        recordsChecked += 1;
        const result = rulesEngine.evaluate(context, {
          shift_id: shift.shift_id,
          user_id: record.user_id,
          status: record.status,
        });
        shiftFindings.push(...result.violations, ...result.warnings);

        if (!byUserMap.has(record.user_id)) {
          const user = context.usersById.get(record.user_id);
          byUserMap.set(record.user_id, {
            user_id: record.user_id,
            name: user ? user.name : null,
            violations: [],
            warnings: [],
          });
        }
        const userEntry = byUserMap.get(record.user_id);
        userEntry.violations.push(...result.violations);
        userEntry.warnings.push(...result.warnings);
      }

      const q = quota.deriveQuota(context, shift);
      const shiftDayFindings = dayReportFindings.filter(
        (f) => f.context && f.context.shift_id === shift.shift_id
      );
      const allShiftFindings = [...shiftFindings, ...shiftDayFindings];

      violationsTotal += allShiftFindings.filter((f) => f.severity === 'violation').length;
      warningsTotal += allShiftFindings.filter((f) => f.severity === 'warning').length;

      byShift.push({
        shift_id: shift.shift_id,
        service_type: shift.service_type,
        date: shift.date,
        time_start: shift.time_start,
        time_end: shift.time_end,
        count: records.length,
        quota: { min: q.min, max: q.max, source: q.source },
        violations: allShiftFindings.filter((f) => f.severity === 'violation'),
        warnings: allShiftFindings.filter((f) => f.severity === 'warning'),
      });
    }
  }

  return {
    range: { from: dateFrom, to: dateTo },
    summary: {
      violations: violationsTotal,
      warnings: warningsTotal,
      shifts_checked: shiftsChecked,
      records_checked: recordsChecked,
    },
    by_shift: byShift,
    by_user: [...byUserMap.values()],
  };
}

module.exports = {
  checkAssignment,
  getTimelineForUser,
  getStatus,
  getPeopleStatus,
  getServiceBoard,
  getWeekBoard,
  getPersonCalendar,
  getConflictsReport,
  getShiftAvailability,
};
