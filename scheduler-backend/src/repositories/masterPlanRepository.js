const { config } = require('../config/env');
const GoogleSheetsRepository = require('./GoogleSheetsRepository');
const MongoRepository = require('./MongoRepository');

function createMasterPlanRepository() {
  if (config.dbDriver === 'mongo') {
    const MasterPlanModel = require('../models/MasterPlan');
    return new MongoRepository(MasterPlanModel, 'Активність плану');
  }
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
