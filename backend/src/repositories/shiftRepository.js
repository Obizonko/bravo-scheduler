const { config } = require('../config/env');
const MongoRepository = require('./MongoRepository');

function createShiftRepository() {
  if (config.dbDriver === 'mongo') {
    const ShiftModel = require('../models/Shift');
    return new MongoRepository(ShiftModel, 'Зміну');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується для Shifts`);
}

module.exports = createShiftRepository();
