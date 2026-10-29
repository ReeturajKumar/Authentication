const env = require('../config/env');
const { safeEqual } = require('../utils/http');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const reject = (res) => res.status(403).json({ error: 'CSRF validation failed' });

// Layer 1 (all state-changing requests, incl. login): trusted Origin + JSON body.
// A cross-site form can't send application/json, and cross-site fetch would need CORS, which is not enabled.
function verifyOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin && !env.allowedOrigins.includes(origin)) return reject(res);
  if (!req.is('application/json')) return reject(res);
  next();
}

// Layer 2 (authenticated requests): synchronizer token bound to the server-side session.
function requireCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const token = req.get('x-csrf-token');
  if (!token || !req.authSession || !safeEqual(token, req.authSession.csrfToken)) return reject(res);
  next();
}

module.exports = { verifyOrigin, requireCsrfToken };
