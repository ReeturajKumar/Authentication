const isString = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const bad = (res, error) => res.status(400).json({ error });

// Returns an error message, or null when the password meets policy.
function passwordPolicyError(password, username = '') {
  if (password.length < 12) return 'Password must be at least 12 characters';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes'; // bcrypt input limit
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) return 'Password must contain at least 3 of: lowercase, uppercase, digit, symbol';
  if (username && password.toLowerCase().includes(username.toLowerCase())) return 'Password must not contain your email';
  return null;
}

function validateLogin(req, res, next) {
  const { username, password } = req.body ?? {};
  if (!isString(username, 1, 254) || !isString(password, 1, 256)) return bad(res, 'Email and password are required');
  next();
}

function validateChangePassword(req, res, next) {
  const { newPassword, confirmPassword } = req.body ?? {};
  if (!isString(newPassword, 1, 256) || !isString(confirmPassword, 1, 256)) {
    return bad(res, 'New password and confirmation are required');
  }
  if (newPassword !== confirmPassword) return bad(res, 'Passwords do not match');
  const policy = passwordPolicyError(newPassword, req.user.username);
  if (policy) return bad(res, policy);
  next();
}

module.exports = { validateLogin, validateChangePassword, passwordPolicyError };
