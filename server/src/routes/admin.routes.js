const { Router } = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const requirePasswordChange = require('../middleware/requirePasswordChange');
const { requireCsrfToken } = require('../middleware/csrf');
const { validateResetPassword } = require('../validators/admin.validator');
const controller = require('../controllers/admin.controller');

const router = Router();

router.use(authenticate, requirePasswordChange, authorize('Administrator'), requireCsrfToken);
router.get('/employees', controller.listEmployees);
router.post('/employees/:id/reset-password', validateResetPassword, controller.resetPassword);

module.exports = router;
