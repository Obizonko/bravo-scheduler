const express = require('express');
const shiftController = require('../controllers/shiftController');
const validate = require('../middlewares/validate');
const { createShiftSchema, updateShiftSchema } = require('../validators/shiftValidator');

const router = express.Router();

router.get('/', shiftController.getAll);
router.get('/:id', shiftController.getById);
router.post('/', validate(createShiftSchema), shiftController.create);
router.put('/:id', validate(updateShiftSchema), shiftController.update);
router.delete('/:id', shiftController.remove);

module.exports = router;
