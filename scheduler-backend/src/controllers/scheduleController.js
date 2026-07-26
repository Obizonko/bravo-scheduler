const scheduleService = require('../services/scheduleService');

class ScheduleController {
  async getAll(req, res) {
    const { shift_id, user_id, status } = req.query;
    const filter = {};
    if (shift_id) filter.shift_id = shift_id;
    if (user_id) filter.user_id = user_id;
    if (status) filter.status = status;
    const records = await scheduleService.getAll(filter);
    res.status(200).json({ success: true, data: records });
  }

  async getById(req, res) {
    const record = await scheduleService.getById(req.params.id);
    res.status(200).json({ success: true, data: record });
  }

  async assign(req, res) {
    const record = await scheduleService.assign(req.body);
    res.status(201).json({ success: true, data: record });
  }

  async updateStatus(req, res) {
    const record = await scheduleService.updateStatus(req.params.id, req.body.status);
    res.status(200).json({ success: true, data: record });
  }

  async remove(req, res) {
    await scheduleService.remove(req.params.id);
    res.status(204).send();
  }
}

module.exports = new ScheduleController();
