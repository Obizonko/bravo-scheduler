const app = require('./app');
const { config, assertRequiredConfig } = require('./config/env');
const logger = require('./utils/logger');

async function start() {
  try {
    assertRequiredConfig();
  } catch (err) {
    logger.error(`Помилка конфігурації: ${err.message}`);
    process.exit(1);
  }

  if (config.dbDriver === 'mongo') {
    const { connectMongo } = require('./database/mongoClient');
    try {
      await connectMongo();
    } catch (err) {
      logger.error(`Не вдалося підключитися до MongoDB: ${err.message}`);
      process.exit(1);
    }
  }

  const server = app.listen(config.port, () => {
    logger.info(`Сервер запущено в режимі "${config.env}" на порту ${config.port}`);
    logger.info(`API доступне за адресою: http://localhost:${config.port}${config.apiPrefix}`);
    logger.info(`Драйвер БД: ${config.dbDriver}`);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
    server.close(() => process.exit(1));
  });

  process.on('SIGTERM', () => {
    logger.info('Отримано SIGTERM, завершення роботи сервера...');
    server.close(() => {
      logger.info('Сервер зупинено');
      process.exit(0);
    });
  });

  return server;
}

const serverPromise = start();

module.exports = serverPromise;
