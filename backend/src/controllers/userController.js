const userService = require('../services/userService');
const { recordAudit } = require('../utils/auditLog');

class UserController {
  async getAll(req, res) {
    const users = await userService.getAll();
    res.status(200).json({ success: true, data: users });
  }

  async getById(req, res) {
    const user = await userService.getById(req.params.id);
    res.status(200).json({ success: true, data: user });
  }

  async create(req, res) {
    const user = await userService.create(req.body);
    res.status(201).json({ success: true, data: user });
  }

  async update(req, res) {
    // generated_pin - лише коли ЦЕЙ виклик щойно призначив людину адміном
    // (userService#update), показуємо супер-адміну один раз і більше ніколи.
    // Кладемо ВСЕРЕДИНУ data (не сусіднім полем) - спільна фронтенд-обгортка
    // Api.* повертає лише json.data, сусідні поля відповіді вона відкидає.
    const { generated_pin: generatedPin, ...user } = await userService.update(req.params.id, req.body);
    if (generatedPin) user.generated_pin = generatedPin;

    if (req.body.role !== undefined) {
      const summary =
        req.body.role === 'lead'
          ? `Призначив(ла) ${user.name} адміном`
          : `Зняв(ла) права адміна з ${user.name}`;
      await recordAudit(req, {
        action: 'user.role_change',
        entityType: 'User',
        entityId: user.user_id,
        summary,
      });
    }

    res.status(200).json({ success: true, data: user });
  }

  async remove(req, res) {
    await userService.remove(req.params.id);
    res.status(204).send();
  }
}

module.exports = new UserController();
