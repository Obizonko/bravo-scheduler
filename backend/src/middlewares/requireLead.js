'use strict';

const crypto = require('crypto');
const { config } = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../utils/AppError');

/**
 * Легка ієрархічна авторизація через спільний PIN у заголовку X-Admin-Pin
 * (ніколи в query-параметрі - той потрапив би в логи доступу й історію браузера).
 * Порівняння - crypto.timingSafeEqual, щоб не витікати збіг довжини/вмісту через час відповіді.
 *
 * Два рівні: 'lead' (голова команди, ADMIN_PIN) і 'super_admin' (власник системи,
 * SUPER_ADMIN_PIN) - той, хто знає SUPER_ADMIN_PIN, автоматично проходить і гейт lead-рівня
 * (стандартна ієрархія прав), тому requireLead приймає ОБИДВА PIN.
 */
function checkPin(candidate, expected) {
  if (!expected) return false;
  const providedBuf = Buffer.from(String(candidate || ''));
  const expectedBuf = Buffer.from(expected);
  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Якщо НІ ADMIN_PIN, НІ SUPER_ADMIN_PIN не налаштовані - гейт вимкнений і пропускає все,
 * так порожній .env не блокує систему випадково. Але це ж означає, що привілейовані дії
 * лишаються недоступними, доки хоч один PIN не налаштовано явно.
 */
function requireLead(req, res, next) {
  if (!config.admin.pin && !config.superAdmin.pin) return next();

  const provided = req.get('X-Admin-Pin');
  const isSuperAdmin = checkPin(provided, config.superAdmin.pin);
  const isLead = isSuperAdmin || checkPin(provided, config.admin.pin);

  if (!isLead) {
    return next(new UnauthorizedError('Потрібен дійсний PIN голови команди (заголовок X-Admin-Pin)'));
  }

  req.isLead = true;
  req.isSuperAdmin = isSuperAdmin;
  return next();
}

/** Той самий гейт, але лише коли клієнт реально просить force - звичайне призначення не потребує PIN. */
function requireLeadIfForcing(req, res, next) {
  if (!req.body || !req.body.force) return next();
  return requireLead(req, res, next);
}

/** Найвищий рівень: лише той, хто знає SUPER_ADMIN_PIN - призначення/зняття адмінів. */
function requireSuperAdmin(req, res, next) {
  if (!config.superAdmin.pin) {
    return next(new ForbiddenError('SUPER_ADMIN_PIN не налаштований на сервері'));
  }
  if (!checkPin(req.get('X-Admin-Pin'), config.superAdmin.pin)) {
    return next(new UnauthorizedError('Потрібен дійсний PIN супер-адміна (заголовок X-Admin-Pin)'));
  }
  req.isLead = true;
  req.isSuperAdmin = true;
  return next();
}

/** requireSuperAdmin, але лише коли тіло запиту реально змінює role - решта полів редагує lead. */
function requireSuperAdminIfChangingRole(req, res, next) {
  if (!req.body || req.body.role === undefined) return next();
  return requireSuperAdmin(req, res, next);
}

module.exports = requireLead;
module.exports.requireLeadIfForcing = requireLeadIfForcing;
module.exports.requireSuperAdmin = requireSuperAdmin;
module.exports.requireSuperAdminIfChangingRole = requireSuperAdminIfChangingRole;
module.exports.checkPin = checkPin;
