const Joi = require('joi');
const { ROLES } = require('../domain/constants');

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  is_driver: Joi.boolean()
    .truthy('true')
    .truthy('TRUE')
    .falsy('false')
    .falsy('FALSE')
    .default(false),
  telegram_id: Joi.string().allow('', null),
  role: Joi.string()
    .valid(...ROLES)
    .default('member'),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(200),
  is_driver: Joi.boolean().truthy('true').truthy('TRUE').falsy('false').falsy('FALSE'),
  telegram_id: Joi.string().allow('', null),
  role: Joi.string().valid(...ROLES),
}).min(1);

module.exports = { createUserSchema, updateUserSchema, ROLES };
