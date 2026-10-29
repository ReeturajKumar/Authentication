const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);
// Fail fast when the DB is down instead of queueing requests for the default 10s.
mongoose.set('bufferTimeoutMS', 3000);

let transactions = false;

async function connect(uri = env.mongoUri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Transactions need a replica set (or sharded cluster).
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  transactions = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  const models = [require('../models/User'), require('../models/Session'), require('../models/AuditEvent')];
  await Promise.all(models.map((m) => m.init())); // build unique/TTL indexes before serving
  return mongoose.connection;
}

function disconnect() {
  return mongoose.disconnect();
}

const supportsTransactions = () => transactions;

module.exports = { connect, disconnect, supportsTransactions };
