const auditLogRepository = require('../repositories/auditLogRepository');

const DEFAULT_LIMIT = 200;

class AuditLogService {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * Пише запис у лог. Викликається з контролерів ПІСЛЯ успішної дії (fire-and-
   * forget за духом, але await'иться, щоб помилка запису логу не губилась мовчки -
   * втім, самі виклики обгорнуті в try/catch на боці контролера, щоб збій
   * логування ніколи не зривав саму дію користувача).
   */
  async log({ actorId, actorName, action, entityType, entityId, summary }) {
    return this.repository.create({
      actor_id: actorId || null,
      actor_name: actorName || 'Невідомо',
      action,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      summary,
    });
  }

  /** Найновіші записи першими - findAll() репозиторію сортує за зростанням, тож розвертаємо тут. */
  async getRecent(limit = DEFAULT_LIMIT) {
    const all = await this.repository.findAll();
    return all.slice(-limit).reverse();
  }
}

module.exports = new AuditLogService(auditLogRepository);
