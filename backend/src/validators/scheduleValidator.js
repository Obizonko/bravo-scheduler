const Joi = require('joi');
const { STATUSES } = require('../domain/constants');

// MongoDB ObjectId: 24-символьний hex-рядок
const objectId = Joi.string().hex().length(24).message('має бути коректним MongoDB ObjectId');

const createScheduleSchema = Joi.object({
  shift_id: objectId.required(),
  user_id: objectId.required(),
  status: Joi.string()
    .valid(...STATUSES)
    .default('Assigned'),
  // force=true продавлює порушення рушія правил, якщо RULES_ENFORCEMENT=block.
  // Реально спрацьовує лише коли middlewares/requireLead.requireLeadIfForcing
  // підтвердив дійсний PIN голови команди - самé поле в тілі запиту нічого не гарантує.
  force: Joi.boolean().truthy('true').truthy('TRUE').falsy('false').falsy('FALSE').default(false),
});

const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(...STATUSES)
    .required(),
});

const substitutionSchema = Joi.object({
  reason: Joi.string().max(500).allow('', null),
});

module.exports = { createScheduleSchema, updateStatusSchema, substitutionSchema, STATUSES };
