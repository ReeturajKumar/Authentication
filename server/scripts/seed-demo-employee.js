// Creates the employee account from EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD in server/.env.
// The password is stored as a bcrypt hash and treated like a temporary password:
// the employee must change it at first sign-in, so the plaintext copy in .env stops working.
const db = require('../src/config/database');
const User = require('../src/models/User');
const passwords = require('../src/services/password.service');
const { passwordPolicyError } = require('../src/validators/auth.validator');

async function main() {
  const username = process.env.EMPLOYEE_EMAIL?.trim().toLowerCase();
  const password = process.env.EMPLOYEE_PASSWORD;
  if (!username || !password) throw new Error('Set EMPLOYEE_EMAIL and EMPLOYEE_PASSWORD in server/.env');
  const policy = passwordPolicyError(password, username);
  if (policy) throw new Error(`EMPLOYEE_PASSWORD: ${policy}`);

  await db.connect();
  if (await User.exists({ username })) {
    console.log(`skip   ${username} (exists)`);
    return;
  }
  await User.create({ username, role: 'Employee', passwordHash: await passwords.hash(password), mustChangePassword: true });
  console.log(`create ${username}`);
}

main()
  .catch((err) => { console.error(`seed failed: ${err.message}`); process.exitCode = 1; })
  .finally(() => db.disconnect());
