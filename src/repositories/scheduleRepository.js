const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const { config } = require('../config/env');

function createScheduleRepository() {
  if (config.dbDriver === 'google_sheets') {
    return new GoogleSheetsRepository(
      config.googleSheets.sheets.schedule,
      'record_id',
      'Запис графіка'
    );
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" ще не підтримується для Schedule`);
}

module.exports = createScheduleRepository();
