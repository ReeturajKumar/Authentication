const { Schema, model } = require('mongoose');

const sessionSchema = new Schema(
  {
    // SHA-256 of the cookie token; the raw token is never stored.
    tokenHash: { type: String, required: true, unique: true, match: /^[a-f0-9]{64}$/ },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Restricted sessions may only call /me, /logout and /change-password.
    restricted: { type: Boolean, default: false },
    csrfToken: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 }, // TTL index purges expired rows
    revokedAt: { type: Date, default: null },
    revokeReason: {
      type: String, default: null,
      enum: [null, 'logout', 'password_reset', 'password_change', 'superseded', 'invalid'],
    },
  },
  { timestamps: true },
);

module.exports = model('Session', sessionSchema);
