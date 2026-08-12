const Joi = require('joi');
const { SERVICE_TYPES } = require('../domain/constants');
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

// null означає "квоту визначає рушій правил" (src/services/rules/quota.js); явне число завжди перемагає.
const peopleCountSchema = Joi.number().integer().min(0).allow(null);

// Номер слот-колонки в тижневому календарі (0..2). null - без явного вибору колонки.
const laneSchema = Joi.number().integer().min(0).max(2).allow(null);

/** time_end === time_start заборонено (нульова/24-год тривалість неоднозначна). time_end < time_start - ОК, перехід через північ. */
function noZeroLengthShift(value, helpers) {
  if (value.time_start && value.time_end && value.time_start === value.time_end) {
    return helpers.error('shift.zeroLength');
  }
  return value;
}

/** max_people >= min_people, коли обидва задані явно. */
function maxNotBelowMin(value, helpers) {
  if (value.min_people != null && value.max_people != null && value.max_people < value.min_people) {
    return helpers.error('shift.maxBelowMin');
  }
  return value;
}

const crossFieldMessages = {
  'shift.zeroLength': 'time_end не може дорівнювати time_start',
  'shift.maxBelowMin': 'max_people не може бути меншим за min_people',
};

const createShiftSchema = Joi.object({
  date: dateSchema.required(),
  time_start: timeSchema.required(),
  time_end: timeSchema.required(),
  workload: Joi.string().allow('', null),
  service_type: Joi.string()
    .valid(...SERVICE_TYPES)
    .required(),
  min_people: peopleCountSchema,
  max_people: peopleCountSchema,
  lane: laneSchema,
})
  .custom(noZeroLengthShift, 'time_start != time_end')
  .custom(maxNotBelowMin, 'max_people >= min_people')
  .messages(crossFieldMessages);

// Раніше цей апдейт-варіант губив крос-перевірку max_people >= min_people, яка була лише
// в create-схемі - через PUT /shifts/:id можна було виставити max < min. Тепер обидві
// крос-перевірки застосовуються однаково і на create, і на update.
const updateShiftSchema = Joi.object({
  date: dateSchema,
  time_start: timeSchema,
  time_end: timeSchema,
  workload: Joi.string().allow('', null),
  service_type: Joi.string().valid(...SERVICE_TYPES),
  min_people: peopleCountSchema,
  max_people: peopleCountSchema,
  lane: laneSchema,
})
  .min(1)
  .custom(noZeroLengthShift, 'time_start != time_end')
  .custom(maxNotBelowMin, 'max_people >= min_people')
  .messages(crossFieldMessages);

module.exports = { createShiftSchema, updateShiftSchema, SERVICE_TYPES };
