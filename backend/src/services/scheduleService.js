const scheduleRepository = require('../repositories/scheduleRepository');
const shiftRepository = require('../repositories/shiftRepository');
const rulesEngineService = require('./rulesEngineService');
const notificationService = require('./notificationService');
const rulesConfig = require('../config/rules');
const { NotFoundError, RuleViolationError } = require('../utils/AppError');
const logger = require('../utils/logger');

const OPEN_FOR_SUBSTITUTION_STATUS = 'NeedsReplacement';

/**
 * Сервіс графіка чергувань (Schedule).
 * Звʼязує Users та Shifts, тому додатково перевіряє посилальну цілісність і
 * прогонить кандидата через рушій правил (rulesEngineService) перед записом -
 * той сам кине NotFoundError, якщо shift_id/user_id не існують, і сам порахує
 * місткість/перетини/буфери/водіїв (стара окрема перевірка max_people тут
 * видалена - її повністю поглинув rules/capacity.js, який на відміну від
 * старого коду коректно обробляє max_people === 0 як "зміна закрита").
 */
class ScheduleService {
  constructor(repository) {
    this.repository = repository;
  }

  async getAll(filter) {
    return this.repository.findAll(filter);
  }

  async getById(id) {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError('Запис графіка');
    return record;
  }

  /**
   * @param {{shift_id:string, user_id:string, status?:string}} data
   * @param {{force?:boolean}} [options] - force=true дозволяє продавити порушення,
   *   навіть коли RULES_ENFORCEMENT=block. Призначено лише для lead із дійсним PIN
   *   (гейт на рівні маршруту, Фаза 6) - сам сервіс форс не авторизує.
   *   PERSON_DOUBLE_BOOKED не продавлюється НІКОЛИ, незалежно від force.
   */
  async assign(data, { force = false } = {}) {
    const result = await rulesEngineService.checkAssignment(data);

    const hasUnoverridable = result.violations.some((v) => v.code === 'PERSON_DOUBLE_BOOKED');
    const blocking = rulesConfig.enforcement === 'block' && (!force || hasUnoverridable);

    if (blocking && !result.ok) {
      throw new RuleViolationError(result);
    }
    if (!result.ok) {
      logger.warn('Правила рушія порушено при призначенні', {
        shift_id: data.shift_id,
        user_id: data.user_id,
        violation_codes: result.violations.map((v) => v.code),
        forced: force && !hasUnoverridable,
        enforcement: rulesConfig.enforcement,
      });
    }

    const record = await this.repository.create({ ...data, status: data.status || 'Assigned' });
    logger.info('Співробітника призначено на зміну', {
      record_id: record.record_id,
      shift_id: data.shift_id,
      user_id: data.user_id,
      warning_codes: result.warnings.map((w) => w.code),
    });
    return { record, warnings: result.warnings, violations: result.violations };
  }

  /**
   * triggerSubstitution зі спеки: маркує зміну як вільну для перехоплення й
   * (за наявності налаштованого webhook) сповіщає інших бравістів. Ідемпотентний -
   * повторний виклик на вже відкритому записі повертає 200 з тим самим станом,
   * а не 409, бо "ще раз попросити заміну" не є помилкою.
   */
  async triggerSubstitution(id, reason) {
    const record = await this.getById(id);
    const alreadyOpen = record.status === OPEN_FOR_SUBSTITUTION_STATUS;
    const updated = alreadyOpen
      ? record
      : await this.repository.update(id, { status: OPEN_FOR_SUBSTITUTION_STATUS });

    if (!alreadyOpen) {
      logger.info('Зміну позначено як таку, що потребує заміни', { record_id: id, reason });
    }

    const shift = await shiftRepository.findById(updated.shift_id);
    const notification = await notificationService.notifySubstitution({ record: updated, shift, reason });
    return { record: updated, notification };
  }

  async updateStatus(id, status) {
    await this.getById(id);
    const updated = await this.repository.update(id, { status });
    logger.info('Оновлено статус запису графіка', { record_id: id, status });
    return updated;
  }

  async remove(id) {
    await this.getById(id);
    await this.repository.delete(id);
    logger.info('Видалено запис графіка', { record_id: id });
    return true;
  }
}

module.exports = new ScheduleService(scheduleRepository);
