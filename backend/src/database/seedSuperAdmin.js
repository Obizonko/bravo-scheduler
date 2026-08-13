const User = require('../models/User');
const { config } = require('../config/env');
const logger = require('../utils/logger');

/**
 * Гарантує, що в БД існує рівно один запис із role:'super_admin' - "Назар
 * Уляк", з персональним PIN = SUPER_ADMIN_PIN. Ідемпотентний, викликається
 * при кожному старті сервера (server.js), але нічого не робить, якщо
 * супер-адмін уже є.
 *
 * Якщо серед людей уже існує "Назар" (реальний учасник табору = сама ж
 * людина, що є супер-адміном) - підвищуємо ЦЕЙ САМИЙ запис замість створення
 * дубля, щоб історичні призначення (зміни/активності) лишились привʼязані
 * до того самого user_id.
 */
async function seedSuperAdmin() {
  if (!config.superAdmin.pin) return; // нема що сіяти без PIN

  const alreadySuperAdmin = await User.findOne({ role: 'super_admin' });
  if (alreadySuperAdmin) return;

  const existingNazar = await User.findOne({ name: { $in: ['Назар', 'Назар Уляк'] } });
  if (existingNazar) {
    existingNazar.name = 'Назар Уляк';
    existingNazar.role = 'super_admin';
    existingNazar.pin = config.superAdmin.pin;
    await existingNazar.save();
    logger.info('Підвищено існуючого користувача "Назар" до супер-адміна "Назар Уляк"', {
      user_id: existingNazar._id.toString(),
    });
    return;
  }

  const created = await User.create({ name: 'Назар Уляк', role: 'super_admin', pin: config.superAdmin.pin });
  logger.info('Створено обліковий запис супер-адміна "Назар Уляк"', { user_id: created._id.toString() });
}

module.exports = seedSuperAdmin;
