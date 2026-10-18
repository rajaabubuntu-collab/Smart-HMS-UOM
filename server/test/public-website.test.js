import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, Doctor, Department, User, Enquiry, AuditLog } from '../src/models.js';
import { isolatedUri, seedTestAccounts, testConfig, testPassword } from './helpers.js';
let app, fixtures, doctor;
const cookies = {};
const send = (method, path, role = 'admin') =>
  request(app)[method](`/api${path}`).set('Origin', testConfig.origin).set('Cookie', cookies[role]);
const enquiry = () => ({
  requestId: randomUUID(),
  name: 'Synthetic Visitor',
  email: 'visitor@test.local',
  phone: '0771234567',
  subject: 'visiting',
  message: 'Please provide directions to reception.',
  consent: true,
  website: '',
});
const submit = (body) =>
  request(app).post('/api/public/enquiries').set('Origin', testConfig.origin).send(body);
before(async () => {
  await connectDatabase(isolatedUri('public_website'));
  fixtures = await seedTestAccounts();
  doctor = await Doctor.findOne();
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const role of ['admin', 'receptionist', 'doctor', 'patient']) {
    const result = await request(app)
      .post('/api/auth/login')
      .set('Origin', testConfig.origin)
      .send({ email: `${role}@test.local`, password: testPassword })
      .expect(200);
    cookies[role] = result.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
test('public profiles and search require publication, active doctor and active published department', async () => {
  const doctorPath = `/api/public/doctors/${doctor._id}`,
    departmentPath = `/api/public/departments/${fixtures.department._id}`;
  await request(app).get(doctorPath).expect(404);
  await request(app).get(departmentPath).expect(404);
  await Department.updateOne({ _id: fixtures.department._id }, { isPublic: true });
  await Doctor.updateOne({ _id: doctor._id }, { isPublic: true });
  const profile = (await request(app).get(doctorPath).expect(200)).body.doctor;
  assert.deepEqual(
    Object.keys(profile).sort(),
    [
      '_id',
      'name',
      'department',
      'departmentId',
      'specialization',
      'qualification',
      'consultationFeeMinor',
    ].sort(),
  );
  assert.equal(profile.departmentId, String(fixtures.department._id));
  const department = (await request(app).get(departmentPath).expect(200)).body.department;
  assert.deepEqual(Object.keys(department).sort(), ['_id', 'name', 'description'].sort());
  for (const q of ['TEST doctor', 'general'])
    assert.equal(
      (
        await request(app)
          .get('/api/public/doctors')
          .query({ q, department: String(fixtures.department._id) })
          .expect(200)
      ).body.total,
      1,
    );
  assert.equal(
    (await request(app).get('/api/public/doctors').query({ q: '.*' }).expect(200)).body.total,
    0,
  );
  const second = (await request(app).get('/api/public/doctors?page=2&limit=1').expect(200)).body;
  assert.equal(second.total, 1);
  assert.equal(second.items.length, 0);
  for (const patch of [{ isPublic: false }, { isPublic: true, isActive: false }]) {
    await Department.updateOne({ _id: fixtures.department._id }, patch);
    await request(app).get(doctorPath).expect(404);
    await request(app).get(departmentPath).expect(404);
    assert.equal((await request(app).get('/api/public/doctors').expect(200)).body.total, 0);
  }
  await Department.updateOne({ _id: fixtures.department._id }, { isPublic: true, isActive: true });
  await User.updateOne({ _id: fixtures.users.doctor._id }, { isActive: false });
  await request(app).get(doctorPath).expect(404);
  assert.equal((await request(app).get('/api/public/doctors').expect(200)).body.total, 0);
  await User.updateOne({ _id: fixtures.users.doctor._id }, { isActive: true });
  await request(app).get('/api/public/doctors/invalid').expect(400);
  await request(app).get('/api/public/doctors?department=invalid').expect(400);
  await request(app)
    .get('/api/public/doctors')
    .query({ q: 'x'.repeat(101) })
    .expect(400);
});
test('public enquiry validates consent, local phone and honeypot and safely retries once', async () => {
  const body = enquiry();
  for (const patch of [
    { consent: false },
    { phone: '123' },
    { website: 'bot' },
    { message: 'short' },
    { email: 'invalid' },
    { status: 'resolved' },
  ])
    await submit({ ...body, ...patch }).expect(400);
  await request(app)
    .post('/api/public/enquiries')
    .set('Origin', 'https://untrusted.test')
    .send(body)
    .expect(403);
  assert.equal(await Enquiry.countDocuments(), 0);
  const result = (await submit(body).expect(201)).body;
  assert.deepEqual(Object.keys(result), ['reference']);
  assert.match(result.reference, /^ENQ-[A-F0-9]{12}$/);
  assert.deepEqual((await submit(body).expect(200)).body, result);
  await submit({ ...body, message: 'Changed request with the same identifier.' }).expect(409);
  assert.equal(await Enquiry.countDocuments(), 1);
  assert.equal((await Enquiry.findOne()).phone, '+94771234567');
});
test('only reception and admin can read enquiries, and concurrent status edits are audited', async () => {
  await request(app).get('/api/enquiries').expect(401);
  const item = await Enquiry.findOne();
  for (const role of ['patient', 'doctor']) {
    await send('get', '/enquiries', role).expect(403);
    await send('patch', `/enquiries/${item._id}`, role)
      .send({ status: 'resolved', expectedStatus: 'new' })
      .expect(403);
  }
  for (const role of ['admin', 'receptionist']) {
    const result = (await send('get', '/enquiries?status=new', role).expect(200)).body;
    assert.equal(result.total, 1);
    assert.equal(result.items[0].requestId, undefined);
  }
  await send('patch', `/enquiries/${item._id}`, 'receptionist')
    .send({ status: 'in_progress', expectedStatus: 'new' })
    .expect(200);
  await send('patch', `/enquiries/${item._id}`)
    .send({ status: 'resolved', expectedStatus: 'new' })
    .expect(409);
  await send('patch', `/enquiries/${item._id}`)
    .send({ status: 'resolved', expectedStatus: 'in_progress' })
    .expect(200);
  assert.equal(await AuditLog.countDocuments({ action: 'enquiry_status_updated' }), 2);
  assert.equal((await send('get', '/enquiries?status=new').expect(200)).body.total, 0);
  assert.equal((await send('get', '/enquiries?status=resolved').expect(200)).body.total, 1);
});
test('anonymous enquiry submissions are rate limited', async () => {
  const limited = createApp(testConfig);
  for (let i = 0; i < 5; i++)
    await request(limited)
      .post('/api/public/enquiries')
      .set('Origin', testConfig.origin)
      .send(enquiry())
      .expect(201);
  await request(limited)
    .post('/api/public/enquiries')
    .set('Origin', testConfig.origin)
    .send(enquiry())
    .expect(429);
});
