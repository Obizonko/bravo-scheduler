const express = require('express');
const userRoutes = require('./userRoutes');
const shiftRoutes = require('./shiftRoutes');
const scheduleRoutes = require('./scheduleRoutes');
const masterPlanRoutes = require('./masterPlanRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

router.use('/users', userRoutes);
router.use('/shifts', shiftRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/master-plan', masterPlanRoutes);

module.exports = router;
