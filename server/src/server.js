const env = require('./config/env');
const db = require('./config/database');
const { createApp } = require('./app');

async function main() {
  await db.connect();
  console.log(`[db] connected (transactions ${db.supportsTransactions() ? 'enabled' : 'unavailable: standalone mongod'})`);

  const server = createApp().listen(env.port, env.host, () => {
    console.log(`[server] listening on http://${env.host}:${env.port}`);
  });

  const shutdown = () => server.close(() => db.disconnect().then(() => process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(`[server] failed to start: ${err.message}`);
  process.exit(1);
});
