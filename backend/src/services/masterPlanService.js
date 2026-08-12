const masterPlanRepository = require('../repositories/masterPlanRepository');
const { NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

class MasterPlanService {
  constructor(repository) {
    this.repository = repository;
  }

  async getAll(filter = {}) {
    return this.repository.findAll(filter);
  }

  async getById(id) {
    const record = await this.repository.findById(id);
    if (!record) throw new NotFoundError('Активність плану');
    return record;
  }

  async create(data) {
    const record = await this.repository.create(data);
    logger.info('Створено нову активність плану', { record_id: record.record_id });
    return record;
  }

  async update(id, data) {
    await this.getById(id);
    const updated = await this.repository.update(id, data);
    logger.info('Оновлено активність плану', { record_id: id });
    return updated;
  }

  async remove(id) {
    await this.getById(id);
    await this.repository.delete(id);
    logger.info('Видалено активність плану', { record_id: id });
    return true;
  }
}

module.exports = new MasterPlanService(masterPlanRepository);
