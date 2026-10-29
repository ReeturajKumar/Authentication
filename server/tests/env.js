// Jest setup: test config + an offline guard that fails any non-loopback TCP connection,
// proving the whole suite (auth, reset, MongoDB) runs without internet access.
const net = require('net');

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4'; // fast tests; production enforces >= 12
process.env.LOGIN_RATE_LIMIT = '1000';
process.env.API_RATE_LIMIT = '10000';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const originalConnect = net.Socket.prototype.connect;

net.Socket.prototype.connect = function guardedConnect(...args) {
  const opts = Array.isArray(args[0]) ? args[0][0] : (typeof args[0] === 'object' ? args[0] : { port: args[0], host: args[1] });
  const host = opts?.host ?? 'localhost';
  if (opts?.path === undefined && !LOOPBACK.has(host)) {
    throw new Error(`Offline guard: blocked outbound connection to ${host}`);
  }
  return originalConnect.apply(this, args);
};
