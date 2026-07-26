const userRepository = require('../repositories/userRepository');
const { NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

class UserService {
  constructor(repository) {
    this.repository = repository;
  }

  async getAll() {
    return this.repository.findAll();
  }

  async getById(id) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundError('Користувача');
    return user;
  }

  async create(data) {
    const user = await this.repository.create(data);
    logger.info('Створено нового користувача', { user_id: user.user_id });
    return user;
  }

  async update(id, data) {
    await this.getById(id); // перевірка існування, кине NotFoundError
    const updated = await this.repository.update(id, data);
    logger.info('Оновлено користувача', { user_id: id });
    return updated;
  }

  async remove(id) {
    await this.getById(id);
    await this.repository.delete(id);
    logger.info('Видалено користувача', { user_id: id });
    return true;
  }
}

module.exports = new UserService(userRepository);
