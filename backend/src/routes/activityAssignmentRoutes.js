const express = require('express');
const activityAssignmentController = require('../controllers/activityAssignmentController');
const validate = require('../middlewares/validate');
const requireLead = require('../middlewares/requireLead');
const { createActivityAssignmentSchema } = require('../validators/activityAssignmentValidator');
const { activityAssignmentListQuerySchema } = require('../validators/queryValidator');

const router = express.Router();

router.get('/', validate.query(activityAssignmentListQuerySchema), activityAssignmentController.getAll);
router.post('/', requireLead, validate(createActivityAssignmentSchema), activityAssignmentController.create);
router.delete('/:id', requireLead, activityAssignmentController.remove);

module.exports = router;
