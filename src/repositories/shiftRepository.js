const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const { config } = require('../config/env');

function createShiftRepository() {
  if (config.dbDriver === 'google_sheets') {
    return new GoogleSheetsRepository(config.googleSheets.sheets.shifts, 'shift_id', 'Зміну');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" ще не підтримується для Shifts`);
}

module.exports = createShiftRepository();
