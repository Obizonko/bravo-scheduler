const Joi = require('joi');
const { WORKLOAD_LEVELS, ACTIVITY_COLORS } = require('../domain/constants');
const { DATE_PATTERN, TIME_PATTERN, isValidCalendarDate } = require('../domain/time');

const dateSchema = Joi.string()
  .pattern(DATE_PATTERN)
  .custom((value, helpers) =>
    isValidCalendarDate(value) ? value : helpers.error('date.invalidCalendar')
  )
  .messages({
    'string.pattern.base': 'дата має бути у форматі YYYY-MM-DD',
    'date.invalidCalendar': 'дата не існує в календарі',
  });

const timeSchema = Joi.string()
  .pattern(TIME_PATTERN)
  .messages({ 'string.pattern.base': 'час має бути у форматі HH:mm (24-годинний)' });

const isDailySchema = Joi.boolean().truthy('true').truthy('TRUE').falsy('false').falsy('FALSE');

/**
 * Активність або привʼязана до конкретної дати, або повторюється щодня (is_daily) -
 * ніколи не обидва одразу і не жодне з двох. Навмисно НЕ використовує Joi .xor(),
 * бо .default() на одному з полів-учасників xor "непомітно" задовольняє умову
 * присутності ще до перевірки залежності - custom-перевірка дивиться вже на
 * фінальне резолвлене значення, тому цієї пастки уникає.
 */
function exactlyOneOfDateOrDaily(value, helpers) {
  const hasDate = typeof value.date === 'string' && value.date.length > 0;
  const hasDaily = value.is_daily === true;
  if (hasDate === hasDaily) {
    return helpers.error('masterPlan.dateOrDaily');
  }
  return value;
}

const dateOrDailyMessage = {
  'masterPlan.dateOrDaily': 'потрібно вказати рівно одне: або date, або is_daily=true',
};

const createMasterPlanSchema = Joi.object({
  name_of_activity: Joi.string().min(2).max(300).required(),
  time_start: timeSchema.required(),
  time_end: timeSchema.required(),
  workload: Joi.string()
    .valid(...WORKLOAD_LEVELS)
    .allow('', null),
  date: dateSchema.allow(null),
  is_daily: isDailySchema.default(false),
  activity_kind: Joi.string().max(100).allow('', null),
  color: Joi.string()
    .valid(...ACTIVITY_COLORS)
    .default('blue'),
})
  .custom(exactlyOneOfDateOrDaily, 'date xor is_daily')
  .messages(dateOrDailyMessage);

const updateMasterPlanSchema = Joi.object({
  name_of_activity: Joi.string().min(2).max(300),
  time_start: timeSchema,
  time_end: timeSchema,
  workload: Joi.string()
    .valid(...WORKLOAD_LEVELS)
    .allow('', null),
  date: dateSchema.allow(null),
  is_daily: isDailySchema,
  activity_kind: Joi.string().max(100).allow('', null),
  color: Joi.string().valid(...ACTIVITY_COLORS),
})
  .min(1)
  .custom((value, helpers) => {
    // Часткове оновлення: не вимагаємо присутності обох полів, але не дозволяємо
    // одночасно ввімкнути is_daily=true і задати непорожню date в тому самому запиті.
    if (value.is_daily === true && typeof value.date === 'string' && value.date.length > 0) {
      return helpers.error('masterPlan.dateOrDaily');
    }
    return value;
  }, 'not both date and is_daily=true')
  .messages(dateOrDailyMessage);

module.exports = { createMasterPlanSchema, updateMasterPlanSchema, WORKLOAD_LEVELS };
