const rulesEngineService = require('../services/rulesEngineService');

/** Сторінка 3 зі спеки: звіт для адмінки/голів команд по діапазону дат. */
class ReportsController {
  async conflicts(req, res) {
    const { date_from: dateFrom, date_to: dateTo } = req.validated.query;
    const result = await rulesEngineService.getConflictsReport(dateFrom, dateTo);
    res.status(200).json({ success: true, data: result });
  }
}

module.exports = new ReportsController();
