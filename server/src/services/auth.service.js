const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const db = require('../config/database');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditEvent = require('../models/AuditEvent');
const passwords = require('./password.service');
const audit = require('./audit.service');
const { HttpError, sha256 } = require('../utils/http');

const INVALID_LOGIN = 'Invalid username or password';

// Runs `work` atomically when the deployment supports transactions; otherwise sequentially.
// Without transactions, ordering + passwordChangedAt checks keep partial failures safe (see README).
async function unitOfWork(work) {
  if (!db.supportsTransactions()) return work(null);
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

// ---------- sessions ----------

async function createSession(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  const restricted = user.mustChangePassword;
  const ttl = restricted ? env.restrictedSessionTtlMinutes : env.sessionTtlMinutes;
  const session = await Session.create({
    tokenHash: sha256(token),
    user: user._id,
    restricted,
    csrfToken: crypto.randomBytes(32).toString('base64url'),
    expiresAt: new Date(Date.now() + ttl * 60_000),
  });
  return { token, session };
}

function findActiveSession(token) {
  return Session.findOne({ tokenHash: sha256(token), revokedAt: null, expiresAt: { $gt: new Date() } });
}

function revokeSession(token, reason) {
  return Session.updateOne(
    { tokenHash: sha256(token), revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } },
  );
}

function revokeUserSessions(userId, reason, dbSession) {
  return Session.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokeReason: reason } },
    { session: dbSession },
  );
}

// ---------- login ----------

async function login(username, password, ip) {
  const user = await User.findOne({ username: username.trim().toLowerCase() })
    .select('+passwordHash +failedLoginCount +lockedUntil');

  if (!user) {
    await passwords.burnUnknownUser(password);
    await audit.record({ type: 'LOGIN', outcome: 'failure', metadata: { ip, reason: 'invalid_credentials' } });
    throw new HttpError(401, INVALID_LOGIN);
  }

  const fail = async (reason) => {
    await audit.record({ ...audit.actorFields(user), type: 'LOGIN', outcome: 'failure', metadata: { ip, reason } });
    throw new HttpError(401, INVALID_LOGIN); // same message for every failure cause
  };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await passwords.burnUnknownUser(password);
    return fail('locked');
  }

  if (!(await passwords.verify(password, user.passwordHash))) {
    // Atomic increment; lock and reset the counter once the threshold is reached.
    const next = { $add: ['$failedLoginCount', 1] };
    const hitLimit = { $gte: [next, env.maxFailedLogins] };
    await User.updateOne({ _id: user._id }, [{
      $set: {
        lockedUntil: { $cond: [hitLimit, new Date(Date.now() + env.lockoutMinutes * 60_000), '$lockedUntil'] },
        failedLoginCount: { $cond: [hitLimit, 0, next] },
      },
    }]);
    return fail('invalid_credentials');
  }

  if (user.status !== 'active') return fail('disabled');

  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockedUntil: null } });
  await audit.record({ ...audit.actorFields(user), type: 'LOGIN', outcome: 'success', metadata: { ip } });
  return user;
}

// ---------- password change (by the user) ----------

async function changePassword(user, newPassword, ip) {
  const current = await User.findById(user._id).select('+passwordHash');
  if (await passwords.verify(newPassword, current.passwordHash)) {
    throw new HttpError(400, 'New password must be different from the current password');
  }
  const passwordHash = await passwords.hash(newPassword);
  const now = new Date();

  const updated = await unitOfWork(async (session) => {
    // Filtering on the old hash makes this a compare-and-swap: a concurrent admin reset wins cleanly.
    const doc = await User.findOneAndUpdate(
      { _id: user._id, passwordHash: current.passwordHash },
      { $set: { passwordHash, mustChangePassword: false, passwordChangedAt: now } },
      { new: true, runValidators: true, session },
    );
    if (!doc) return null;
    await revokeUserSessions(user._id, 'password_change', session);
    await AuditEvent.create([{
      ...audit.actorFields(user), ...audit.targetFields(user),
      type: 'PASSWORD_CHANGE', outcome: 'success', metadata: { ip },
    }], { session });
    return doc;
  });

  if (!updated) {
    await audit.record({ ...audit.actorFields(user), type: 'PASSWORD_CHANGE', outcome: 'failure', metadata: { ip, reason: 'conflict' } });
    throw new HttpError(409, 'Your password was changed by another request. Please log in again.');
  }
  return updated;
}

// ---------- password reset (by an administrator) ----------

async function resetEmployeePassword(admin, employeeId, confirmUsername, ip) {
  const temporaryPassword = passwords.generateTemporaryPassword();
  const passwordHash = await passwords.hash(temporaryPassword);
  const now = new Date();

  const employee = await unitOfWork(async (session) => {
    // role: 'Employee' in the filter is what stops an admin resetting another admin (or themself).
    const doc = await User.findOneAndUpdate(
      { _id: employeeId, username: confirmUsername.trim().toLowerCase(), role: 'Employee' },
      { $set: { passwordHash, mustChangePassword: true, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null } },
      { new: true, runValidators: true, session },
    );
    if (!doc) return null;
    await revokeUserSessions(doc._id, 'password_reset', session);
    await AuditEvent.create([{
      ...audit.actorFields(admin), ...audit.targetFields(doc),
      type: 'PASSWORD_RESET', outcome: 'success', metadata: { ip },
    }], { session });
    return doc;
  });

  if (!employee) {
    await audit.record({ ...audit.actorFields(admin), type: 'PASSWORD_RESET', outcome: 'failure', metadata: { ip, reason: 'invalid_target' } });
    throw new HttpError(404, 'Employee not found');
  }
  return { employee, temporaryPassword };
}

module.exports = {
  createSession, findActiveSession, revokeSession, revokeUserSessions,
  login, changePassword, resetEmployeePassword,
};
