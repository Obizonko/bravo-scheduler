const Joi = require('joi');
const { DATE_PATTERN, TIME_PATTERN } = require('../domain/time');
const { STATUSES, SERVICE_TYPES } = require('../domain/constants');

const objectId = Joi.string().hex().length(24).message('має бути коректним MongoDB ObjectId');
const dateQuery = Joi.string().pattern(DATE_PATTERN).message('дата має бути у форматі YYYY-MM-DD');
const timeQuery = Joi.string()
  .pattern(TIME_PATTERN)
  .message('час має бути у форматі HH:mm (24-годинний)');

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Раніше GET /schedule?user_id=abc кидав необроблений Mongoose CastError -> 500.
// Ця схема відсіює невалідні ObjectId ще на вході, до репозиторію.
const scheduleListQuerySchema = Joi.object({
  shift_id: objectId,
  user_id: objectId,
  status: Joi.string().valid(...STATUSES),
});

const shiftListQuerySchema = Joi.object({
  date: dateQuery,
  service_type: Joi.string(),
});

// Для таймлайна (Сторінка 2): зміни служби на дату + повний список людей - одним запитом.
const boardQuerySchema = Joi.object({
  date: dateQuery.required(),
  service_type: Joi.string()
    .valid(...SERVICE_TYPES)
    .required(),
});

const timelineQuerySchema = Joi.object({
  user_id: objectId.required(),
  date: dateQuery.required(),
});

// date/at необов'язкові - дефолтяться на "сьогодні"/"зараз" за локальним часом сервера,
// узгоджено з домовленістю "один фіксований локальний час, без конвертації TZ".
const statusQuerySchema = Joi.object({
  date: dateQuery.default(() => todayDateStr()),
  at: timeQuery.default(() => nowTimeStr()),
});

const conflictsQuerySchema = Joi.object({
  date_from: dateQuery.required(),
  date_to: dateQuery.required(),
});

// Тижневий грід Склад/ТЕЦ (Сторінка 2): зміни за діапазон дат для однієї служби, згруповані по днях.
const weekBoardQuerySchema = Joi.object({
  date_from: dateQuery.required(),
  date_to: dateQuery.required(),
  service_type: Joi.string()
    .valid(...SERVICE_TYPES)
    .required(),
});

// Календар чергувань однієї людини (модалка на сторінці "Люди").
const personCalendarQuerySchema = Joi.object({
  date_from: dateQuery.required(),
  date_to: dateQuery.required(),
});

const activityAssignmentListQuerySchema = Joi.object({
  user_id: objectId,
  master_plan_id: objectId,
});

const objectIdParamSchema = Joi.object({
  id: objectId.required(),
});

module.exports = {
  scheduleListQuerySchema,
  shiftListQuerySchema,
  boardQuerySchema,
  weekBoardQuerySchema,
  personCalendarQuerySchema,
  activityAssignmentListQuerySchema,
  timelineQuerySchema,
  statusQuerySchema,
  conflictsQuerySchema,
  objectIdParamSchema,
};
