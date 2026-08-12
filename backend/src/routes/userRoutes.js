const express = require('express');
const userController = require('../controllers/userController');
const validate = require('../middlewares/validate');
const requireLead = require('../middlewares/requireLead');
const { requireSuperAdminIfChangingRole } = require('../middlewares/requireLead');
const { createUserSchema, updateUserSchema } = require('../validators/userValidator');

const router = express.Router();

router.get('/', userController.getAll);
router.get('/:id', userController.getById);
router.post('/', requireLead, validate(createUserSchema), userController.create);
// Зміна role (member<->lead) - привілей супер-адміна; решта полів (імʼя, is_driver
// тощо) редагує будь-який lead. Порядок: спершу validate (щоб req.body.role було вже
// нормалізоване Joi), потім requireLead (базовий гейт), потім вужчий супер-гейт.
router.put(
  '/:id',
  validate(updateUserSchema),
  requireLead,
  requireSuperAdminIfChangingRole,
  userController.update
);
router.delete('/:id', requireLead, userController.remove);

module.exports = router;
