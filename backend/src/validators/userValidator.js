const Joi = require('joi');
const { ROLES } = require('../domain/constants');

// 'super_admin' навмисно НЕ в цьому списку - через звичайний API-ендпоінт
// призначити супер-адміна не можна (лише один, "Назар Уляк", ставиться
// напряму в БД через database/seedSuperAdmin.js). ROLES (усі три) лишається
// для Mongoose-схеми User, де super_admin - валідне значення поля.
const API_SETTABLE_ROLES = ROLES.filter((r) => r !== 'super_admin');

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
    .valid(...API_SETTABLE_ROLES)
    .default('member'),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(200),
  is_driver: Joi.boolean().truthy('true').truthy('TRUE').falsy('false').falsy('FALSE'),
  telegram_id: Joi.string().allow('', null),
  role: Joi.string().valid(...API_SETTABLE_ROLES),
}).min(1);

module.exports = { createUserSchema, updateUserSchema, ROLES };
