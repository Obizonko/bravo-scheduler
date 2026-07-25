const express = require('express');
const userController = require('../controllers/userController');
const validate = require('../middlewares/validate');
const { createUserSchema, updateUserSchema } = require('../validators/userValidator');

const router = express.Router();

router.get('/', userController.getAll);
router.get('/:id', userController.getById);
router.post('/', validate(createUserSchema), userController.create);
router.put('/:id', validate(updateUserSchema), userController.update);
router.delete('/:id', userController.remove);

module.exports = router;
