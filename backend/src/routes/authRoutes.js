const express = require('express');
const authController = require('../controllers/authController');
const validate = require('../middlewares/validate');
const { pinSchema } = require('../validators/authValidator');

const router = express.Router();

router.post('/pin', validate(pinSchema), authController.verifyPin);

module.exports = router;
