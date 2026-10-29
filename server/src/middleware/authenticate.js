const env = require('../config/env');
const User = require('../models/User');
const auth = require('../services/auth.service');

const unauthorized = (res) => res.clearCookie(env.cookieName, { path: '/' })
  .status(401).json({ error: 'Authentication required' });

// Resolves the session cookie to a live session + user. Role and identity come only from the DB.
async function authenticate(req, res, next) {
  const token = req.cookies?.[env.cookieName];
  if (typeof token !== 'string' || token.length > 128) return unauthorized(res);

  const session = await auth.findActiveSession(token);
  if (!session) return unauthorized(res);

  const user = await User.findById(session.user);
  if (!user || user.status !== 'active' || session.createdAt < user.passwordChangedAt) {
    await auth.revokeSession(token, 'invalid');
    return unauthorized(res);
  }

  req.authSession = session;
  req.sessionToken = token;
  req.user = user;
  next();
}

module.exports = authenticate;
