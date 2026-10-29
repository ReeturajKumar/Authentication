// Must run after authenticate: req.user.role is loaded from the database, never from the client.
const authorize = (...roles) => (req, res, next) => (
  roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' })
);

module.exports = authorize;
