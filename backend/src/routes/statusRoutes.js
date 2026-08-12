const express = require('express');
const statusController = require('../controllers/statusController');
const validate = require('../middlewares/validate');
const { statusQuerySchema } = require('../validators/queryValidator');

const router = express.Router();

router.get('/', validate.query(statusQuerySchema), statusController.get);

module.exports = router;
