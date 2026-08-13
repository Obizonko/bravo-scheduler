'use strict';

const SEVERITY = { VIOLATION: 'violation', WARNING: 'warning' };

/**
 * Єдиний реєстр усіх кодів рушія правил: severity (жорсткий блок чи
 * попередження), група правила (для угруповання в UI) і повідомлення
 * українською, що будується з контексту знахідки. Жоден rule-модуль не formує
 * текст самостійно - завжди через finding() звідси, щоб код і текст не розходились.
 */
const REGISTRY = {
  // --- violations: жорсткий блок (фізично неможливе) ---
  PERSON_DOUBLE_BOOKED: {
    severity: SEVERITY.VIOLATION,
    rule: 'overlap',
    message: (c) => {
      const other = c.conflicting[0];
      return `Людина вже призначена на ${other.service_type} (${other.time_start}–${other.time_end}) у цей самий час`;
    },
  },
  DUPLICATE_ASSIGNMENT: {
    severity: SEVERITY.VIOLATION,
    rule: 'overlap',
    message: () => 'Людину вже призначено на цю саму зміну',
  },
  PERSON_ON_ACTIVITY: {
    severity: SEVERITY.VIOLATION,
    rule: 'overlap',
    message: (c) => {
      const other = c.conflicting[0];
      return `Людина вже задіяна в активності "${other.name_of_activity}" (${other.time_start}–${other.time_end}) у цей самий час`;
    },
  },
  SHIFT_CAPACITY_EXCEEDED: {
    severity: SEVERITY.VIOLATION,
    rule: 'capacity',
    message: (c) => `Досягнуто максимальної кількості людей на зміні (${c.current_count}/${c.max_people})`,
  },
  SHIFT_CLOSED: {
    severity: SEVERITY.VIOLATION,
    rule: 'capacity',
    message: () => 'Зміна закрита (max_people = 0)',
  },
  DRIVER_ON_STATIC_DURING_TRIP: {
    severity: SEVERITY.VIOLATION,
    rule: 'driver',
    message: () =>
      'Водій вже призначений на виїзд у цей самий час - не може одночасно стояти на стаціонарному чергуванні',
  },

  // --- warnings: дорадчі, ніколи не блокують ---
  ACTIVITY_BUFFER_TOO_SHORT: {
    severity: SEVERITY.WARNING,
    rule: 'buffer',
    message: (c) =>
      `Між "${c.activity.name_of_activity}" (до ${c.activity.time_end}) і початком зміни лише ${c.gap_minutes} хв (потрібно ${c.required_minutes})`,
  },
  CATERING_WINDOW_CHANGEOVER: {
    severity: SEVERITY.WARNING,
    rule: 'catering',
    message: (c) => `Перезмінка потрапляє у вікно кейтерингу "${c.window.label}" (${c.window.start}–${c.window.end})`,
  },
  OVERLAPS_ALL_HANDS_ACTIVITY: {
    severity: SEVERITY.WARNING,
    rule: 'quota',
    message: (c) => `Зміна перетинається з активністю "${c.activity.name_of_activity}", де задіяні всі`,
  },
  QUOTA_OVER_RECOMMENDED: {
    severity: SEVERITY.WARNING,
    rule: 'quota',
    message: (c) =>
      `Явний ліміт зміни (${c.effective_max}) перевищує рекомендовану квоту (${c.recommended_max}) для поточного навантаження`,
  },
  MIN_PEOPLE_SHORTFALL: {
    severity: SEVERITY.WARNING,
    rule: 'quota',
    message: (c) => `На зміні ${c.current_count} з мінімально потрібних ${c.min_people}`,
  },
  QUIET_HOUR_DRIVER_UNPAIRED: {
    severity: SEVERITY.WARNING,
    rule: 'driver',
    message: () => 'У тиху годину на чергуванні лише водій(ї), без напарника-не-водія',
  },
  DRIVER_RESERVED_FOR_TRIP: {
    severity: SEVERITY.WARNING,
    rule: 'driver',
    message: (c) => `Вільних водіїв (${c.free_drivers}) менше, ніж непокритих виїздів (${c.unstaffed_trips}) у цей час`,
  },
  TRIP_WITHOUT_DRIVER: {
    severity: SEVERITY.WARNING,
    rule: 'driver',
    message: () => 'На виїзд призначено людину без прапорця "водій"',
  },
  OFF_HOURS_SHIFT: {
    severity: SEVERITY.WARNING,
    rule: 'night',
    message: (c) => `Зміна потрапляє у нічне вікно (${c.window.start}–${c.window.end}), візити заборонені крім форс-мажорів`,
  },
  OFF_HOURS_NO_EMERGENCY_CONTACT: {
    severity: SEVERITY.WARNING,
    rule: 'night',
    message: () => 'Немає налаштованого екстреного нічного контакту (NIGHT_EMERGENCY_USER_ID)',
  },
  NO_POST_MEMORIAL_DUTY: {
    severity: SEVERITY.WARNING,
    rule: 'night',
    message: (c) => `Після "${c.activity.name_of_activity}" немає чергового для приймання речей`,
  },
  GRACE_PERIOD_UNCOVERED: {
    severity: SEVERITY.WARNING,
    rule: 'night',
    message: (c) => `${c.service_type}: немає покриття протягом пільгових ${c.grace_minutes} хв після закінчення робочого часу`,
  },
  DATA_TIME_UNPARSEABLE: {
    severity: SEVERITY.WARNING,
    rule: 'data',
    message: (c) => `Не вдалося розпізнати дату/час запису (${c.entity}); часозалежні правила для нього пропущено`,
  },
  DATA_MASTERPLAN_NO_DATE: {
    severity: SEVERITY.WARNING,
    rule: 'data',
    message: (c) => `Активність "${c.name_of_activity}" не має ні date, ні is_daily=true`,
  },
};

/** Будує знахідку (RuleFinding) за кодом і контекстом. Кидає, якщо код не зареєстровано - типова помилка розробника, а не даних. */
function finding(code, context = {}) {
  const entry = REGISTRY[code];
  if (!entry) throw new Error(`Невідомий код правила рушія: ${code}`);
  return Object.freeze({
    code,
    severity: entry.severity,
    rule: entry.rule,
    message: entry.message(context),
    context,
  });
}

module.exports = { SEVERITY, REGISTRY, finding };
