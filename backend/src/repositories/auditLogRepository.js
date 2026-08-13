const { config } = require('../config/env');
const MongoRepository = require('./MongoRepository');

function createAuditLogRepository() {
  if (config.dbDriver === 'mongo') {
    const AuditLogModel = require('../models/AuditLog');
    return new MongoRepository(AuditLogModel, 'Запис аудит-логу');
  }
  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується для AuditLog`);
}

module.exports = createAuditLogRepository();
