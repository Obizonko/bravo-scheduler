const activityAssignmentService = require('../services/activityAssignmentService');

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
    res.status(201).json({ success: true, data: record });
  }

  async remove(req, res) {
    await activityAssignmentService.remove(req.params.id);
    res.status(204).send();
  }
}

module.exports = new ActivityAssignmentController();
