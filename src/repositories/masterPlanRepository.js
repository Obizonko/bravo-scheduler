const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const { config } = require('../config/env');

function createMasterPlanRepository() {
  if (config.dbDriver === 'google_sheets') {
    return new GoogleSheetsRepository(
      config.googleSheets.sheets.masterPlan,
      'record_id',
      'Активність плану'
    );
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" ще не підтримується для Master_plan`);
}

module.exports = createMasterPlanRepository();
