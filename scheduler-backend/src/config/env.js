require('dotenv').config();

/*Централізована конфігурація застосунку.*/

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  dbDriver: process.env.DB_DRIVER || 'mongo',

  mongo: {
    uri: process.env.MONGO_URI,
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
};

function assertRequiredConfig() {
  if (config.dbDriver === 'mongo') {
    if (!config.mongo.uri) {
      throw new Error('Відсутня обовʼязкова змінна середовища для MongoDB: MONGO_URI');
    }
    return;
  }

  throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується`);
}

module.exports = { config, assertRequiredConfig };
