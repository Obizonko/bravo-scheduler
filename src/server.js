const app = require('./app');
const { config, assertRequiredConfig } = require('./config/env');
const logger = require('./utils/logger');

try {
  assertRequiredConfig();
} catch (err) {
  logger.error(`Помилка конфігурації: ${err.message}`);
  process.exit(1);
}

const server = app.listen(config.port, () => {
  logger.info(`Сервер запущено в режимі "${config.env}" на порту ${config.port}`);
  logger.info(`API доступне за адресою: http://localhost:${config.port}${config.apiPrefix}`);
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

module.exports = server;
