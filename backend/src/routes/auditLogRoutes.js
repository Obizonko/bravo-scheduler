const express = require('express');
const auditLogController = require('../controllers/auditLogController');
const { requireSuperAdmin } = require('../middlewares/requireLead');

const router = express.Router();

// Лише супер-адмін - лог дій не для очей звичайних адмінів чи учасників.
router.get('/', requireSuperAdmin, auditLogController.getAll);

module.exports = router;
