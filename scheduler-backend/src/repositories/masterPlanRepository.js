const { config } = require('../config/env');
const MongoRepository = require('./MongoRepository');

function createMasterPlanRepository() {
  if (config.dbDriver === 'mongo') {
    const MasterPlanModel = require('../models/MasterPlan');
    return new MongoRepository(MasterPlanModel, 'Активність плану');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується для Master_plan`);
}

module.exports = createMasterPlanRepository();
