const userService = require('../services/userService');

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
    const user = await userService.update(req.params.id, req.body);
    res.status(200).json({ success: true, data: user });
  }

  async remove(req, res) {
    await userService.remove(req.params.id);
    res.status(204).send();
  }
}

module.exports = new UserController();
