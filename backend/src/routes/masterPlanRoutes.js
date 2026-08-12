const express = require('express');
const masterPlanController = require('../controllers/masterPlanController');
const validate = require('../middlewares/validate');
const requireLead = require('../middlewares/requireLead');
const {
  createMasterPlanSchema,
  updateMasterPlanSchema,
} = require('../validators/masterPlanValidator');

const router = express.Router();

router.get('/', masterPlanController.getAll);
router.get('/:id', masterPlanController.getById);
router.post('/', requireLead, validate(createMasterPlanSchema), masterPlanController.create);
router.put('/:id', requireLead, validate(updateMasterPlanSchema), masterPlanController.update);
router.delete('/:id', requireLead, masterPlanController.remove);

module.exports = router;
