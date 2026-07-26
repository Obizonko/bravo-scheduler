const masterPlanService = require('../services/masterPlanService');

class MasterPlanController {
  async getAll(req, res) {
    const records = await masterPlanService.getAll();
    res.status(200).json({ success: true, data: records });
  }

  async getById(req, res) {
    const record = await masterPlanService.getById(req.params.id);
    res.status(200).json({ success: true, data: record });
  }

  async create(req, res) {
    const record = await masterPlanService.create(req.body);
    res.status(201).json({ success: true, data: record });
  }

  async update(req, res) {
    const record = await masterPlanService.update(req.params.id, req.body);
    res.status(200).json({ success: true, data: record });
  }

  async remove(req, res) {
    await masterPlanService.remove(req.params.id);
    res.status(204).send();
  }
}

module.exports = new MasterPlanController();
