const { ValidationError } = require('../utils/AppError');

/**
 * Middleware-фабрика для валідації req.body за Joi-схемою.
 * У разі помилки формує єдиний ValidationError, який ловить errorHandler.
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      return next(new ValidationError(details));
    }

    req.body = value;
    return next();
  };
}

module.exports = validate;
