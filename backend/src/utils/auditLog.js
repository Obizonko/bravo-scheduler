const auditLogService = require('../services/auditLogService');
const logger = require('./logger');

/**
 * Тонка обгортка над auditLogService.log() для виклику з контролерів: бере
 * актора з req.actorId/req.actorName (виставлені requireLead/requireSuperAdmin,
 * middlewares/requireLead.js), і НІКОЛИ не кидає - збій запису в лог не має
 * зривати саму дію користувача, лише мовчки лишає слід у backend-логах.
 */
async function recordAudit(req, { action, entityType, entityId, summary }) {
  try {
    await auditLogService.log({
      actorId: req.actorId || null,
      actorName: req.actorName || 'Невідомо',
      action,
      entityType,
      entityId,
      summary,
    });
  } catch (err) {
    logger.error('Не вдалося записати аудит-лог', { error: err.message, action, entityType, entityId });
  }
}

module.exports = { recordAudit };
