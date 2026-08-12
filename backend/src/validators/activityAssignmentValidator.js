const Joi = require('joi');

const objectId = Joi.string().hex().length(24).message('має бути коректним MongoDB ObjectId');

const createActivityAssignmentSchema = Joi.object({
  user_id: objectId.required(),
  master_plan_id: objectId.required(),
});

module.exports = { createActivityAssignmentSchema };
