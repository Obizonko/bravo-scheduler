const app = require('./app');
const { config, assertRequiredConfig } = require('./config/env');
const logger = require('./utils/logger');

/**
 * Гарантовано виводить помилку і завершує процес.
 * process.exit() одразу після асинхронного логера (Winston) на Windows
 * може "обірвати" запис до консолі/файлу раніше, ніж він встигне вивестись -
 * тому дублюємо повідомлення в console.error (синхронний вивід) і даємо
 * невелику затримку перед виходом, щоб транспорти Winston встигли дописати.
 */
function fatal(message, err) {
  // eslint-disable-next-line no-console
  console.error(`\n[FATAL] ${message}${err ? `: ${err.message}` : ''}\n`);
  logger.error(message, err ? { error: err.message, stack: err.stack } : undefined);
  setTimeout(() => process.exit(1), 200);
}

async function start() {
  try {
    assertRequiredConfig();
  } catch (err) {
    fatal('Помилка конфігурації', err);
    return;
  }

  if (config.dbDriver === 'mongo') {
    const { connectMongo } = require('./database/mongoClient');
    try {
      await connectMongo();
    } catch (err) {
      fatal('Не вдалося підключитися до MongoDB', err);
      return;
    }

    try {
      const seedSuperAdmin = require('./database/seedSuperAdmin');
      await seedSuperAdmin();
    } catch (err) {
      // Не фатально - сервер і так підніметься, просто без DB-персони супер-адміна
      // (лишається запасний легасі-шлях через SUPER_ADMIN_PIN, requireLead.js).
      logger.error('Не вдалося насіяти супер-адміна', { error: err.message });
    }
  }

  const server = app.listen(config.port, () => {
    logger.info(`Сервер запущено в режимі "${config.env}" на порту ${config.port}`);
    logger.info(`API доступне за адресою: http://localhost:${config.port}${config.apiPrefix}`);
    logger.info(`Драйвер БД: ${config.dbDriver}`);
  });

  server.on('error', (err) => {
    fatal('Помилка HTTP-сервера', err);
  });

  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    fatal('Unhandled Rejection', err);
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
