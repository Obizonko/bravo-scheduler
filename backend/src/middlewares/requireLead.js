'use strict';

const crypto = require('crypto');
const { config } = require('../config/env');
const { UnauthorizedError, ForbiddenError } = require('../utils/AppError');
const userRepository = require('../repositories/userRepository');

/**
 * Авторизація через PIN у заголовку X-Admin-Pin (ніколи в query-параметрі -
 * той потрапив би в логи доступу й історію браузера).
 *
 * Основний шлях - персональний PIN (User.pin, лише lead/super_admin), що
 * дає й РОЛЬ, і ІДЕНТИЧНІСТЬ (req.actorId/req.actorName) для аудит-логу.
 * Запасний шлях - старі спільні ADMIN_PIN/SUPER_ADMIN_PIN з .env (crypto.
 * timingSafeEqual, щоб не витікати збіг через час відповіді): підстраховка,
 * якщо PIN людини забутий/загублений і в БД ще нема кому його скинути, або
 * якщо супер-адмін ще не насіяний (сервер щойно піднявся вперше).
 */
function checkPin(candidate, expected) {
  if (!expected) return false;
  const providedBuf = Buffer.from(String(candidate || ''));
  const expectedBuf = Buffer.from(expected);
  return providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/** Шукає користувача з таким персональним PIN серед lead/super_admin. null, якщо не знайдено. */
async function findActorByPin(pin) {
  if (!pin) return null;
  const matches = await userRepository.findAll({ pin });
  const actor = matches.find((u) => u.role === 'lead' || u.role === 'super_admin');
  return actor || null;
}

async function requireLead(req, res, next) {
  try {
    const provided = req.get('X-Admin-Pin');

    const actor = await findActorByPin(provided);
    if (actor) {
      req.isLead = true;
      req.isSuperAdmin = actor.role === 'super_admin';
      req.actorId = actor.user_id;
      req.actorName = actor.name;
      return next();
    }

    // Запасний легасі-шлях - спільні PIN з .env, без прив'язки до конкретної людини.
    if (!config.admin.pin && !config.superAdmin.pin) return next(); // гейт вимкнений

    const isSuperAdminLegacy = checkPin(provided, config.superAdmin.pin);
    const isLeadLegacy = isSuperAdminLegacy || checkPin(provided, config.admin.pin);
    if (!isLeadLegacy) {
      return next(new UnauthorizedError('Потрібен дійсний PIN голови команди (заголовок X-Admin-Pin)'));
    }

    req.isLead = true;
    req.isSuperAdmin = isSuperAdminLegacy;
    req.actorId = null;
    req.actorName = isSuperAdminLegacy ? 'Супер-адмін (спільний PIN)' : 'Адмін (спільний PIN)';
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Той самий гейт, але лише коли клієнт реально просить force - звичайне призначення не потребує PIN. */
function requireLeadIfForcing(req, res, next) {
  if (!req.body || !req.body.force) return next();
  return requireLead(req, res, next);
}

/** Найвищий рівень: лише той, хто знає персональний PIN супер-адміна (роль super_admin) - призначення/зняття адмінів. */
async function requireSuperAdmin(req, res, next) {
  try {
    const provided = req.get('X-Admin-Pin');

    const actor = await findActorByPin(provided);
    if (actor && actor.role === 'super_admin') {
      req.isLead = true;
      req.isSuperAdmin = true;
      req.actorId = actor.user_id;
      req.actorName = actor.name;
      return next();
    }

    if (!config.superAdmin.pin) {
      return next(new ForbiddenError('SUPER_ADMIN_PIN не налаштований на сервері'));
    }
    if (!checkPin(provided, config.superAdmin.pin)) {
      return next(new UnauthorizedError('Потрібен дійсний PIN супер-адміна (заголовок X-Admin-Pin)'));
    }
    req.isLead = true;
    req.isSuperAdmin = true;
    req.actorId = null;
    req.actorName = 'Супер-адмін (спільний PIN)';
    return next();
  } catch (err) {
    return next(err);
  }
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
