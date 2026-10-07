import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../src/config.js';
import { bootstrapAdmin } from '../src/bootstrap.js';
import { connectDatabase, User, AuditLog } from '../src/models.js';
import { isolatedUri } from './helpers.js';
const config = {
  NODE_ENV: 'production',
  APP_ORIGIN: 'https://hms.example.com',
  MONGODB_URI: 'mongodb://localhost/example',
  JWT_SECRET: 'a'.repeat(48),
};
before(async () => connectDatabase(isolatedUri('operations')));
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
test('deployment config defaults to loopback, allows explicit container bind, and rejects unsafe origins/invalid hosts without revealing secrets', () => {
  assert.equal(loadConfig(config).host, '127.0.0.1');
  assert.equal(loadConfig({ ...config, BIND_HOST: '0.0.0.0' }).host, '0.0.0.0');
  assert.throws(() => loadConfig({ ...config, APP_ORIGIN: 'http://example.com' }), /HTTPS/);
  assert.throws(() => loadConfig({ ...config, APP_ORIGIN: 'https://example.com/path' }), /origin/);
  assert.throws(
    () => loadConfig({ ...config, BIND_HOST: 'malicious-secret-value' }),
    (err) => !err.message.includes('malicious-secret-value'),
  );
  assert.throws(() => loadConfig({ ...config, JWT_SECRET: 'replace-with-unsafe-example-string' }));
});
test('bootstrap rejects forged roles, weak credentials and unknown fields before creating an account', async () => {
  for (const data of [
    { name: 'Admin', email: 'invalid', password: 'long-password-123' },
    { name: 'Admin', email: 'admin@test.local', password: 'short' },
    { name: 'Admin', email: 'admin@test.local', password: 'long-password-123', role: 'admin' },
  ])
    await assert.rejects(bootstrapAdmin(data));
  assert.equal(await User.countDocuments(), 0);
});
test('concurrent initial administrator requests create only one admin and one audit event', async () => {
  const entries = [
    { name: 'First', email: 'first@test.local', password: 'long-password-first-123' },
    { name: 'Second', email: 'second@test.local', password: 'long-password-second-123' },
  ];
  const result = await Promise.allSettled(entries.map(bootstrapAdmin));
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await User.countDocuments(), 1);
  assert.equal(await AuditLog.countDocuments({ action: 'initial_admin_created' }), 1);
  const admin = await User.findOne().select('+passwordHash');
  assert.equal(admin.role, 'admin');
  assert.equal(admin.isActive, true);
  assert.ok(
    await bcrypt.compare(entries.find((v) => v.email === admin.email).password, admin.passwordHash),
  );
});
test('bootstrap cannot add another administrator after installation', async () => {
  await assert.rejects(
    bootstrapAdmin({
      name: 'Extra',
      email: 'extra@test.local',
      password: 'long-password-extra-123',
    }),
    /no user accounts/,
  );
  assert.equal(await User.countDocuments(), 1);
});
