import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  Appointment,
  Feedback,
  Patient,
  Doctor,
  User,
  AuditLog,
  connectDatabase,
} from '../src/models.js';
import { testConfig, isolatedUri, seedTestAccounts, testPassword } from './helpers.js';
let app, fixtures, patient, doctor, foreign, completed;
const tokens = {};
const oid = () => new mongoose.Types.ObjectId();
async function visit(status = 'Completed', owner = patient._id) {
  return Appointment.create({
    reference: `HMS-${oid()}`,
    patient: owner,
    doctor: doctor._id,
    slot: oid(),
    schedule: oid(),
    bookedBy: fixtures.users.patient._id,
    startsAt: new Date('2026-01-02T03:30:00Z'),
    endsAt: new Date('2026-01-02T03:45:00Z'),
    doctorName: 'Test doctor',
    departmentName: 'General Medicine',
    consultationFeeMinor: 250000,
    status,
  });
}
const get = (path, role = 'patient') => request(app).get(`/api${path}`).set('Cookie', tokens[role]);
const post = (body, role = 'patient') =>
  request(app)
    .post('/api/feedback')
    .set('Origin', testConfig.origin)
    .set('Cookie', tokens[role])
    .send(body);
before(async () => {
  await connectDatabase(isolatedUri('feedback'));
  fixtures = await seedTestAccounts();
  patient = await Patient.findOne({ user: fixtures.users.patient._id });
  doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
  const other = await User.create({
    name: 'Other patient',
    email: 'other@test.local',
    role: 'patient',
    passwordHash: (await User.findById(fixtures.users.patient._id).select('+passwordHash'))
      .passwordHash,
  });
  foreign = await Patient.create({ user: other._id, dateOfBirth: '1990-01-01', gender: 'other' });
  completed = await visit();
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const [role, user] of Object.entries({ ...fixtures.users, other })) {
    const r = await request(app)
      .post('/api/auth/login')
      .set('Origin', testConfig.origin)
      .send({ email: user.email, password: testPassword })
      .expect(200);
    tokens[role] = r.headers['set-cookie'].map((v) => v.split(';')[0]).join('; ');
  }
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
test('only completed owned visits are listed, with safe fields and bounded pagination', async () => {
  await visit('Scheduled');
  await visit('Cancelled');
  await visit('Completed', foreign._id);
  const r = await get('/feedback/visits').expect(200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.records[0].id, String(completed._id));
  assert.equal(r.body.records[0].feedback, null);
  for (const key of ['patient', 'reason', 'history', 'consultationFeeMinor'])
    assert.equal(r.body.records[0][key], undefined);
  assert.equal((await get('/feedback/visits?page=2&limit=1')).body.records.length, 0);
  await get('/feedback/visits?limit=51').expect(400);
  await get(`/feedback/visits?patient=${foreign._id}`).expect(400);
  assert.equal((await get(`/feedback/visits?appointment=${completed._id}`, 'other')).body.total, 0);
});
test('rating and comment persist with server-derived links and an atomic content-free audit record', async () => {
  const r = await post({
    appointment: String(completed._id),
    rating: 4,
    comment: '  Kind team [desk]. <script>alert(1)</script>  ',
  }).expect(201);
  assert.equal(r.body.feedback.comment, 'Kind team [desk]. <script>alert(1)</script>');
  const saved = await Feedback.findById(r.body.feedback.id);
  assert.equal(String(saved.patient), String(patient._id));
  assert.equal(String(saved.doctor), String(doctor._id));
  assert.equal(saved.patientName, 'Test patient');
  assert.equal(saved.appointmentReference, completed.reference);
  const logs = await AuditLog.find({ module: 'feedback' }).lean();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].target, String(saved._id));
  assert.ok(!JSON.stringify(logs).includes('Kind team'));
  const list = await get(`/feedback/visits?appointment=${completed._id}`).expect(200);
  assert.equal(list.body.records[0].feedback.rating, 4);
  assert.equal(list.body.records[0].feedback.patientName, undefined);
});
test('sequential and simultaneous duplicates produce one feedback and one audit entry', async () => {
  await post({ appointment: String(completed._id), rating: 1 }).expect(409);
  const fresh = await visit();
  const results = await Promise.all(
    [1, 5].map((rating) => post({ appointment: String(fresh._id), rating })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.match(results.find((r) => r.status === 409).body.message, /already been submitted/);
  const rows = await Feedback.find({ appointment: fresh._id });
  assert.equal(rows.length, 1);
  assert.equal(
    await AuditLog.countDocuments({ module: 'feedback', target: String(rows[0]._id) }),
    1,
  );
});
test('incomplete visits, foreign visits and missing records cannot receive feedback', async () => {
  for (const status of ['Scheduled', 'Waiting', 'In Consultation', 'Cancelled']) {
    const row = await visit(status);
    await post({ appointment: String(row._id), rating: 5 }).expect(409);
    assert.equal(await Feedback.countDocuments({ appointment: row._id }), 0);
  }
  await post({ appointment: String(completed._id), rating: 5 }, 'other').expect(404);
  await post({ appointment: String(oid()), rating: 5 }).expect(404);
});
test('strict submission validation rejects invalid ratings, oversized text and forged identities', async () => {
  const base = { appointment: String(completed._id), rating: 5 };
  for (const extra of [
    { rating: 0 },
    { rating: 6 },
    { rating: 1.5 },
    { rating: '5' },
    { rating: null },
    { comment: 'x'.repeat(2001) },
    { comment: {} },
    { appointment: 'invalid' },
    { patient: String(patient._id) },
    { doctor: String(doctor._id) },
    { patientName: 'Fake' },
    { createdAt: '2020-01-01' },
  ])
    await post({ ...base, ...extra }).expect(400);
  await post({ appointment: String(completed._id) }).expect(400);
});
test('feedback roles, authentication and write-origin protection hold at the API', async () => {
  for (const role of ['admin', 'doctor', 'receptionist']) {
    await get('/feedback/visits', role).expect(403);
    await post({ appointment: String(completed._id), rating: 3 }, role).expect(403);
  }
  for (const role of ['patient', 'other', 'doctor', 'receptionist'])
    await get('/admin/feedback', role).expect(403);
  await request(app).get('/api/admin/feedback').expect(401);
  await request(app).get('/api/feedback/visits').expect(401);
  await request(app)
    .post('/api/feedback')
    .set('Origin', testConfig.origin)
    .send({ appointment: String(completed._id), rating: 3 })
    .expect(401);
  await request(app)
    .post('/api/feedback')
    .set('Cookie', tokens.patient)
    .send({ appointment: String(completed._id), rating: 3 })
    .expect(403);
});
test('admin search is literal, filters combine, pagination is stable, and clinical fields stay absent', async () => {
  const all = await get('/admin/feedback?limit=1', 'admin').expect(200);
  assert.equal(all.body.total, 2);
  assert.equal(all.body.records.length, 1);
  const next = await get('/admin/feedback?limit=1&page=2', 'admin').expect(200);
  assert.notEqual(next.body.records[0]._id, all.body.records[0]._id);
  for (const q of [
    '[desk]',
    'test patient',
    'TEST DOCTOR',
    'General Medicine',
    completed.reference,
  ]) {
    const r = await get(`/admin/feedback?rating=4&q=${encodeURIComponent(q)}`, 'admin').expect(200);
    assert.equal(r.body.total, 1);
    assert.equal(r.body.records[0].appointment, String(completed._id));
    for (const key of ['diagnosis', 'reason', 'phone', 'email', 'passwordHash'])
      assert.equal(r.body.records[0][key], undefined);
  }
  assert.equal((await get('/admin/feedback?q=.*', 'admin')).body.total, 0);
  assert.equal((await get('/admin/feedback?q=missing', 'admin')).body.total, 0);
  for (const query of [
    'rating=6',
    'rating=0',
    'rating=2.2',
    'page=0',
    'limit=51',
    `q=${'a'.repeat(101)}`,
    'patient=anything',
  ])
    await get(`/admin/feedback?${query}`, 'admin').expect(400);
});
test('submitted feedback is immutable, and historical visits remain eligible after doctor deactivation', async () => {
  const fresh = await visit();
  await User.findByIdAndUpdate(fixtures.users.doctor._id, { isActive: false });
  const r = await post({ appointment: String(fresh._id), rating: 2 }).expect(201);
  assert.equal(r.body.feedback.comment, '');
  for (const role of ['patient', 'admin']) {
    await request(app)
      .patch(`/api/feedback/${r.body.feedback.id}`)
      .set('Origin', testConfig.origin)
      .set('Cookie', tokens[role])
      .send({ rating: 5 })
      .expect(404);
    await request(app)
      .delete(`/api/feedback/${r.body.feedback.id}`)
      .set('Origin', testConfig.origin)
      .set('Cookie', tokens[role])
      .expect(404);
  }
  assert.equal((await Feedback.findById(r.body.feedback.id)).rating, 2);
});
