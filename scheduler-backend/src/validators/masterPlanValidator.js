const Joi = require('joi');

const createMasterPlanSchema = Joi.object({
  name_of_activity: Joi.string().min(2).max(300).required(),
  time_start: Joi.string().required(),
  time_end: Joi.string().required(),
  workload: Joi.string().allow('', null),
});

const updateMasterPlanSchema = Joi.object({
  name_of_activity: Joi.string().min(2).max(300),
  time_start: Joi.string(),
  time_end: Joi.string(),
  workload: Joi.string().allow('', null),
}).min(1);

module.exports = { createMasterPlanSchema, updateMasterPlanSchema };
