import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  Appointment,
  Consultation,
  Doctor,
  Patient,
  User,
  AuditLog,
  connectDatabase,
} from '../src/models.js';
import { testPassword, testConfig, isolatedUri, seedTestAccounts } from './helpers.js';
let app, doctor, patient, users, secondDoctor, secondPatient;
const cookies = {};
const send = (method, path, role = 'doctor') =>
  request(app)[method](`/api${path}`).set('Origin', testConfig.origin).set('Cookie', cookies[role]);
const path = (a) => `/clinical/appointments/${a._id}`;
const body = (revision = 0, extra = {}) => ({
  revision,
  notes: 'Synthetic consultation notes',
  diagnosis: 'Synthetic diagnosis',
  treatment: 'Synthetic follow-up plan',
  currentMedications: 'Patient reports none',
  medications: [],
  noMedicationReason: 'No medication needed for this synthetic visit',
  allergiesReviewed: true,
  reviewedAllergies: [],
  ...extra,
});
async function visit(extra = {}) {
  return Appointment.create({
    reference: `TEST-${new mongoose.Types.ObjectId()}`,
    doctor: doctor._id,
    patient: patient._id,
    slot: new mongoose.Types.ObjectId(),
    schedule: new mongoose.Types.ObjectId(),
    bookedBy: users.patient._id,
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
  await connectDatabase(isolatedUri('clinical'));
  const fixtures = await seedTestAccounts();
  users = fixtures.users;
  doctor = await Doctor.findOne({ user: users.doctor._id });
  patient = await Patient.findOne({ user: users.patient._id });
  const passwordHash = (await User.findById(users.doctor._id).select('+passwordHash')).passwordHash;
  for (const role of ['otherDoctor', 'otherPatient']) {
    const user = await User.create({
      name: role,
      email: `${role.toLowerCase()}@test.local`,
      passwordHash,
      role: role === 'otherDoctor' ? 'doctor' : 'patient',
    });
    users[role] = user;
  }
  secondDoctor = await Doctor.create({
    user: users.otherDoctor._id,
    department: fixtures.department._id,
    specialization: 'General',
    consultationFeeMinor: 1,
  });
  secondPatient = await Patient.create({
    user: users.otherPatient._id,
    dateOfBirth: '2000-01-01',
    gender: 'other',
  });
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const [role, user] of Object.entries(users)) {
    const r = await request(app)
      .post('/api/auth/login')
      .set('Origin', testConfig.origin)
      .send({ email: user.email, password: testPassword })
      .expect(200);
    cookies[role] = r.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('clinical record and history require ownership; staff cannot read or mutate', async () => {
  const a = await visit();
  for (const role of ['admin', 'receptionist', 'patient']) {
    await send('get', path(a), role).expect(403);
    await send('post', `${path(a)}/start`, role)
      .send({})
      .expect(403);
  }
  await send('get', path(a), 'otherDoctor').expect(404);
  await send('get', `/clinical/history?appointment=${a._id}`, 'otherDoctor').expect(404);
  await send('get', `/clinical/history?appointment=${a._id}`, 'patient').expect(400);
  await send('get', '/clinical/history', 'admin').expect(403);
  await send('get', '/clinical/queue', 'patient').expect(403);
  await send('get', '/clinical/appointments/invalid').expect(400);
});

test('queue is scoped, ordered by arrival and retains unfinished older visits', async () => {
  const old = await visit({
    startsAt: new Date(Date.now() - 86400000),
    checkedInAt: new Date(Date.now() - 86400000),
  });
  await visit({ doctor: secondDoctor._id });
  const r = await send('get', '/clinical/queue').expect(200);
  assert.equal(r.body.queue[0].id, String(old._id));
  const other = await send('get', '/clinical/queue', 'otherDoctor').expect(200);
  assert.equal(other.body.queue.length, 1);
  assert.ok(r.body.counts.total >= 1);
});

test('concurrent starts allow one active consultation and cancellation cannot interrupt it', async () => {
  const a = await visit(),
    b = await visit();
  const results = await Promise.all([a, b].map((v) => send('post', `${path(v)}/start`).send({})));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const active = await Consultation.findOne({ status: 'Draft' });
  await send('post', `/appointments/${active.appointment}/cancel`, 'receptionist')
    .send({ reason: 'Cannot cancel active consultation' })
    .expect(409);
  const another = await visit({ doctor: secondDoctor._id });
  await send('post', `${path(another)}/start`, 'otherDoctor')
    .send({})
    .expect(409);
  await send('post', `/clinical/appointments/${active.appointment}/complete`)
    .send(body())
    .expect(200);
});

test('draft persistence, stale revisions, completion and immutable note boundary', async () => {
  const a = await visit();
  await send('post', `${path(a)}/start`)
    .send({})
    .expect(201);
  await send('post', `${path(a)}/save`)
    .send(body(0, { diagnosis: '' }))
    .expect(200);
  const draft = await send('get', path(a)).expect(200);
  assert.equal(draft.body.consultation.notes, 'Synthetic consultation notes');
  const history = await send('get', '/clinical/history', 'patient').expect(200);
  assert.ok(!history.body.records.some((r) => r.appointment._id === String(a._id)));
  await send('post', `${path(a)}/save`)
    .send(body(0))
    .expect(409);
  await send('post', `${path(a)}/complete`)
    .send(body(1, { diagnosis: '' }))
    .expect(400);
  await send('post', `${path(a)}/complete`)
    .send(body(1, { noMedicationReason: '' }))
    .expect(400);
  await send('post', `${path(a)}/complete`)
    .send(body(1))
    .expect(200);
  assert.equal((await Appointment.findById(a._id)).status, 'Completed');
  await send('post', `${path(a)}/save`)
    .send(body(2))
    .expect(409);
  await send('post', `${path(a)}/complete`)
    .send(body(2))
    .expect(409);
  const completed = await send('get', '/clinical/history', 'patient').expect(200);
  assert.ok(completed.body.records.some((r) => r.appointment._id === String(a._id)));
  const other = await send('get', '/clinical/history', 'otherPatient').expect(200);
  assert.equal(other.body.total, 0);
  assert.ok(await AuditLog.exists({ action: 'consultation_complete', target: String(a._id) }));
});

test('allergy changes invalidate stale reviews and prescription revisions retain originals', async () => {
  const a = await visit();
  await send('post', `${path(a)}/start`)
    .send({})
    .expect(201);
  await Patient.findByIdAndUpdate(patient._id, { allergies: ['Synthetic allergy'] });
  await send('post', `${path(a)}/complete`)
    .send(body())
    .expect(409);
  await send('post', `${path(a)}/complete`)
    .send(body(0, { allergiesReviewed: false }))
    .expect(400);
  await send('post', `${path(a)}/complete`)
    .send(body(0, { reviewedAllergies: ['Synthetic allergy'] }))
    .expect(200);
  const revision = {
    revision: 1,
    reason: 'Synthetic prescription correction',
    medications: [
      {
        name: 'Test medicine',
        dosage: 'Test dose',
        frequency: 'Test frequency',
        duration: 'Test duration',
      },
    ],
    noMedicationReason: '',
    reviewedAllergies: ['Synthetic allergy'],
    allergiesReviewed: true,
  };
  await send('post', `${path(a)}/prescription`, 'otherDoctor')
    .send(revision)
    .expect(404);
  await send('post', `${path(a)}/prescription`)
    .send({ ...revision, reason: '' })
    .expect(400);
  const responses = await Promise.all(
    [1, 2].map(() => send('post', `${path(a)}/prescription`).send(revision)),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const record = await Consultation.findOne({ appointment: a._id });
  assert.equal(record.prescriptions.length, 2);
  assert.equal(record.prescriptions[0].medications.length, 0);
  assert.equal(record.prescriptions[1].medications[0].name, 'Test medicine');
  assert.equal(record.notes, 'Synthetic consultation notes');
  await Patient.findByIdAndUpdate(patient._id, { allergies: [] });
});

test('scheduled or cancelled visits cannot start; authorised treating doctor can see prior records', async () => {
  const scheduled = await visit({ doctor: secondDoctor._id, status: 'Scheduled' });
  await send('post', `${path(scheduled)}/start`, 'otherDoctor')
    .send({})
    .expect(409);
  const r = await send(
    'get',
    `/clinical/history?appointment=${scheduled._id}`,
    'otherDoctor',
  ).expect(200);
  assert.ok(r.body.total > 0);
  await Appointment.findByIdAndUpdate(scheduled._id, { status: 'Cancelled' });
  await send('get', path(scheduled), 'otherDoctor').expect(404);
  await send('get', `/clinical/history?appointment=${scheduled._id}`, 'otherDoctor').expect(404);
  const unrelated = await visit({ patient: secondPatient._id });
  const empty = await send('get', `/clinical/history?appointment=${unrelated._id}`).expect(200);
  assert.equal(empty.body.total, 0);
});
