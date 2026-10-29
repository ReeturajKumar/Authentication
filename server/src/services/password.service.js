const crypto = require('crypto');
const bcrypt = require('bcrypt');
const env = require('../config/env');

const hash = (password) => bcrypt.hash(password, env.bcryptRounds);
const verify = (password, passwordHash) => bcrypt.compare(password, passwordHash);

// 18 random bytes -> 24 URL-safe chars (~144 bits of entropy).
const generateTemporaryPassword = () => crypto.randomBytes(18).toString('base64url');

// Compared against when the username does not exist, so response time doesn't reveal valid usernames.
let dummyHash;
async function burnUnknownUser(password) {
  dummyHash ??= await hash(crypto.randomBytes(16).toString('hex'));
  await verify(password, dummyHash);
}

module.exports = { hash, verify, generateTemporaryPassword, burnUnknownUser };
