const { Schema, model } = require('mongoose');

const ROLES = ['Administrator', 'Employee'];

const userSchema = new Schema(
  {
    username: {
      type: String, required: true, unique: true, trim: true, lowercase: true,
      // Email address (or plain username): letters, digits and . _ - + @
      minlength: 3, maxlength: 254, match: /^[a-z0-9._+@-]+$/,
    },
    // Only ever a bcrypt hash; excluded from queries unless explicitly selected.
    passwordHash: { type: String, required: true, select: false, match: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/ },
    role: { type: String, enum: ROLES, required: true },
    mustChangePassword: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    // Sessions created before this instant are rejected (defense in depth on top of revocation).
    passwordChangedAt: { type: Date, default: Date.now },
    failedLoginCount: { type: Number, default: 0, min: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => ({
    id: String(ret._id),
    username: ret.username,
    role: ret.role,
    mustChangePassword: ret.mustChangePassword,
    status: ret.status,
    passwordChangedAt: ret.passwordChangedAt,
    createdAt: ret.createdAt,
  }),
});

module.exports = model('User', userSchema);
module.exports.ROLES = ROLES;
