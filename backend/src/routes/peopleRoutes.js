const express = require('express');
const peopleController = require('../controllers/peopleController');
const validate = require('../middlewares/validate');
const { statusQuerySchema, personCalendarQuerySchema } = require('../validators/queryValidator');

const router = express.Router();

// Той самий date/at-контракт з дефолтами "сьогодні"/"зараз", що й /status.
router.get('/', validate.query(statusQuerySchema), peopleController.get);
router.get('/:id/calendar', validate.query(personCalendarQuerySchema), peopleController.getCalendar);

module.exports = router;
