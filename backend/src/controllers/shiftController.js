const shiftService = require('../services/shiftService');
const rulesEngineService = require('../services/rulesEngineService');

class ShiftController {
  async getAll(req, res) {
    const { date, service_type } = req.validated.query;
    const filter = {};
    if (date) filter.date = date;
    if (service_type) filter.service_type = service_type;
    const shifts = await shiftService.getAll(filter);
    res.status(200).json({ success: true, data: shifts });
  }

  /** Таймлайн служби (один день): GET /shifts/board?date&service_type */
  async getBoard(req, res) {
    const { date, service_type: serviceType } = req.validated.query;
    const board = await rulesEngineService.getServiceBoard(date, serviceType);
    res.status(200).json({ success: true, data: board });
  }

  /** Тижневий грід служби: GET /shifts/week-board?date_from&date_to&service_type */
  async getWeekBoard(req, res) {
    const { date_from: dateFrom, date_to: dateTo, service_type: serviceType } = req.validated.query;
    const board = await rulesEngineService.getWeekBoard(dateFrom, dateTo, serviceType);
    res.status(200).json({ success: true, data: board });
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
