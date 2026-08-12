const express = require('express');
const scheduleController = require('../controllers/scheduleController');
const validate = require('../middlewares/validate');
const requireLead = require('../middlewares/requireLead');
const {
  createScheduleSchema,
  updateStatusSchema,
  substitutionSchema,
} = require('../validators/scheduleValidator');
const { scheduleListQuerySchema, timelineQuerySchema } = require('../validators/queryValidator');

const router = express.Router();

// /timeline МАЄ бути зареєстрований перед /:id, інакше Express звʼяже літерал
// 'timeline' з параметром :id, і findById() відхилить його як невалідний ObjectId.
router.get('/timeline', validate.query(timelineQuerySchema), scheduleController.getTimeline);
router.get('/', validate.query(scheduleListQuerySchema), scheduleController.getAll);
router.get('/:id', scheduleController.getById);
// Dry-run перевірка відкрита всім - без неї сторінки Склад/ТЕЦ не змогли б показати
// попередження до входу адміна.
router.post('/check', validate(createScheduleSchema), scheduleController.check);
// Саме призначення - дія адміна (Q3: звичайні відвідувачі бачать лише перегляд).
router.post('/', requireLead, validate(createScheduleSchema), scheduleController.assign);
// "Потрібна заміна" - самообслуговування будь-кого, хто на зміні, PIN не потрібен.
router.post(
  '/:id/substitution',
  validate(substitutionSchema),
  scheduleController.requestSubstitution
);
router.patch('/:id/status', requireLead, validate(updateStatusSchema), scheduleController.updateStatus);
router.delete('/:id', requireLead, scheduleController.remove);

module.exports = router;
