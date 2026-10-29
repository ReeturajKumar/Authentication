// Blocks every regular API while a password change is pending. Checks both the restricted session
// flag and the live user record, so neither can be bypassed on its own.
function requirePasswordChange(req, res, next) {
  if (req.authSession?.restricted || req.user?.mustChangePassword) {
    return res.status(403).json({ error: 'Password change required', code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

module.exports = requirePasswordChange;
