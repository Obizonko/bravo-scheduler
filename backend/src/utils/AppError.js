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
  constructor(message = 'Конфлікт даних', details = null) {
    super(message, 409, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Необхідна автентифікація') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Недостатньо прав') {
    super(message, 403);
  }
}

/**
 * Спеціалізований ConflictError для рушія правил: у details лежать
 * violations (жорсткі порушення, які й спричинили відмову) та warnings
 * (дорадчі знахідки, що супроводжують той самий кандидат на призначення).
 * Кидається лише коли config.rules.enforcement === 'block' і force не передано.
 */
class RuleViolationError extends ConflictError {
  constructor(result) {
    super('Призначення порушує правила графіка', {
      violations: result.violations,
      warnings: result.warnings,
    });
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  RuleViolationError,
};
