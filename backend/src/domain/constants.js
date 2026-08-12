/**
 * Єдине джерело істини для контрольованих словників, що використовуються
 * і в моделях (Mongoose), і у валідаторах (Joi), і в рушії правил.
 * Раніше SERVICE_TYPES/STATUSES були продубльовані в моделі + валідаторі
 * кожної сутності — тепер обидва місця імпортують звідси.
 */

const SERVICE_TYPES = ['Склад', 'ТЕЦ', 'Поїздка', 'Зовнішня активність'];

const STATUSES = ['Assigned', 'Replacement', 'NeedsReplacement', 'Completed'];

const ROLES = ['member', 'lead'];

/**
 * Контрольований словник навантаження активностей Master Plan.
 * Керує виведенням квоти (rules/quota.js):
 *   peak      - пікові години, квота на максимум
 *   normal    - типове навантаження, квота стандартна
 *   quiet     - тиха година, квота на мінімум
 *   all_hands - всі задіяні (ментор-година, Вечір Пам'яті, квест, симуляція) -
 *               квота 1, або 1+1 якщо серед призначених є водій
 *   off_hours - нічний час, поза робочими годинами
 */
const WORKLOAD_LEVELS = ['peak', 'normal', 'quiet', 'all_hands', 'off_hours'];

module.exports = { SERVICE_TYPES, STATUSES, ROLES, WORKLOAD_LEVELS };
