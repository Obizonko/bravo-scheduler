const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const { config } = require('../config/env');

/* Має бути підключений ОСТАННІМ у ланцюжку middleware в app.js.*/

function errorHandler(err, req, res, next) {
  const isOperational = err instanceof AppError;
  const statusCode = isOperational ? err.statusCode : 500;

  logger.error(err.message, {
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      message: isOperational ? err.message : 'Внутрішня помилка сервера',
      details: isOperational ? err.details : undefined,
      ...(config.env === 'development' && !isOperational ? { stack: err.stack } : {}),
    },
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: { message: `Маршрут ${req.method} ${req.originalUrl} не знайдено` },
  });
}

module.exports = { errorHandler, notFoundHandler };
