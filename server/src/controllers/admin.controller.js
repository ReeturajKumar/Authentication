const User = require('../models/User');
const auth = require('../services/auth.service');

async function listEmployees(_req, res) {
  const employees = await User.find({ role: 'Employee' }).sort({ username: 1 }).limit(500);
  res.json({ employees });
}

async function resetPassword(req, res) {
  const { employee, temporaryPassword } = await auth.resetEmployeePassword(
    req.user, req.params.id, req.body.confirmUsername, req.ip,
  );
  // The only place the temporary password ever leaves the server. Never logged or stored in plaintext.
  res.json({ employee, temporaryPassword });
}

module.exports = { listEmployees, resetPassword };
