const { config } = require('../config/env');
const { checkPin } = require('../middlewares/requireLead');
const { UnauthorizedError } = require('../utils/AppError');
const userRepository = require('../repositories/userRepository');

class AuthController {
  /**
   * POST /auth/pin - перевіряє PIN і повертає роль (+ ідентичність, якщо PIN
   * персональний) для клієнта. Спершу шукає серед персональних PIN користувачів
   * (lead/super_admin) - основний шлях відтепер. Якщо не знайдено, падає на
   * старі спільні ADMIN_PIN/SUPER_ADMIN_PIN з .env (без user_id/name - той
   * самий запасний варіант, що й у middlewares/requireLead.js).
   */
  async verifyPin(req, res) {
    const matches = await userRepository.findAll({ pin: req.body.pin });
    const actor = matches.find((u) => u.role === 'lead' || u.role === 'super_admin');
    if (actor) {
      return res
        .status(200)
        .json({ success: true, data: { role: actor.role, user_id: actor.user_id, name: actor.name } });
    }

    if (!config.admin.pin && !config.superAdmin.pin) {
      throw new UnauthorizedError('Жоден PIN не налаштований на сервері (ADMIN_PIN / SUPER_ADMIN_PIN)');
    }

    if (checkPin(req.body.pin, config.superAdmin.pin)) {
      return res.status(200).json({ success: true, data: { role: 'super_admin' } });
    }
    if (checkPin(req.body.pin, config.admin.pin)) {
      return res.status(200).json({ success: true, data: { role: 'lead' } });
    }

    throw new UnauthorizedError('Невірний PIN');
  }
}

module.exports = new AuthController();
