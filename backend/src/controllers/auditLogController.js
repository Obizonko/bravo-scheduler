const auditLogService = require('../services/auditLogService');

class AuditLogController {
  async getAll(req, res) {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const records = await auditLogService.getRecent(limit);
    res.status(200).json({ success: true, data: records });
  }
}

module.exports = new AuditLogController();
