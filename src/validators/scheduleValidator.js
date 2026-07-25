const Joi = require('joi');

const STATUSES = ['Assigned', 'Replacement', 'Completed'];

const createScheduleSchema = Joi.object({
  shift_id: Joi.string().required(),
  user_id: Joi.string().required(),
  status: Joi.string()
    .valid(...STATUSES)
    .default('Assigned'),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...STATUSES)
    .required(),
});

module.exports = { createScheduleSchema, updateStatusSchema, STATUSES };
