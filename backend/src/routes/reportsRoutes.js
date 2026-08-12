const express = require('express');
const reportsController = require('../controllers/reportsController');
const validate = require('../middlewares/validate');
const { conflictsQuerySchema } = require('../validators/queryValidator');

const router = express.Router();

router.get('/conflicts', validate.query(conflictsQuerySchema), reportsController.conflicts);

module.exports = router;
