const rulesEngineService = require('../services/rulesEngineService');

/** Загальна сторінка "Люди" - хто зараз де, без персоналізації й без входу. */
class PeopleController {
  async get(req, res) {
    const { date, at } = req.validated.query;
    const result = await rulesEngineService.getPeopleStatus(date, at);
    res.status(200).json({ success: true, data: result });
  }

  /** Календар чергувань однієї людини (модалка на сторінці "Люди"): GET /people/:id/calendar?date_from&date_to */
  async getCalendar(req, res) {
    const { date_from: dateFrom, date_to: dateTo } = req.validated.query;
    const result = await rulesEngineService.getPersonCalendar(req.params.id, dateFrom, dateTo);
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = new PeopleController();
