const shiftService = require('../services/shiftService');

class ShiftController {
  async getAll(req, res) {
    const { date, service_type } = req.query;
    const filter = {};
    if (date) filter.date = date;
    if (service_type) filter.service_type = service_type;
    const shifts = await shiftService.getAll(filter);
    res.status(200).json({ success: true, data: shifts });
  }

  async getById(req, res) {
    const shift = await shiftService.getById(req.params.id);
    res.status(200).json({ success: true, data: shift });
  }

  async create(req, res) {
    const shift = await shiftService.create(req.body);
    res.status(201).json({ success: true, data: shift });
  }

  async update(req, res) {
    const shift = await shiftService.update(req.params.id, req.body);
    res.status(200).json({ success: true, data: shift });
  }

  async remove(req, res) {
    await shiftService.remove(req.params.id);
    res.status(204).send();
  }
}

module.exports = new ShiftController();
