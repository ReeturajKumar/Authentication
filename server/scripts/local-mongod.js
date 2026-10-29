// Dev convenience for machines without a MongoDB service: runs the mongod binary that
// `npm install` already cached (via mongodb-memory-server) as a persistent single-node replica set
// on 127.0.0.1:27017, with data in server/data/db. Fully offline once installed.
// Production should use a properly installed MongoDB service instead (see README).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const { MongoBinary } = require('mongodb-memory-server');

const PORT = 27017;
const dbPath = path.join(__dirname, '../data/db');

async function initiateReplicaSet() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const conn = await mongoose.createConnection(`mongodb://127.0.0.1:${PORT}/?directConnection=true`).asPromise();
      try {
        await conn.db.admin().command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: `127.0.0.1:${PORT}` }] } });
        console.log('[local-mongod] replica set rs0 initiated (transactions enabled)');
      } catch (err) {
        if (err.codeName !== 'AlreadyInitialized') throw err;
      } finally {
        await conn.close();
      }
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('mongod did not become ready');
}

async function main() {
  fs.mkdirSync(dbPath, { recursive: true });
  const binary = await MongoBinary.getPath(); // resolves from local cache; no download if cached
  const mongod = spawn(binary, ['--dbpath', dbPath, '--bind_ip', '127.0.0.1', '--port', String(PORT), '--replSet', 'rs0', '--quiet'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  mongod.on('exit', (code) => process.exit(code ?? 0));
  process.on('SIGINT', () => mongod.kill('SIGINT'));
  process.on('SIGTERM', () => mongod.kill('SIGTERM'));
  await initiateReplicaSet();
  console.log(`[local-mongod] running on 127.0.0.1:${PORT}, data in ${dbPath}. Ctrl+C to stop.`);
}

main().catch((err) => { console.error(`[local-mongod] ${err.message}`); process.exit(1); });
