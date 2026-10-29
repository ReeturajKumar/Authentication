const net = require('net');
const request = require('supertest');
const bcrypt = require('bcrypt');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const db = require('../src/config/database');
const { createApp } = require('../src/app');
const User = require('../src/models/User');
const Session = require('../src/models/Session');
const AuditEvent = require('../src/models/AuditEvent');
const passwords = require('../src/services/password.service');

const ADMIN_PW = 'Admin-Passw0rd!x';
const EMP_PW = 'Employee-Passw0rd!';
const NEW_PW = 'Fresh-Plant-Key-42';

let rs;
let uri;
let app;
let ids;

async function login(username, password) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  return { agent, res, csrf: res.body.csrfToken, cookie: res.headers['set-cookie'] };
}

async function reset(adminLogin, employeeId, confirmUsername) {
  return adminLogin.agent.post(`/api/admin/employees/${employeeId}/reset-password`)
    .set('X-CSRF-Token', adminLogin.csrf).send({ confirmUsername });
}

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  uri = rs.getUri('scada_test');
  await db.connect(uri);
  app = createApp();
});

afterAll(async () => {
  await db.disconnect();
  await rs.stop();
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Session.deleteMany({}), AuditEvent.deleteMany({})]);
  const mk = async (username, role, password, extra = {}) =>
    (await User.create({ username, role, passwordHash: await passwords.hash(password), ...extra }))._id;
  ids = {
    admin: await mk('admin', 'Administrator', ADMIN_PW),
    admin2: await mk('admin2', 'Administrator', ADMIN_PW),
    emp: await mk('operator1', 'Employee', EMP_PW),
    emp2: await mk('operator2', 'Employee', EMP_PW),
    disabled: await mk('operator3', 'Employee', EMP_PW, { status: 'disabled' }),
  };
});

afterEach(() => jest.restoreAllMocks());

describe('environment', () => {
  test('runs with no internet: outbound non-loopback connections are blocked', () => {
    expect(() => net.connect(80, '203.0.113.10')).toThrow(/Offline guard/);
  });

  test('replica set detected so reset/change use transactions', () => {
    expect(db.supportsTransactions()).toBe(true);
  });
});

describe('login', () => {
  test('succeeds with valid credentials and sets a hardened session cookie', async () => {
    const { res } = await login('admin', ADMIN_PW);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'admin', role: 'Administrator' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    const stored = await Session.findOne({ user: ids.admin });
    expect(cookie).not.toContain(stored.tokenHash); // only the hash is stored
  });

  test('fails with a generic message for wrong password, unknown user and disabled account', async () => {
    const results = await Promise.all([
      login('admin', 'wrong-password'), login('nobody', EMP_PW), login('operator3', EMP_PW),
    ]);
    for (const { res } of results) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Invalid username or password' });
    }
  });

  test('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await login('operator1', 'wrong-password');
    expect((await login('operator1', EMP_PW)).res.status).toBe(401);
  });

  test('rejects invalid payloads and there is no registration endpoint', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: { $gt: '' }, password: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ username: 'a'.repeat(20000), password: 'x' })).status).toBe(413);
    expect((await request(app).post('/api/auth/register').send({ username: 'x', password: 'y' })).status).toBe(404);
  });

  test('regenerates the session id on login and revokes the previous one', async () => {
    const first = await login('admin', ADMIN_PW);
    await first.agent.post('/api/auth/login').send({ username: 'admin', password: ADMIN_PW });
    expect((await request(app).get('/api/auth/me').set('Cookie', first.cookie)).status).toBe(401);
  });
});

