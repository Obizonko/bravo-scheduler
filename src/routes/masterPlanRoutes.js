const express = require('express');
const masterPlanController = require('../controllers/masterPlanController');
const validate = require('../middlewares/validate');
const {
  createMasterPlanSchema,
  updateMasterPlanSchema,
} = require('../validators/masterPlanValidator');

const router = express.Router();

router.get('/', masterPlanController.getAll);
router.get('/:id', masterPlanController.getById);
router.post('/', validate(createMasterPlanSchema), masterPlanController.create);
router.put('/:id', validate(updateMasterPlanSchema), masterPlanController.update);
router.delete('/:id', masterPlanController.remove);

module.exports = router;
