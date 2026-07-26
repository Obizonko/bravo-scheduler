const scheduleRepository = require('../repositories/scheduleRepository');
const shiftRepository = require('../repositories/shiftRepository');
const userRepository = require('../repositories/userRepository');
const { NotFoundError, ConflictError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Сервіс графіка чергувань (Schedule).
 * Звʼязує Users та Shifts, тому додатково перевіряє
 * посилальну цілісність (referential integrity) і місткість зміни (max_people).
 */
class ScheduleService {
  constructor(repository, shiftRepo, userRepo) {
    this.repository = repository;
    this.shiftRepo = shiftRepo;
    this.userRepo = userRepo;
  }

  async getAll(filter) {
    return this.repository.findAll(filter);
  }

  async getById(id) {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError('Запис графіка');
    return record;
  }

  async assign(data) {
    const shift = await this.shiftRepo.findById(data.shift_id);
    if (!shift) throw new NotFoundError('Зміну, вказану в shift_id,');

    const user = await this.userRepo.findById(data.user_id);
    if (!user) throw new NotFoundError('Користувача, вказаного в user_id,');

    if (shift.max_people) {
      const currentAssignments = await this.repository.findAll({ shift_id: data.shift_id });
      const activeCount = currentAssignments.filter((r) => r.status !== 'Completed').length;
      if (activeCount >= Number(shift.max_people)) {
        throw new ConflictError('Досягнуто максимальної кількості працівників для цієї зміни');
      }
    }

    const record = await this.repository.create({ ...data, status: data.status || 'Assigned' });
    logger.info('Співробітника призначено на зміну', {
      record_id: record.record_id,
      shift_id: data.shift_id,
      user_id: data.user_id,
    });
    return record;
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

module.exports = new ScheduleService(scheduleRepository, shiftRepository, userRepository);
