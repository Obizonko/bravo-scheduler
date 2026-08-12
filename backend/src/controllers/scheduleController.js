const scheduleService = require('../services/scheduleService');
const rulesEngineService = require('../services/rulesEngineService');

class ScheduleController {
  async getAll(req, res) {
    // req.validated.query замість req.query напряму: без валідації тут
    // GET /schedule?user_id=abc кидав Mongoose CastError -> непередбачений 500.
    const { shift_id, user_id, status } = req.validated.query;
    const filter = {};
    if (shift_id) filter.shift_id = shift_id;
    if (user_id) filter.user_id = user_id;
    if (status) filter.status = status;
    const records = await scheduleService.getAll(filter);
    res.status(200).json({ success: true, data: records });
  }

  /** Dry-run: POST /schedule/check. Завжди 200 - це запит "чи можна?", не команда. */
  async check(req, res) {
    const result = await rulesEngineService.checkAssignment(req.body);
    res.status(200).json({ success: true, data: result });
  }

  /** getDailyTimelineForUser зі спеки: GET /schedule/timeline?user_id&date */
  async getTimeline(req, res) {
    const { user_id: userId, date } = req.validated.query;
    const result = await rulesEngineService.getTimelineForUser(userId, date);
    res.status(200).json({ success: true, data: result });
  }

  async getById(req, res) {
    const record = await scheduleService.getById(req.params.id);
    res.status(200).json({ success: true, data: record });
  }

  async assign(req, res) {
    // Сам маршрут уже вимагає requireLead, тож req.isLead тут або true (PIN
    // підтверджено), або весь запит взагалі не дійшов би сюди - за винятком
    // випадку, коли жоден PIN не налаштований на сервері (гейт вимкнений,
    // req.isLead лишається falsy, і force тому теж ніколи не спрацює).
    const { force, ...data } = req.body;
    const effectiveForce = Boolean(force) && req.isLead === true;

    // data лишається ТОЧНО тим самим записом, що й раніше - warnings/violations
    // додаються як сусідні ключі верхнього рівня, які старі клієнти просто ігнорують.
    const { record, warnings, violations } = await scheduleService.assign(data, { force: effectiveForce });
    res.status(201).json({
      success: true,
      data: record,
      ...(warnings.length ? { warnings } : {}),
      ...(violations.length ? { violations } : {}),
    });
  }

  /** triggerSubstitution зі спеки: POST /schedule/:id/substitution. */
  async requestSubstitution(req, res) {
    const { record, notification } = await scheduleService.triggerSubstitution(req.params.id, req.body.reason);
    res.status(200).json({ success: true, data: record, notification });
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
