function validateResetPassword(req, res, next) {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid employee id' });
  const { confirmUsername } = req.body ?? {};
  if (typeof confirmUsername !== 'string' || confirmUsername.length < 1 || confirmUsername.length > 254) {
    return res.status(400).json({ error: 'confirmUsername is required' });
  }
  next();
}

module.exports = { validateResetPassword };
