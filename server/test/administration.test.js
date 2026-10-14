import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  connectDatabase,
  User,
  Patient,
  Doctor,
  Department,
  Appointment,
  AuditLog,
} from '../src/models.js';
import { isolatedUri, seedTestAccounts, testConfig, testPassword } from './helpers.js';
import { hospitalDate } from '../src/scheduling/time.js';
import { csvCell } from '../src/reporting/export.js';
let app, fixtures, patient, doctor;
const cookies = {};
const send = (method, path, role = 'admin') =>
  request(app)[method](`/api${path}`).set('Origin', testConfig.origin).set('Cookie', cookies[role]);
const status = (isActive, expectedActive = !isActive) => ({
  isActive,
  expectedActive,
  reason: 'Synthetic account administration',
});
const deptBody = (extra = {}) => ({
  name: fixtures.department.name,
  description: 'Approved synthetic service',
  revision: 0,
  isActive: true,
  isPublic: true,
  reason: 'Approved synthetic publication',
  ...extra,
});
async function visit(extra = {}) {
  return Appointment.create({
    reference: `TEST-${new mongoose.Types.ObjectId()}`,
    doctor: doctor._id,
    patient: patient._id,
    slot: new mongoose.Types.ObjectId(),
    schedule: new mongoose.Types.ObjectId(),
    bookedBy: fixtures.users.patient._id,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 900000),
    doctorName: 'Test doctor',
    departmentName: 'General Medicine',
    consultationFeeMinor: 250000,
    status: 'Waiting',
    checkedInAt: new Date(),
    ...extra,
  });
}
before(async () => {
  await connectDatabase(isolatedUri('administration'));
  fixtures = await seedTestAccounts();
  patient = await Patient.findOne();
  doctor = await Doctor.findOne();
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const role of ['admin', 'doctor', 'patient', 'receptionist']) {
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
test('public directory requires explicit publication and omits private account details', async () => {
  assert.equal((await request(app).get('/api/public/doctors').expect(200)).body.total, 0);
  await send('patch', `/admin/doctors/${doctor._id}/publication`)
    .send({ isPublic: true, expectedPublic: false })
    .expect(409);
  const saved = await send('patch', `/admin/departments/${fixtures.department._id}`)
    .send(deptBody())
    .expect(200);
  assert.equal(saved.body.department.revision, 1);
  await send('patch', `/admin/doctors/${doctor._id}/publication`)
    .send({ isPublic: true, expectedPublic: false })
    .expect(200);
  const result = await request(app).get('/api/public/doctors').expect(200);
  assert.equal(result.body.total, 1);
  assert.equal(result.body.items[0].name, 'Test doctor');
  for (const key of ['email', 'phone', 'passwordHash', 'user', 'securityRevision'])
    assert.equal(Object.hasOwn(result.body.items[0], key), false);
  await send('patch', `/admin/departments/${fixtures.department._id}`).send(deptBody()).expect(409);
  await send('patch', `/admin/departments/${fixtures.department._id}`)
    .send(deptBody({ revision: 1, isActive: false }))
    .expect(409);
  await send('patch', `/admin/departments/${fixtures.department._id}`)
    .send(deptBody({ revision: 1, isPublic: false }))
    .expect(200);
  assert.equal((await request(app).get('/api/public/doctors').expect(200)).body.total, 0);
  const empty = await Department.create({ name: 'Empty', nameKey: 'empty' });
  await send('patch', `/admin/departments/${empty._id}`)
    .send(deptBody({ name: 'Renamed', isActive: false, isPublic: false }))
    .expect(200);
});
test('patient status is role protected, blocks open visits, revokes sessions and preserves history', async () => {
  const path = `/admin/patients/${fixtures.users.patient._id}/status`;
  for (const role of ['patient', 'doctor', 'receptionist']) {
    await send('get', '/admin/patients', role).expect(403);
    await send('patch', path, role).send(status(false)).expect(403);
  }
  const appointment = await visit();
  await send('patch', path).send(status(false)).expect(409);
  await Appointment.updateOne({ _id: appointment._id }, { $set: { status: 'Completed' } });
  await send('patch', path).send(status(false)).expect(200);
  await send('get', '/auth/me', 'patient').expect(401);
  assert.equal(await Appointment.countDocuments({ _id: appointment._id }), 1);
  assert.equal(
    (await send('get', '/admin/patients?status=inactive&search=patient').expect(200)).body.total,
    1,
  );
  await send('patch', path).send(status(true, true)).expect(409);
  await send('patch', path).send(status(true)).expect(200);
  assert.ok(
    await AuditLog.exists({
      action: 'patient_deactivated',
      reason: 'Synthetic account administration',
    }),
  );
});
test('queue and timeline paginate deterministically without notes or cross-role access', async () => {
  for (let i = 0; i < 23; i++) await visit({ checkedInAt: new Date(Date.now() - i * 1000) });
  const first = (await send('get', '/clinical/queue?page=1&limit=10', 'doctor').expect(200)).body;
  const second = (await send('get', '/clinical/queue?page=2&limit=10', 'doctor').expect(200)).body;
  const third = (await send('get', '/clinical/queue?page=3&limit=10', 'doctor').expect(200)).body;
  assert.equal(first.total, 23);
  assert.equal(
    new Set([...first.queue, ...second.queue, ...third.queue].map((a) => a.id)).size,
    23,
  );
  const day = (
    await send('get', `/clinical/timeline?date=${hospitalDate()}&limit=10&page=2`, 'doctor').expect(
      200,
    )
  ).body;
  assert.equal(day.total, 24);
  assert.equal(day.items.length, 10);
  assert.equal(Object.hasOwn(day.items[0], 'notes'), false);
  await send('get', '/clinical/timeline', 'admin').expect(403);
  await send('get', '/clinical/queue?limit=500', 'doctor').expect(400);
});
test('exports cover all pages, enforce role and range, escape spreadsheet formulas', async () => {
  await User.updateOne(
    { _id: fixtures.users.patient._id },
    { $set: { name: '=HYPERLINK("https://example.invalid")' } },
  );
  const query = `from=${hospitalDate()}&to=${hospitalDate()}`;
  const exported = (
    await send('get', `/admin/reports/appointments/export?${query}&format=json`).expect(200)
  ).body;
  assert.equal(exported.total, 24);
  assert.equal(exported.records.length, 24);
  const csv = await send('get', `/admin/reports/appointments/export?${query}`).expect(200);
  assert.match(csv.headers['content-disposition'], /attachment/);
  assert.ok(csv.text.includes('"\t=HYPERLINK'));
  assert.equal(csvCell('=1+1'), '"\t=1+1"');
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  await send('get', `/admin/reports/appointments/export?${query}`, 'doctor').expect(403);
  await send('get', '/admin/reports/appointments/export?from=2026-01-01&to=2026-01-02').expect(400);
});
