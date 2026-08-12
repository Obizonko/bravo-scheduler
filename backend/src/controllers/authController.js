const { config } = require('../config/env');
const { checkPin } = require('../middlewares/requireLead');
const { UnauthorizedError } = require('../utils/AppError');

class AuthController {
  /**
   * POST /auth/pin - перевіряє PIN і повертає роль для клієнта.
   * Спершу звіряє з SUPER_ADMIN_PIN (вищий рівень), потім з ADMIN_PIN - щоб,
   * якщо обидва випадково задані однаково, поверталась привілейованіша роль.
   */
  async verifyPin(req, res) {
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
