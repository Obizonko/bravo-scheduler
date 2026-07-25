/**
 * Модель User (аркуш Users).
 * У JS це не ORM-клас, а опис форми сутності - для документації
 * та як орієнтир при валідації/мапінгу даних.
 *
 * @typedef {Object} User
 * @property {string} user_id - Унікальний ідентифікатор користувача
 * @property {string} name - Ім'я та прізвище
 * @property {boolean} is_driver - Ознака водія
 * @property {string} telegram_id - Telegram ID (для інтеграції з ботом)
 */
module.exports = {};
