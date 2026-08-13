const activityAssignmentRepository = require('../repositories/activityAssignmentRepository');
const userRepository = require('../repositories/userRepository');
const masterPlanRepository = require('../repositories/masterPlanRepository');
const scheduleRepository = require('../repositories/scheduleRepository');
const shiftRepository = require('../repositories/shiftRepository');
const time = require('../domain/time');
const { NotFoundError, ConflictError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Участь людини в активності Master Plan (вкладка "Активності" на сторінці людини).
 * Проста участь без життєвого циклу - на відміну від Schedule немає статусів.
 */
class ActivityAssignmentService {
  async getAll(filter) {
    return activityAssignmentRepository.findAll(filter);
  }

  /**
   * Дзеркальна перевірка до rules/activityConflict.js (той бік блокує призначення
   * на ЗМІНУ, коли людина вже на активності) - тут навпаки: не дати додати
   * людину в активність, якщо вона в цей час уже на чергуванні. is_daily
   * активність перевіряється на КОЖНУ дату, де в людини є зміна (той самий
   * час доби щодня), а не лише на одну конкретну дату.
   */
  async _assertNoShiftConflict(userId, activity) {
    const mySchedules = await scheduleRepository.findAll({ user_id: userId });
    const activeSchedules = mySchedules.filter((s) => s.status !== 'Completed');
    if (activeSchedules.length === 0) return;

    // shiftRepository.findAll фільтрує за РЕАЛЬНИМИ полями Mongo-схеми, а
    // "shift_id" - лише псевдонім _id, який toJSON.transform синтезує на
    // виході (не існує в самому документі) - тому масовий findAll({shift_id:
    // inList(...)}) мовчки повернув би 0 записів. findById напряму працює
    // з _id і коректно обробляє це псевдо-поле.
    const shiftIds = activeSchedules.map((s) => s.shift_id);
    const shifts = (await Promise.all(shiftIds.map((id) => shiftRepository.findById(id)))).filter(Boolean);

    for (const shift of shifts) {
      if (!activity.is_daily && shift.date !== activity.date) continue;
      const shiftInterval = time.toIntervalLoose(shift.date, shift.time_start, shift.time_end);
      const activityInterval = time.toIntervalLoose(shift.date, activity.time_start, activity.time_end);
      if (shiftInterval && activityInterval && time.overlaps(shiftInterval, activityInterval)) {
        throw new ConflictError(
          `Людина вже на зміні "${shift.service_type}" (${shift.date} ${shift.time_start}–${shift.time_end}) у цей час`,
          { shift_id: shift.shift_id, date: shift.date }
        );
      }
    }
  }

  async create(data) {
    const user = await userRepository.findById(data.user_id);
    if (!user) throw new NotFoundError('Користувача, вказаного в user_id,');
    const activity = await masterPlanRepository.findById(data.master_plan_id);
    if (!activity) throw new NotFoundError('Активність, вказану в master_plan_id,');

    await this._assertNoShiftConflict(data.user_id, activity);

    const record = await activityAssignmentRepository.create(data);
    logger.info('Людину призначено на активність', {
      assignment_id: record.assignment_id,
      user_id: data.user_id,
      master_plan_id: data.master_plan_id,
    });
    return record;
  }

  async remove(id) {
    const record = await activityAssignmentRepository.findById(id);
    if (!record) throw new NotFoundError('Призначення на активність');
    await activityAssignmentRepository.delete(id);
    logger.info('Знято призначення на активність', { assignment_id: id });
    return true;
  }
}

module.exports = new ActivityAssignmentService();
