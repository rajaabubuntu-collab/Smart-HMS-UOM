import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  User,
  Patient,
  Doctor,
  Department,
  Session,
  AuditLog,
  connectDatabase,
} from '../src/models.js';
import { testPassword, testConfig, isolatedUri, seedTestAccounts } from './helpers.js';

let app, fixtures;
const cookie = (response) => response.headers['set-cookie'][0].split(';')[0];
const send = (method, path, token) => {
  const req = request(app)[method](path).set('Origin', testConfig.origin);
  return token ? req.set('Cookie', token) : req;
};
async function login(role) {
  return send('post', '/api/auth/login')
    .send({ email: `${role}@test.local`, password: testPassword })
    .expect(200);
}
before(async () => {
  await connectDatabase(isolatedUri('api'));
  fixtures = await seedTestAccounts();
  app = createApp(testConfig, { rateLimitEnabled: false });
});
after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('health endpoint reports connected database and security headers', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.database, 'connected');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['cache-control'], 'no-store');
});
test('protected endpoints reject unauthenticated and tampered sessions', async () => {
  for (const path of [
    '/api/auth/me',
    '/api/patients/me',
    '/api/admin/staff',
    '/api/doctors/me',
    '/api/reception/overview',
  ])
    await request(app).get(path).expect(401);
  await request(app).get('/api/auth/me').set('Cookie', 'hms_session=tampered').expect(401);
});
test('registration creates patient and session atomically; normalises email and hides password', async () => {
  const response = await send('post', '/api/auth/register')
    .send({
      name: 'New Patient',
      email: 'New@Example.COM',
      password: testPassword,
      phone: '+94 77 123 4567',
      dateOfBirth: '2000-02-29',
      gender: 'female',
    })
    .expect(201);
  assert.equal(response.body.user.role, 'patient');
  assert.equal(response.body.user.email, 'new@example.com');
  assert.equal(response.body.user.passwordHash, undefined);
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /SameSite=Strict/);
  const user = await User.findById(response.body.user.id).select('+passwordHash');
  assert.notEqual(user.passwordHash, testPassword);
  assert.match(user.passwordHash, /^\$2[aby]\$12\$/);
  assert.ok(await Patient.exists({ user: user._id }));
  assert.ok(await AuditLog.exists({ actor: user._id, action: 'patient_registered' }));
  await send('get', '/api/patients/me', cookie(response)).expect(200);
});
test('registration rejects role escalation, invalid dates, weak or oversized passwords and injection objects', async () => {
  const valid = {
    name: 'Invalid',
    email: 'invalid@test.local',
    password: testPassword,
    dateOfBirth: '2000-01-01',
    gender: 'male',
  };
  for (const changes of [
    { role: 'admin' },
    { dateOfBirth: '2025-02-30' },
    { dateOfBirth: '2999-01-01' },
    { password: 'short' },
    { password: 'a'.repeat(73) },
    { email: { $ne: null } },
  ]) {
    await send('post', '/api/auth/register')
      .send({ ...valid, ...changes })
      .expect(400);
  }
  assert.equal(await User.countDocuments({ email: 'invalid@test.local' }), 0);
});
test('concurrent duplicate registration succeeds only once, with no orphan profile', async () => {
  const body = {
    name: 'Concurrent Patient',
    email: 'concurrent@test.local',
    password: testPassword,
    dateOfBirth: '2000-01-01',
    gender: 'other',
  };
  const results = await Promise.all([
    send('post', '/api/auth/register').send(body),
    send('post', '/api/auth/register').send(body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const users = await User.find({ email: body.email });
  assert.equal(users.length, 1);
  assert.equal(await Patient.countDocuments({ user: users[0]._id }), 1);
});
test('all four roles sign in and receive only their role data', async () => {
  const endpoints = {
    patient: '/api/patients/me',
    doctor: '/api/doctors/me',
    receptionist: '/api/reception/overview',
    admin: '/api/admin/overview',
  };
  for (const role of Object.keys(endpoints)) {
    const response = await login(role);
    assert.equal(response.body.user.role, role);
    const token = cookie(response);
    await send('get', endpoints[role], token).expect(200);
    for (const other of Object.keys(endpoints).filter((r) => r !== role))
      await send('get', endpoints[other], token).expect(403);
    if (role !== 'admin') {
      await send('post', '/api/admin/departments', token).send({ name: 'Forbidden' }).expect(403);
      await send('post', '/api/admin/staff', token).send({}).expect(403);
    }
  }
});
test('wrong password and unknown user have the same response and failures are audited', async () => {
  const a = await send('post', '/api/auth/login')
    .send({ email: 'patient@test.local', password: 'incorrect' })
    .expect(401);
  const b = await send('post', '/api/auth/login')
    .send({ email: 'missing@test.local', password: 'incorrect' })
    .expect(401);
  assert.deepEqual(a.body, b.body);
  assert.ok((await AuditLog.countDocuments({ action: 'login_failed' })) >= 2);
});
test('logout revokes the persisted session, including replay of a captured cookie', async () => {
  const token = cookie(await login('patient'));
  await send('post', '/api/auth/logout', token).expect(204);
  await send('get', '/api/auth/me', token).expect(401);
  assert.ok(await AuditLog.exists({ actor: fixtures.users.patient._id, action: 'logout' }));
});
test('expired database sessions and deactivated accounts are rejected', async () => {
  const token = cookie(await login('patient'));
  const payload = jwt.decode(token.split('=')[1]);
  await Session.updateOne({ _id: payload.jti }, { expiresAt: new Date(Date.now() - 1000) });
  await send('get', '/api/auth/me', token).expect(401);
  const doctorToken = cookie(await login('doctor'));
  await User.updateOne({ _id: fixtures.users.doctor._id }, { isActive: false });
  await send('get', '/api/auth/me', doctorToken).expect(401);
  await send('post', '/api/auth/login')
    .send({ email: 'doctor@test.local', password: testPassword })
    .expect(401);
  await User.updateOne({ _id: fixtures.users.doctor._id }, { isActive: true });
});
test('patient may update their own contacts but not identity, role, clinical data or another profile', async () => {
  const token = cookie(await login('patient'));
  const body = {
    phone: '+94 77 000 0000',
    address: 'Synthetic address',
    emergencyContact: { name: 'Sample Contact', phone: '0771111111', relationship: 'Parent' },
  };
  const response = await send('patch', '/api/patients/me', token).send(body).expect(200);
  assert.equal(response.body.profile.address, body.address);
  assert.equal(response.body.user.phone, body.phone);
  for (const forbidden of [
    { role: 'admin' },
    { user: fixtures.users.doctor._id },
    { allergies: [] },
    { name: 'Changed identity' },
  ])
    await send('patch', '/api/patients/me', token)
      .send({ ...body, ...forbidden })
      .expect(400);
  await send('get', `/api/patients/${fixtures.users.doctor._id}`, token).expect(404);
  assert.ok(
    await AuditLog.exists({ actor: fixtures.users.patient._id, action: 'profile_updated' }),
  );
});
test('admin creates departments and both staff roles; invalid doctor leaves no orphan account', async () => {
  const token = cookie(await login('admin'));
  const result = await send('post', '/api/admin/departments', token)
    .send({ name: 'Cardiology', description: 'Test department' })
    .expect(201);
  const department = result.body.department.id;
  await send('post', '/api/admin/departments', token).send({ name: ' cardiology ' }).expect(409);
  await send('post', '/api/admin/staff', token)
    .send({
      name: 'Created Doctor',
      email: 'created-doctor@test.local',
      password: testPassword,
      role: 'doctor',
      department,
      specialization: 'Cardiology',
      qualification: 'Sample',
      consultationFeeMinor: 250050,
    })
    .expect(201);
  await send('post', '/api/admin/staff', token)
    .send({
      name: 'Created Receptionist',
      email: 'created-reception@test.local',
      password: testPassword,
      role: 'receptionist',
    })
    .expect(201);
  await send('post', '/api/admin/staff', token)
    .send({
      name: 'Invalid Doctor',
      email: 'orphan@test.local',
      password: testPassword,
      role: 'doctor',
      department: new mongoose.Types.ObjectId().toString(),
      specialization: 'Unknown',
      consultationFeeMinor: 0,
    })
    .expect(400);
  assert.equal(await User.countDocuments({ email: 'orphan@test.local' }), 0);
  assert.equal(await Doctor.countDocuments({ department }), 1);
  await send('post', '/api/admin/staff', token)
    .send({
      name: 'Escalation',
      email: 'escalation@test.local',
      password: testPassword,
      role: 'admin',
    })
    .expect(400);
});
test('admin listings paginate and never return password hashes', async () => {
  const token = cookie(await login('admin'));
  const response = await send('get', '/api/admin/staff?limit=1&page=2', token).expect(200);
  assert.equal(response.body.items.length, 1);
  assert.ok(response.body.total >= 4);
  assert.ok(!JSON.stringify(response.body).includes('passwordHash'));
  await send('get', '/api/admin/staff?limit=500', token).expect(400);
  const departments = await send('get', '/api/admin/departments', token).expect(200);
  assert.equal(departments.body.total, await Department.countDocuments());
});
test('unsafe requests require trusted Origin, even with a valid session', async () => {
  const token = cookie(await login('admin'));
  await request(app)
    .post('/api/admin/departments')
    .set('Cookie', token)
    .set('Origin', 'https://untrusted.example')
    .send({ name: 'CSRF' })
    .expect(403);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@test.local', password: testPassword })
    .expect(403);
  await request(app)
    .post('/api/auth/logout')
    .set('Cookie', token)
    .set('Origin', 'null')
    .expect(403);
});
test('malformed JSON is rejected without stack traces', async () => {
  const response = await send('post', '/api/auth/login')
    .set('Content-Type', 'application/json')
    .send('{broken')
    .expect(400);
  assert.equal(response.body.message, 'Request body must be valid JSON.');
  assert.equal(response.body.stack, undefined);
});
test('authentication rate limiter stops repeated attempts', async () => {
  const limitedApp = createApp(testConfig);
  let response;
  for (let i = 0; i < 21; i++)
    response = await request(limitedApp)
      .post('/api/auth/login')
      .set('Origin', testConfig.origin)
      .send({});
  assert.equal(response.status, 429);
  assert.ok(response.headers['retry-after']);
});
