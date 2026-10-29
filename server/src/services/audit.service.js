const AuditEvent = require('../models/AuditEvent');

// Best-effort audit for events where failure to log must not change the outcome (e.g. a failed login).
// Security-critical events (reset/change) are written inside the same unit of work instead.
async function record(event) {
  try {
    await AuditEvent.create(event);
  } catch (err) {
    console.error(`[audit] failed to record ${event.type}: ${err.message}`);
  }
}

const actorFields = (user) => ({ actor: user?._id ?? null, actorUsername: user?.username ?? null });
const targetFields = (user) => ({ target: user?._id ?? null, targetUsername: user?.username ?? null });

module.exports = { record, actorFields, targetFields };