describe('administrator password reset', () => {
  test('admin resets an employee: hashed temp password, flag set, audited', async () => {
    const admin = await login('admin', ADMIN_PW);
    const res = await reset(admin, ids.emp, 'operator1');
    expect(res.status).toBe(200);
    const temp = res.body.temporaryPassword;
    expect(temp).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(res.headers['cache-control']).toBe('no-store');

    const user = await User.findById(ids.emp).select('+passwordHash');
    expect(user.passwordHash).not.toBe(temp);
    expect(user.passwordHash).toMatch(/^\$2b\$/);
    expect(await bcrypt.compare(temp, user.passwordHash)).toBe(true);
    expect(user.mustChangePassword).toBe(true);
    expect(await AuditEvent.countDocuments({ type: 'PASSWORD_RESET', outcome: 'success', target: ids.emp })).toBe(1);
  });

  test('requires the confirmed username to match the target', async () => {
    const admin = await login('admin', ADMIN_PW);
    expect((await reset(admin, ids.emp, 'operator2')).status).toBe(404);
    expect((await User.findById(ids.emp)).mustChangePassword).toBe(false);
  });

  test('cannot be used against administrators (no privilege escalation)', async () => {
    const admin = await login('admin', ADMIN_PW);
    expect((await reset(admin, ids.admin2, 'admin2')).status).toBe(404);
    expect((await reset(admin, ids.admin, 'admin')).status).toBe(404);
  });

  test('employee cannot list employees or reset another employee', async () => {
    const emp = await login('operator1', EMP_PW);
    expect((await emp.agent.get('/api/admin/employees')).status).toBe(403);
    expect((await reset(emp, ids.emp2, 'operator2')).status).toBe(403);
    expect((await request(app).post(`/api/admin/employees/${ids.emp2}/reset-password`).send({ confirmUsername: 'operator2' })).status).toBe(401);
    expect((await User.findById(ids.emp2)).mustChangePassword).toBe(false);
  });

  test('revokes all existing employee sessions', async () => {
    const empA = await login('operator1', EMP_PW);
    const empB = await login('operator1', EMP_PW);
    expect((await empA.agent.get('/api/scada/overview')).status).toBe(200);
    await reset(await login('admin', ADMIN_PW), ids.emp, 'operator1');
    expect((await empA.agent.get('/api/scada/overview')).status).toBe(401);
    expect((await empB.agent.get('/api/auth/me')).status).toBe(401);
    expect(await Session.countDocuments({ user: ids.emp, revokedAt: null })).toBe(0);
  });

  test('employee list exposes no password data', async () => {
    const admin = await login('admin', ADMIN_PW);
    const res = await admin.agent.get('/api/admin/employees');
    expect(res.status).toBe(200);
    expect(res.body.employees.map((e) => e.username)).toEqual(['operator1', 'operator2', 'operator3']);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$|failedLogin|locked/);
  });
});

