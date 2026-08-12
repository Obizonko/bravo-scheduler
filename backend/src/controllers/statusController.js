const rulesEngineService = require('../services/rulesEngineService');

/** Сторінка 2 зі спеки: моніторинг поточного стану всіх служб. */
class StatusController {
  async get(req, res) {
    const { date, at } = req.validated.query;
    const result = await rulesEngineService.getStatus(date, at);
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = new StatusController();
