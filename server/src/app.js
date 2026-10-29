const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const authenticate = require('./middleware/authenticate');
const requirePasswordChange = require('./middleware/requirePasswordChange');
const { verifyOrigin } = require('./middleware/csrf');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');

// Simulated, read-only plant data. This demo never talks to PLCs or sends commands.
function scadaOverview(req, res) {
  res.json({
    simulated: true,
    operator: req.user.username,
    tags: [
      { name: 'Reservoir level', value: 72.4, unit: '%', state: 'normal' },
      { name: 'Pump P-101', value: 'RUNNING', unit: '', state: 'normal' },
      { name: 'Line pressure', value: 4.8, unit: 'bar', state: 'normal' },
      { name: 'Chlorine residual', value: 0.3, unit: 'mg/L', state: 'warning' },
    ],
  });
}

function errorHandler(err, _req, res, _next) {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err.status && err.status < 500 && err.expose !== false) {
    return res.status(err.status).json({ error: err.message, ...(err.code && { code: err.code }) });
  }
  // Internal details (DB errors, credentials in URIs) stay in the server log only.
  console.error(`[error] ${err.name}: ${err.message}`);
  const dbDown = /Mongo(Server|Network|NotConnected)|Topology|not connected|buffering timed out/i.test(`${err.name} ${err.message}`);
  return res.status(dbDown ? 503 : 500).json({
    error: dbDown ? 'Service temporarily unavailable. No changes were confirmed.' : 'Internal server error',
  });
}

function createApp() {
  const app = express();
  app.set('trust proxy', false); // bound to localhost; never trust X-Forwarded-For by default

  app.use(helmet());
  app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: env.apiRateLimit, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use('/api', verifyOrigin);

  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.get('/api/scada/overview', authenticate, requirePasswordChange, scadaOverview);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built client (npm run build in client/) so production is a single offline process.
  const dist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
