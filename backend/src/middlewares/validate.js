const { ValidationError } = require('../utils/AppError');

function toDetails(error) {
  return error.details.map((d) => ({ field: d.path.join('.'), message: d.message }));
}

/**
 * Валідує req[source] (body/query/params) за Joi-схемою. Результат завжди
 * кладеться і в req.validated.<source> (для нових контролерів), і - для body -
 * дублюється в req.body (щоб жоден з 8 наявних викликів validate(schema) не
 * зламався: вони читають req.body напряму, а не req.validated.body).
 *
 * req.query навмисно НЕ перезаписується для source === 'query' в Express 5:
 * там req.query - геттер без сеттера, і пряме присвоєння кинуло б виняток.
 * Нові контролери мають читати лише req.validated.query, щоб апгрейд Express
 * 4 -> 5 був no-op.
 */
function validateSource(schema, source) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return next(new ValidationError(toDetails(error)));
    }

    req.validated = req.validated || {};
    req.validated[source] = value;
    if (source === 'body') req.body = value;

    return next();
  };
}

const validate = (schema) => validateSource(schema, 'body');
validate.query = (schema) => validateSource(schema, 'query');
validate.params = (schema) => validateSource(schema, 'params');

module.exports = validate;
