const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const { config } = require('../config/env');

/**
 * Репозиторій користувачів.
 * Обраний драйвер визначається config.dbDriver - на цьому етапі
 * реалізовано лише google_sheets, але тут легко додати гілку
 * для postgres/mongo, повернувши інший клас з тим самим інтерфейсом.
 */
function createUserRepository() {
  if (config.dbDriver === 'google_sheets') {
    return new GoogleSheetsRepository(config.googleSheets.sheets.users, 'user_id', 'Користувача');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" ще не підтримується для Users`);
}

module.exports = createUserRepository();
