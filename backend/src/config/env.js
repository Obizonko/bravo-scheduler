require('dotenv').config();

/**
 * Централізована конфігурація застосунку.
 * Всі змінні середовища читаються тільки тут - решта коду
 * імпортує вже готовий обʼєкт config.
 */
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

  rules: {
    // 'off' - рушій рахує правила, але нічого не блокує і не логує попереджень
    // 'warn' - порушення повертаються в відповіді й логуються, але не блокують запис (дефолт для безпечного викочування)
    // 'block' - жорсткі порушення (violations) відхиляють запис 409-кою
    enforcement: process.env.RULES_ENFORCEMENT || 'warn',
  },

  nightDuty: {
    emergencyUserId: process.env.NIGHT_EMERGENCY_USER_ID || null,
    keyLocation: process.env.NIGHT_KEY_LOCATION || null,
  },

  admin: {
    // Голова команди: може призначати людей на зміни, редагувати зміни/Master Plan/користувачів
    pin: process.env.ADMIN_PIN || null,
  },

  superAdmin: {
    // Власник системи: усе, що може admin, + призначає/знімає адмінів (role: 'member'<->'lead').
    // Навмисно окремий секрет, а не окрема роль у БД - "супер-адмін" це той, хто знає цей PIN,
    // а не конкретний запис у колекції users.
    pin: process.env.SUPER_ADMIN_PIN || null,
  },

  notifications: {
    // Порожньо за замовчуванням - надсилання сповіщень від чужого імені має бути
    // явним, свідомим opt-in, а не типовою поведінкою (notificationService.js).
    webhookUrl: process.env.NOTIFICATIONS_WEBHOOK_URL || null,
  },
};

const ALLOWED_ENFORCEMENT = ['off', 'warn', 'block'];

function assertRequiredConfig() {
  if (config.dbDriver === 'mongo') {
    if (!config.mongo.uri) {
      throw new Error('Відсутня обовʼязкова змінна середовища для MongoDB: MONGO_URI');
    }
  } else {
    throw new Error(`Драйвер БД "${config.dbDriver}" не підтримується`);
  }

  if (!ALLOWED_ENFORCEMENT.includes(config.rules.enforcement)) {
    throw new Error(
      `Невідоме значення RULES_ENFORCEMENT: "${config.rules.enforcement}". Дозволено: ${ALLOWED_ENFORCEMENT.join(', ')}`
    );
  }
}

module.exports = { config, assertRequiredConfig };