describe('forced password change', () => {
  let temp;
  beforeEach(async () => {
    temp = (await reset(await login('admin', ADMIN_PW), ids.emp, 'operator1')).body.temporaryPassword;
  });

  test('temporary password yields only a restricted session', async () => {
    const emp = await login('operator1', temp);
    expect(emp.res.status).toBe(200);
    expect(emp.res.body.passwordChangeRequired).toBe(true);
    expect((await emp.agent.get('/api/auth/me')).status).toBe(200);
    const blocked = await emp.agent.get('/api/scada/overview');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('validates new password and confirmation', async () => {
    const emp = await login('operator1', temp);
    const change = (body) => emp.agent.post('/api/auth/change-password').set('X-CSRF-Token', emp.csrf).send(body);
    expect((await change({ newPassword: NEW_PW, confirmPassword: `${NEW_PW}x` })).body.error).toMatch(/do not match/);
    expect((await change({ newPassword: 'short', confirmPassword: 'short' })).status).toBe(400);
    expect((await change({ newPassword: 'alllowercaseletters', confirmPassword: 'alllowercaseletters' })).status).toBe(400);
    expect((await change({ newPassword: 'Operator1-Secret!', confirmPassword: 'Operator1-Secret!' })).body.error).toMatch(/email/);
    expect((await change({ newPassword: temp, confirmPassword: temp })).status).toBe(400);
    expect((await change({ newPassword: NEW_PW })).status).toBe(400);
    expect((await User.findById(ids.emp)).mustChangePassword).toBe(true);
  });

  test('successful change: flag cleared, sessions revoked, temp password dead, new password works', async () => {
    const emp = await login('operator1', temp);
    const res = await emp.agent.post('/api/auth/change-password').set('X-CSRF-Token', emp.csrf)
      .send({ newPassword: NEW_PW, confirmPassword: NEW_PW });
    expect(res.status).toBe(200);
    expect((await User.findById(ids.emp)).mustChangePassword).toBe(false);
    expect((await request(app).get('/api/auth/me').set('Cookie', emp.cookie)).status).toBe(401);
    expect((await login('operator1', temp)).res.status).toBe(401);

    const fresh = await login('operator1', NEW_PW);
    expect(fresh.res.body.passwordChangeRequired).toBe(false);
    expect((await fresh.agent.get('/api/scada/overview')).status).toBe(200);
  });
});

describe('logout and CSRF', () => {
  test('logout invalidates the session server-side', async () => {
    const emp = await login('operator1', EMP_PW);
    expect((await emp.agent.post('/api/auth/logout').set('X-CSRF-Token', emp.csrf).send({})).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', emp.cookie)).status).toBe(401);
    expect((await Session.findOne({ user: ids.emp })).revokeReason).toBe('logout');
  });

  test('state-changing requests require token, trusted origin and JSON', async () => {
    const admin = await login('admin', ADMIN_PW);
    const url = `/api/admin/employees/${ids.emp}/reset-password`;
    expect((await admin.agent.post(url).send({ confirmUsername: 'operator1' })).status).toBe(403);
    expect((await admin.agent.post(url).set('X-CSRF-Token', 'forged').send({ confirmUsername: 'operator1' })).status).toBe(403);
    expect((await admin.agent.post(url).set('X-CSRF-Token', admin.csrf).set('Origin', 'http://evil.example')
      .send({ confirmUsername: 'operator1' })).status).toBe(403);
    expect((await admin.agent.post(url).set('X-CSRF-Token', admin.csrf).set('Content-Type', 'text/plain')
      .send('confirmUsername=operator1')).status).toBe(403);
    expect((await request(app).post('/api/auth/login').set('Origin', 'http://evil.example')
      .send({ username: 'admin', password: ADMIN_PW })).status).toBe(403);
    expect((await User.findById(ids.emp)).mustChangePassword).toBe(false);
    expect((await reset(admin, ids.emp, 'operator1')).status).toBe(200);
  });
});

describe('audit log', () => {
  test('contains no plaintext credentials or hashes', async () => {
    await login('admin', 'wrong-password-123');
    await login('nobody', 'typo-secret-456');
    const admin = await login('admin', ADMIN_PW);
    const temp = (await reset(admin, ids.emp, 'operator1')).body.temporaryPassword;
    const emp = await login('operator1', temp);
    await emp.agent.post('/api/auth/change-password').set('X-CSRF-Token', emp.csrf).send({ newPassword: NEW_PW, confirmPassword: NEW_PW });
    await admin.agent.post('/api/auth/logout').set('X-CSRF-Token', admin.csrf).send({});

    const events = await AuditEvent.find().lean();
    expect(new Set(events.map((e) => e.type))).toEqual(new Set(['LOGIN', 'PASSWORD_RESET', 'PASSWORD_CHANGE', 'LOGOUT']));
    const dump = JSON.stringify(events);
    for (const secret of [ADMIN_PW, EMP_PW, NEW_PW, temp, 'wrong-password-123', 'typo-secret-456', admin.csrf]) {
      expect(dump).not.toContain(secret);
    }
    expect(dump).not.toMatch(/\$2[aby]\$/);
  });
});

describe('database failures', () => {
  test('failed user update is not reported as a successful reset', async () => {
    const admin = await login('admin', ADMIN_PW);
    jest.spyOn(User, 'findOneAndUpdate').mockRejectedValueOnce(new Error('socket closed by 10.0.0.5'));
    const res = await reset(admin, ids.emp, 'operator1');
    expect(res.status).toBe(500);
    expect(res.body.temporaryPassword).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    expect((await login('operator1', EMP_PW)).res.status).toBe(200);
  });

  test('failure after the user update rolls the whole reset back', async () => {
    const empSession = await login('operator1', EMP_PW);
    const admin = await login('admin', ADMIN_PW);
    jest.spyOn(AuditEvent, 'create').mockRejectedValueOnce(new Error('write concern timeout'));
    const res = await reset(admin, ids.emp, 'operator1');
    expect(res.status).toBe(500);
    expect(res.body.temporaryPassword).toBeUndefined();
    const user = await User.findById(ids.emp).select('+passwordHash');
    expect(user.mustChangePassword).toBe(false);
    expect(await bcrypt.compare(EMP_PW, user.passwordHash)).toBe(true);
    expect((await empSession.agent.get('/api/scada/overview')).status).toBe(200); // session not revoked
  });

  test('standalone MongoDB (no transactions): reset and change still work end to end', async () => {
    jest.spyOn(db, 'supportsTransactions').mockReturnValue(false);
    const old = await login('operator1', EMP_PW);
    const temp = (await reset(await login('admin', ADMIN_PW), ids.emp, 'operator1')).body.temporaryPassword;
    expect((await old.agent.get('/api/auth/me')).status).toBe(401);
    const emp = await login('operator1', temp);
    const res = await emp.agent.post('/api/auth/change-password').set('X-CSRF-Token', emp.csrf)
      .send({ newPassword: NEW_PW, confirmPassword: NEW_PW });
    expect(res.status).toBe(200);
    expect((await login('operator1', NEW_PW)).res.body.passwordChangeRequired).toBe(false);
  });

  test('database outage returns an error, never success, and recovers', async () => {
    await db.disconnect();
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: ADMIN_PW });
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.body.user).toBeUndefined();
    await db.connect(uri);
    expect((await login('admin', ADMIN_PW)).res.status).toBe(200);
  });
});

describe('restart', () => {
  test('users, password state and sessions survive an app + DB connection restart', async () => {
    const admin = await login('admin', ADMIN_PW);
    const temp = (await reset(admin, ids.emp, 'operator1')).body.temporaryPassword;

    await db.disconnect();
    await db.connect(uri);
    app = createApp();

    expect((await request(app).get('/api/auth/me').set('Cookie', admin.cookie)).status).toBe(200);
    const emp = await login('operator1', temp);
    expect(emp.res.body.passwordChangeRequired).toBe(true);
  });
});
