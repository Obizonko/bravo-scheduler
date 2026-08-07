/**
 * Базовий клас операційних помилок застосунку.
 * Дозволяє відрізняти очікувані помилки (404, 400 тощо)
 * від непередбачених багів у централізованому error handler'і.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Ресурс') {
    super(`${resource} не знайдено`, 404);
  }
}

class ValidationError extends AppError {
  constructor(details) {
    super('Помилка валідації вхідних даних', 400, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Конфлікт даних') {
    super(message, 409);
  }
}

module.exports = { AppError, NotFoundError, ValidationError, ConflictError };
