const { config } = require('../config/env');
const MongoRepository = require('./MongoRepository');

/**
 * Репозиторій користувачів.
 * Реалізовано поверх MongoDB (Mongoose), але services/controllers
 * залежать лише від інтерфейсу BaseRepository - тому в майбутньому
 * можна додати іншу СУБД, просто повернувши інший клас з тим самим контрактом.
 */
function createUserRepository() {
  if (config.dbDriver === 'mongo') {
    const UserModel = require('../models/User');
    return new MongoRepository(UserModel, 'Користувача');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується для Users`);
}

module.exports = createUserRepository();
