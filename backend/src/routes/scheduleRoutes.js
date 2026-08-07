const express = require('express');
const scheduleController = require('../controllers/scheduleController');
const validate = require('../middlewares/validate');
const { createScheduleSchema, updateStatusSchema } = require('../validators/scheduleValidator');

const router = express.Router();

router.get('/', scheduleController.getAll);
router.get('/:id', scheduleController.getById);
router.post('/', validate(createScheduleSchema), scheduleController.assign);
router.patch('/:id/status', validate(updateStatusSchema), scheduleController.updateStatus);
router.delete('/:id', scheduleController.remove);

module.exports = router;
