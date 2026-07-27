const { config } = require('../config/env');
const MongoRepository = require('./MongoRepository');

function createScheduleRepository() {
  if (config.dbDriver === 'mongo') {
    const ScheduleModel = require('../models/Schedule');
    return new MongoRepository(ScheduleModel, 'Запис графіка');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується для Schedule`);
}

module.exports = createScheduleRepository();
