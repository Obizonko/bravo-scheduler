const Joi = require('joi');

const SERVICE_TYPES = ['Склад', 'ТЕЦ', 'Поїздка', 'Зовнішня активність'];

const createShiftSchema = Joi.object({
  date: Joi.string().required(),
  time_start: Joi.string().required(),
  time_end: Joi.string().required(),
  workload: Joi.string().allow('', null),
  service_type: Joi.string()
    .valid(...SERVICE_TYPES)
    .required(),
  min_people: Joi.number().integer().min(0).required(),
  max_people: Joi.number().integer().min(Joi.ref('min_people')).required(),
});

const updateShiftSchema = Joi.object({
  date: Joi.string(),
  time_start: Joi.string(),
  time_end: Joi.string(),
  workload: Joi.string().allow('', null),
  service_type: Joi.string().valid(...SERVICE_TYPES),
  min_people: Joi.number().integer().min(0),
  max_people: Joi.number().integer().min(0),
}).min(1);

module.exports = { createShiftSchema, updateShiftSchema, SERVICE_TYPES };
