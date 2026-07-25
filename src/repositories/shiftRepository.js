const { config } = require('../config/env');
const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const MongoRepository = require('./MongoRepository');

function createShiftRepository() {
  if (config.dbDriver === 'mongo') {
    const ShiftModel = require('../models/Shift');
    return new MongoRepository(ShiftModel, 'Зміну');
  }
  if (config.dbDriver === 'google_sheets') {
    return new GoogleSheetsRepository(config.googleSheets.sheets.shifts, 'shift_id', 'Зміну');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" ще не підтримується для Shifts`);
}

module.exports = createShiftRepository();
