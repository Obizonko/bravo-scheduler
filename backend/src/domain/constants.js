/**
 * Єдине джерело істини для контрольованих словників, що використовуються
 * і в моделях (Mongoose), і у валідаторах (Joi), і в рушії правил.
 * Раніше SERVICE_TYPES/STATUSES були продубльовані в моделі + валідаторі
 * кожної сутності — тепер обидва місця імпортують звідси.
 */

const SERVICE_TYPES = ['Склад', 'ТЕЦ', 'Поїздка', 'Зовнішня активність'];

const STATUSES = ['Assigned', 'Replacement', 'NeedsReplacement', 'Completed'];

// 'super_admin' раніше існував лише як env-PIN без запису в users - тепер це
// звичайна роль (для персонального PIN + ідентичності в аудит-логу), але API
// (userValidator) свідомо не дозволяє її встановлювати через PUT /users/:id -
// призначається лише через seed (див. database/seedSuperAdmin.js).
const ROLES = ['member', 'lead', 'super_admin'];

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
