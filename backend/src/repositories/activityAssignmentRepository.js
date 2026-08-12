const { config } = require('../config/env');
const MongoRepository = require('./MongoRepository');

function createActivityAssignmentRepository() {
  if (config.dbDriver === 'mongo') {
    const ActivityAssignmentModel = require('../models/ActivityAssignment');
    return new MongoRepository(ActivityAssignmentModel, 'Призначення на активність');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується для ActivityAssignment`);
}

module.exports = createActivityAssignmentRepository();
