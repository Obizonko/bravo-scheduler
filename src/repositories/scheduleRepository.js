const { config } = require('../config/env');
const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const MongoRepository = require('./MongoRepository');

function createScheduleRepository() {
  if (config.dbDriver === 'mongo') {
    const ScheduleModel = require('../models/Schedule');
    return new MongoRepository(ScheduleModel, 'Запис графіка');
  }
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
