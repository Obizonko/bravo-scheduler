'use strict';

const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Сповіщення про звільнений слот (triggerSubstitution зі спеки): "Слот на
 * Склад (14:00-15:30) звільнився. Хто може підстрахувати?".
 *
 * Навмисно вимкнено за замовчуванням: надсилання повідомлень від чужого імені
 * (у чат/бот) має бути явною, свідомою конфігурацією (NOTIFICATIONS_WEBHOOK_URL),
 * а не типовою поведінкою застосунку. Без налаштованого webhook сповіщення
 * лише логується - це чесна заглушка, а не мовчазний no-op.
 */
async function notifySubstitution({ record, shift, reason }) {
  const message =
    `Звільнився слот на ${shift.service_type} (${shift.time_start}–${shift.time_end})` +
    `${reason ? ` (${reason})` : ''}. Хто може підстрахувати?`;

  if (!config.notifications.webhookUrl) {
    logger.info('Сповіщення про заміну НЕ надіслано - webhook не налаштовано (NOTIFICATIONS_WEBHOOK_URL)', {
      record_id: record.record_id,
      shift_id: record.shift_id,
      message,
    });
    return { channel: 'telegram', sent: false, reason: 'webhook_not_configured', message };
  }

  // Реальна відправка через вебхук (Telegram-бот тощо) - окреме рішення про формат
  // payload/аутентифікацію бота, свідомо поза обсягом цієї ітерації.
  logger.info('Webhook сповіщень налаштовано, але відправка ще не реалізована', {
    record_id: record.record_id,
    shift_id: record.shift_id,
    message,
  });
  return { channel: 'telegram', sent: false, reason: 'not_implemented', message };
}

module.exports = { notifySubstitution };
