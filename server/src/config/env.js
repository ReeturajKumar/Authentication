const fs = require('fs');
const path = require('path');

// Node >= 20.12 reads .env natively; no dotenv dependency needed.
const envFile = path.join(__dirname, '../../.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function int(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? fallback, 10);
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid integer for ${name}`);
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

const env = {
  nodeEnv,
  host: process.env.HOST || '127.0.0.1',
  port: int('PORT', 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/scada_auth?directConnection=true',
  bcryptRounds: int('BCRYPT_ROUNDS', 12),
  sessionTtlMinutes: int('SESSION_TTL_MINUTES', 480),
  restrictedSessionTtlMinutes: int('RESTRICTED_SESSION_TTL_MINUTES', 15),
  cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4000,http://127.0.0.1:4000')
    .split(',').map((o) => o.trim()).filter(Boolean),
  loginRateLimit: int('LOGIN_RATE_LIMIT', 20),
  apiRateLimit: int('API_RATE_LIMIT', 600),
  maxFailedLogins: int('MAX_FAILED_LOGINS', 5),
  lockoutMinutes: int('LOCKOUT_MINUTES', 15),
};

if (nodeEnv === 'production' && env.bcryptRounds < 12) {
  throw new Error('BCRYPT_ROUNDS must be at least 12 in production');
}

// __Host- prefix forces Secure + Path=/ + no Domain, but only works over HTTPS.
env.cookieName = env.cookieSecure ? '__Host-scada_sid' : 'scada_sid';

module.exports = env;
