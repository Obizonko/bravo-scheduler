const Joi = require('joi');

const STATUSES = ['Assigned', 'Replacement', 'Completed'];

// MongoDB ObjectId: 24-символьний hex-рядок
const objectId = Joi.string().hex().length(24).message('має бути коректним MongoDB ObjectId');

const createScheduleSchema = Joi.object({
  shift_id: objectId.required(),
  user_id: objectId.required(),
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
