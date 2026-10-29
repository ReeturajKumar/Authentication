const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const authenticate = require('../middleware/authenticate');
const { requireCsrfToken } = require('../middleware/csrf');
const { validateLogin, validateChangePassword } = require('../validators/auth.validator');
const controller = require('../controllers/auth.controller');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.loginRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again later.' },
});

// No registration endpoint by design: accounts come only from the setup/seed scripts.
router.post('/login', loginLimiter, validateLogin, controller.login);
router.post('/logout', authenticate, requireCsrfToken, controller.logout);
router.get('/me', authenticate, controller.me);
// Reachable from a restricted session — this is the only thing a temporary password unlocks.
router.post('/change-password', authenticate, requireCsrfToken, validateChangePassword, controller.changePassword);

module.exports = router;
