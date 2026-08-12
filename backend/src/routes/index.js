const express = require('express');
const userRoutes = require('./userRoutes');
const shiftRoutes = require('./shiftRoutes');
const scheduleRoutes = require('./scheduleRoutes');
const masterPlanRoutes = require('./masterPlanRoutes');
const statusRoutes = require('./statusRoutes');
const reportsRoutes = require('./reportsRoutes');
const authRoutes = require('./authRoutes');
const peopleRoutes = require('./peopleRoutes');
const activityAssignmentRoutes = require('./activityAssignmentRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK', timestamp: new Date().toISOString() });
});

router.use('/users', userRoutes);
router.use('/shifts', shiftRoutes);
router.use('/schedule', scheduleRoutes);
router.use('/master-plan', masterPlanRoutes);
router.use('/status', statusRoutes);
router.use('/reports', reportsRoutes);
router.use('/auth', authRoutes);
router.use('/people', peopleRoutes);
router.use('/activity-assignments', activityAssignmentRoutes);

module.exports = router;
