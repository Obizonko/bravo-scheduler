const { config } = require('../config/env');
const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const MongoRepository = require('./MongoRepository');

/**
 * Репозиторій користувачів.
 * Обраний драйвер визначається config.dbDriver (.env: DB_DRIVER).
 * Services/controllers працюють лише з інтерфейсом BaseRepository
 * і не залежать від того, яка гілка тут спрацює.
 */
function createUserRepository() {
  if (config.dbDriver === 'mongo') {
    const UserModel = require('../models/User');
    return new MongoRepository(UserModel, 'Користувача');
  }
  if (config.dbDriver === 'google_sheets') {
    return new GoogleSheetsRepository(config.googleSheets.sheets.users, 'user_id', 'Користувача');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" ще не підтримується для Users`);
}

module.exports = createUserRepository();
