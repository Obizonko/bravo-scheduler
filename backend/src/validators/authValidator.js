const Joi = require('joi');

const pinSchema = Joi.object({
  pin: Joi.string().min(1).max(64).required(),
});

module.exports = { pinSchema };
