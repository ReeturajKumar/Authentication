// Creates the administrator account from ADMIN_EMAIL / ADMIN_PASSWORD in server/.env.
//   npm run setup-admin                 (uses .env; prompts for the password, hidden, if ADMIN_PASSWORD is unset)
//   npm run setup-admin -- <email>      (overrides ADMIN_EMAIL)
const readline = require('readline');
const db = require('../src/config/database');
const User = require('../src/models/User');
const passwords = require('../src/services/password.service');
const { passwordPolicyError } = require('../src/validators/auth.validator');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.startsWith(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

async function main() {
  const username = (process.argv[2] || process.env.ADMIN_EMAIL || 'admin').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await askHidden(`Password for administrator "${username}": `);
    if (password !== await askHidden('Confirm password: ')) throw new Error('Passwords do not match');
  }
  const policy = passwordPolicyError(password, username);
  if (policy) throw new Error(policy);

  await db.connect();
  if (await User.exists({ username })) throw new Error(`User "${username}" already exists`);
  await User.create({ username, role: 'Administrator', passwordHash: await passwords.hash(password) });
  console.log(`Administrator "${username}" created.`);
}

main()
  .catch((err) => { console.error(`setup-admin failed: ${err.message}`); process.exitCode = 1; })
  .finally(() => db.disconnect());
