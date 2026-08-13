const activityAssignmentService = require('../services/activityAssignmentService');
const activityAssignmentRepository = require('../repositories/activityAssignmentRepository');
const userRepository = require('../repositories/userRepository');
const masterPlanRepository = require('../repositories/masterPlanRepository');
const { recordAudit } = require('../utils/auditLog');

async function describeParticipation(userId, masterPlanId) {
  const [user, activity] = await Promise.all([
    userRepository.findById(userId),
    masterPlanRepository.findById(masterPlanId),
  ]);
  const userLabel = user ? user.name : `користувач ${userId}`;
  const activityLabel = activity ? `«${activity.name_of_activity}»` : `активність ${masterPlanId}`;
  return { userLabel, activityLabel };
}

class ActivityAssignmentController {
  async getAll(req, res) {
    const { user_id, master_plan_id } = req.validated.query;
    const filter = {};
    if (user_id) filter.user_id = user_id;
    if (master_plan_id) filter.master_plan_id = master_plan_id;
    const records = await activityAssignmentService.getAll(filter);
    res.status(200).json({ success: true, data: records });
  }

  async create(req, res) {
    const record = await activityAssignmentService.create(req.body);
    const { userLabel, activityLabel } = await describeParticipation(record.user_id, record.master_plan_id);
    await recordAudit(req, {
      action: 'activity_assignment.create',
      entityType: 'ActivityAssignment',
      entityId: record.assignment_id,
      summary: `Додав(ла) ${userLabel} до активності ${activityLabel}`,
    });
    res.status(201).json({ success: true, data: record });
  }

  async remove(req, res) {
    // Знімок ДО видалення - інакше після remove() нема звідки взяти user_id/master_plan_id.
    const record = await activityAssignmentRepository.findById(req.params.id);
    await activityAssignmentService.remove(req.params.id);
    if (record) {
      const { userLabel, activityLabel } = await describeParticipation(record.user_id, record.master_plan_id);
      await recordAudit(req, {
        action: 'activity_assignment.remove',
        entityType: 'ActivityAssignment',
        entityId: record.assignment_id,
        summary: `Прибрав(ла) ${userLabel} з активності ${activityLabel}`,
      });
    }
    res.status(204).send();
  }
}

module.exports = new ActivityAssignmentController();
