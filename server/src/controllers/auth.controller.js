const env = require('../config/env');
const auth = require('../services/auth.service');
const audit = require('../services/audit.service');

const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'strict',
  path: '/',
  maxAge: maxAgeMs,
});

async function login(req, res) {
  const user = await auth.login(req.body.username, req.body.password, req.ip);

  // Session regeneration: whatever session the browser had is revoked, a fresh random id is issued.
  const previous = req.cookies?.[env.cookieName];
  if (typeof previous === 'string') await auth.revokeSession(previous, 'superseded');

  const { token, session } = await auth.createSession(user);
  res.cookie(env.cookieName, token, cookieOptions(session.expiresAt - Date.now()));
  res.json({ user, csrfToken: session.csrfToken, passwordChangeRequired: session.restricted });
}

async function logout(req, res) {
  await auth.revokeSession(req.sessionToken, 'logout');
  await audit.record({ ...audit.actorFields(req.user), type: 'LOGOUT', outcome: 'success', metadata: { ip: req.ip } });
  res.clearCookie(env.cookieName, { path: '/' }).json({ ok: true });
}

function me(req, res) {
  res.json({
    user: req.user,
    csrfToken: req.authSession.csrfToken,
    passwordChangeRequired: req.authSession.restricted || req.user.mustChangePassword,
  });
}

async function changePassword(req, res) {
  await auth.changePassword(req.user, req.body.newPassword, req.ip);
  // All sessions (including this restricted one) are revoked; the user must log in fresh.
  res.clearCookie(env.cookieName, { path: '/' })
    .json({ ok: true, message: 'Password changed. Please log in with your new password.' });
}

module.exports = { login, logout, me, changePassword };
