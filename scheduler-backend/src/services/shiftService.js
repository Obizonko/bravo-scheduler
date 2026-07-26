const shiftRepository = require('../repositories/shiftRepository');
const { NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

class ShiftService {
  constructor(repository) {
    this.repository = repository;
  }

  async getAll(filter) {
    return this.repository.findAll(filter);
  }

  async getById(id) {
    const shift = await this.repository.findById(id);
    if (!shift) throw new NotFoundError('Зміну');
    return shift;
  }

  async create(data) {
    const shift = await this.repository.create(data);
    logger.info('Створено нову зміну', { shift_id: shift.shift_id });
    return shift;
  }

  async update(id, data) {
    await this.getById(id);
    const updated = await this.repository.update(id, data);
    logger.info('Оновлено зміну', { shift_id: id });
    return updated;
  }

  async remove(id) {
    await this.getById(id);
    await this.repository.delete(id);
    logger.info('Видалено зміну', { shift_id: id });
    return true;
  }
}

module.exports = new ShiftService(shiftRepository);
