const masterPlanService = require('../services/masterPlanService');
const { recordAudit } = require('../utils/auditLog');

function describeActivity(activity) {
  const when = activity.is_daily ? 'щодня' : activity.date;
  return `«${activity.name_of_activity}» (${when} ${activity.time_start}–${activity.time_end})`;
}

class MasterPlanController {
  async getAll(req, res) {
    const { date, is_daily } = req.query;
    const filter = {};
    if (date) filter.date = date;
    if (is_daily !== undefined) filter.is_daily = is_daily === 'true';
    const records = await masterPlanService.getAll(filter);
    res.status(200).json({ success: true, data: records });
  }

  async getById(req, res) {
    const record = await masterPlanService.getById(req.params.id);
    res.status(200).json({ success: true, data: record });
  }

  async create(req, res) {
    const record = await masterPlanService.create(req.body);
    await recordAudit(req, {
      action: 'master_plan.create',
      entityType: 'MasterPlan',
      entityId: record.record_id,
      summary: `Створив(ла) активність ${describeActivity(record)}`,
    });
    res.status(201).json({ success: true, data: record });
  }

  async update(req, res) {
    const record = await masterPlanService.update(req.params.id, req.body);
    await recordAudit(req, {
      action: 'master_plan.update',
      entityType: 'MasterPlan',
      entityId: record.record_id,
      summary: `Оновив(ла) активність ${describeActivity(record)}`,
    });
    res.status(200).json({ success: true, data: record });
  }

  async remove(req, res) {
    const record = await masterPlanService.getById(req.params.id);
    await masterPlanService.remove(req.params.id);
    await recordAudit(req, {
      action: 'master_plan.delete',
      entityType: 'MasterPlan',
      entityId: record.record_id,
      summary: `Видалив(ла) активність ${describeActivity(record)}`,
    });
    res.status(204).send();
  }
}

module.exports = new MasterPlanController();
