import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, User, Session, PasswordReset, AuditLog } from '../src/models.js';
import { runRecoveryBatch, expireAuditAddresses } from '../src/security/recovery.js';
import { isolatedUri, seedTestAccounts, testConfig, testPassword } from './helpers.js';
let app, directory;
const post = (path, body) =>
  request(app).post(`/api/auth/${path}`).set('Origin', testConfig.origin).send(body);
async function preview() {
  await runRecoveryBatch(testConfig, { previewDirectory: directory });
  for (const file of await readdir(directory)) {
    const value = JSON.parse(await readFile(join(directory, file), 'utf8'));
    if (value.subject.startsWith('Reset'))
      return { token: value.text.match(/#token=([a-f0-9]{64})/)[1], file };
  }
  throw new Error('Missing private preview');
}
before(async () => {
  await connectDatabase(isolatedUri('recovery'));
  await seedTestAccounts();
  app = createApp(testConfig, { rateLimitEnabled: false });
  directory = await mkdtemp(join(tmpdir(), 'hms-recovery-'));
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  await rm(directory, { recursive: true });
});
test('generic requests, private local preview, one-use redemption and session revocation', async () => {
  const login = await post('login', { email: 'patient@test.local', password: testPassword }).expect(
    200,
  );
  const knownStart = Date.now();
  const known = await post('forgot-password', { email: 'patient@test.local' }).expect(202);
  assert.ok(Date.now() - knownStart >= 280, 'known account uses the response floor');
  const unknownStart = Date.now();
  const unknown = await post('forgot-password', { email: 'missing@test.local' }).expect(202);
  assert.ok(Date.now() - unknownStart >= 280, 'unknown account uses the same response floor');
  assert.deepEqual(known.body, unknown.body);
  await post('forgot-password', { email: 'patient@test.local' }).expect(202);
  assert.equal(await PasswordReset.countDocuments(), 1, 'account cooldown');
  assert.equal(JSON.stringify(known.body).includes('token'), false);
  const { token, file } = await preview();
  assert.equal((await stat(join(directory, file))).mode & 0o077, 0);
  const hidden = await PasswordReset.findOne().lean();
  assert.equal(hidden.tokenHash, undefined);
  assert.equal(hidden.sealedToken, undefined);
  await post('reset-password', { token: '0'.repeat(64), password: 'New-test-password-42!' }).expect(
    400,
  );
  const outcomes = await Promise.all(
    [1, 2].map(() => post('reset-password', { token, password: 'New-test-password-42!' })),
  );
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [200, 400]);
  await request(app).get('/api/auth/me').set('Cookie', login.headers['set-cookie']).expect(401);
  await post('login', { email: 'patient@test.local', password: testPassword }).expect(401);
  await post('login', { email: 'patient@test.local', password: 'New-test-password-42!' }).expect(
    200,
  );
  assert.equal(await Session.countDocuments(), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'password_reset_completed' }), 1);
  await runRecoveryBatch(testConfig, {
    previewDirectory: directory,
    now: new Date(Date.now() + 16 * 60000),
  });
  assert.equal((await readdir(directory)).length, 0, 'expired previews removed');
});
test('expired links, inactive accounts, CSRF and input validation', async () => {
  await User.updateOne({ email: 'doctor@test.local' }, { $set: { isActive: false } });
  await post('forgot-password', { email: 'doctor@test.local' }).expect(202);
  assert.equal(
    await PasswordReset.countDocuments({ user: (await User.findOne({ role: 'doctor' }))._id }),
    0,
  );
  await post('forgot-password', { email: 'admin@test.local' }).expect(202);
  const { token } = await preview();
  await PasswordReset.updateMany({ kind: 'reset' }, { $set: { expiresAt: new Date(0) } });
  await post('reset-password', { token, password: testPassword }).expect(400);
  await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'admin@test.local' })
    .expect(403);
  await post('reset-password', { token, password: 'short' }).expect(400);
});
test('login IP uses trusted request address and retention preserves audit events', async () => {
  await request(app)
    .post('/api/auth/login')
    .set('Origin', testConfig.origin)
    .set('X-Forwarded-For', '203.0.113.42')
    .send({ email: 'unknown@test.local', password: testPassword })
    .expect(401);
  const entry = await AuditLog.findOne({ action: 'login_failed' })
    .sort({ createdAt: -1 })
    .select('+ipAddress');
  assert.equal(entry.ipAddress, '127.0.0.1');
  await AuditLog.collection.updateOne(
    { _id: entry._id },
    { $set: { createdAt: new Date(Date.now() - 31 * 86400000) } },
  );
  await expireAuditAddresses();
  const retained = await AuditLog.findById(entry._id).select('+ipAddress');
  assert.ok(retained);
  assert.equal(retained.ipAddress, undefined);
});
