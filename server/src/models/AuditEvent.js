const { Schema, model } = require('mongoose');

const auditEventSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorUsername: { type: String, default: null },
    target: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    targetUsername: { type: String, default: null },
    type: { type: String, required: true, enum: ['LOGIN', 'LOGOUT', 'PASSWORD_RESET', 'PASSWORD_CHANGE'] },
    outcome: { type: String, required: true, enum: ['success', 'failure'] },
    // Strict sub-schema: only these keys can ever be stored, so credentials cannot leak in here.
    metadata: {
      ip: { type: String, maxlength: 64 },
      reason: {
        type: String,
        enum: ['invalid_credentials', 'locked', 'disabled', 'invalid_target', 'conflict', 'error'],
      },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditEventSchema.index({ createdAt: -1 });

module.exports = model('AuditEvent', auditEventSchema);
