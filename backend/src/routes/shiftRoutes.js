const express = require('express');
const shiftController = require('../controllers/shiftController');
const validate = require('../middlewares/validate');
const requireLead = require('../middlewares/requireLead');
const { createShiftSchema, updateShiftSchema } = require('../validators/shiftValidator');
const { shiftListQuerySchema, boardQuerySchema, weekBoardQuerySchema } = require('../validators/queryValidator');

const router = express.Router();

// /board і /week-board МАЮТЬ бути зареєстровані перед /:id, інакше Express звʼяже
// літерал з параметром :id (той самий трюк, що й /schedule/timeline).
router.get('/board', validate.query(boardQuerySchema), shiftController.getBoard);
router.get('/week-board', validate.query(weekBoardQuerySchema), shiftController.getWeekBoard);
router.get('/', validate.query(shiftListQuerySchema), shiftController.getAll);
router.get('/:id', shiftController.getById);
router.get('/:id/availability', shiftController.getAvailability);
router.post('/', requireLead, validate(createShiftSchema), shiftController.create);
router.put('/:id', requireLead, validate(updateShiftSchema), shiftController.update);
router.delete('/:id', requireLead, shiftController.remove);

module.exports = router;
