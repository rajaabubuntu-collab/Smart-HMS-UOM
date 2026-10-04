import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { evaluateGuide } from '../src/recommendations/rules.js';
import { createApp } from '../src/app.js';
import {
  User,
  Patient,
  Doctor,
  Department,
  AuditLog,
  Appointment,
  connectDatabase,
} from '../src/models.js';
import { testPassword, testConfig, isolatedUri, seedTestAccounts } from './helpers.js';
const input = (extra = {}) => ({
  symptoms: 'cough',
  duration: { value: 2, unit: 'days' },
  comments: '',
  emergencySigns: 'no',
  acknowledged: true,
  ...extra,
});
const evaluate = (extra) => evaluateGuide(input(extra), { age: 25 });
let app, fixtures, doctor, skinDepartment, skinDoctor;
const tokens = {};
const send = (body, role = 'patient') =>
  request(app)
    .post('/api/recommendations')
    .set('Origin', testConfig.origin)
    .set('Cookie', tokens[role])
    .send(body);
before(async () => {
  await connectDatabase(isolatedUri('recommendations'));
  fixtures = await seedTestAccounts();
  doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
  const passwordHash = (await User.findById(fixtures.users.doctor._id).select('+passwordHash'))
    .passwordHash;
  skinDepartment = await Department.create({ name: 'Dermatology', nameKey: 'dermatology' });
  const skinUser = await User.create({
    name: 'Skin Doctor',
    email: 'skin@test.local',
    role: 'doctor',
    passwordHash,
  });
  skinDoctor = await Doctor.create({
    user: skinUser._id,
    department: skinDepartment._id,
    specialization: 'Dermatology',
    consultationFeeMinor: 350000,
  });
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const [role, user] of Object.entries(fixtures.users)) {
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
test('warning signs and urgent phrases override ordinary department matches, even in comments', () => {
  for (const extra of [
    { emergencySigns: 'yes' },
    { symptoms: 'rash and chest pain' },
    { comments: 'I cannot breathe' },
    { comments: 'new slurred speech' },
    { comments: 'sudden loss of vision' },
    { comments: 'I want to kill myself' },
    { symptoms: 'no chest pain but rash' },
  ]) {
    const r = evaluate(extra);
    assert.equal(r.outcome, 'urgent');
    assert.deepEqual(r.matches, []);
  }
  assert.equal(evaluate({ emergencySigns: 'unsure' }).outcome, 'review');
  assert.equal(evaluate({ painLevel: 8 }).outcome, 'review');
  for (const symptoms of ['severe headache', 'sudden rash', 'worsening cough'])
    assert.equal(evaluate({ symptoms }).outcome, 'review');
});
test('matching is deterministic and bounded by words; ambiguous, negated and unsupported text falls back', () => {
  assert.equal(evaluate({ symptoms: 'COUGH', comments: 'cough cough' }).matches[0].id, 'general');
  assert.equal(evaluate({ symptoms: 'rash' }).matches[0].id, 'skin');
  assert.equal(evaluate({ symptoms: 'ear pain' }).matches[0].id, 'ent');
  assert.equal(evaluate({ symptoms: 'dry eyes' }).matches[0].id, 'eyes');
  assert.equal(evaluate({ symptoms: 'knee pain' }).matches[0].id, 'joints');
  for (const symptoms of [
    'rash and cough',
    'no rash',
    'without fever',
    'brash',
    'coughingness',
    'nondescript concern',
    'කැස්ස',
    'maybe a cough',
    'pregnant with fever',
  ])
    assert.equal(evaluate({ symptoms }).outcome, 'staff', symptoms);
  assert.equal(evaluateGuide(input(), { age: 17 }).outcome, 'staff');
  assert.equal(evaluateGuide(input(), {}).outcome, 'staff');
});
test('patient receives an explanation and active doctors without diagnosis, confidence or persistence of symptom text', async () => {
  const r = await send(input({ comments: 'PRIVATE-UNIQUE-SYMPTOM-CONTEXT' })).expect(200);
  assert.equal(r.body.outcome, 'matched');
  assert.equal(r.body.suggestions[0].department.name, 'General Medicine');
  assert.deepEqual(r.body.suggestions[0].matchedTerms, ['cough']);
  assert.equal(r.body.suggestions[0].doctors[0].id, String(doctor._id));
  assert.equal(r.body.confidence, undefined);
  assert.equal(r.body.diagnosis, undefined);
  assert.ok(r.body.disclaimer.includes('not a diagnosis'));
  const logs = await AuditLog.find({ module: 'recommendations' }).lean();
  assert.ok(logs.length);
  assert.ok(!JSON.stringify(logs).includes('PRIVATE-UNIQUE'));
  assert.ok(!JSON.stringify(logs).includes('cough'));
  assert.equal(await Appointment.countDocuments(), 0);
});
test('emergency and uncertain responses have no bookable suggestions', async () => {
  for (const body of [
    input({ symptoms: 'chest pain and cough' }),
    input({ emergencySigns: 'yes' }),
    input({ emergencySigns: 'unsure' }),
    input({ painLevel: 10 }),
  ]) {
    const r = await send(body).expect(200);
    assert.equal(r.body.suggestions.length, 0);
    assert.ok(['urgent', 'review'].includes(r.body.outcome));
  }
});
test('access and input validation prevent role bypass, forged age and unbounded requests', async () => {
  for (const role of ['doctor', 'receptionist', 'admin']) await send(input(), role).expect(403);
  await request(app)
    .post('/api/recommendations')
    .set('Origin', testConfig.origin)
    .send(input())
    .expect(401);
  for (const extra of [
    { symptoms: '' },
    { symptoms: 'a'.repeat(1001) },
    { painLevel: 0 },
    { painLevel: 11 },
    { painLevel: 2.5 },
    { duration: { value: 0, unit: 'days' } },
    { duration: { value: 2, unit: 'years' } },
    { acknowledged: false },
    { emergencySigns: '' },
    { age: 25 },
    { patient: String(new mongoose.Types.ObjectId()) },
  ])
    await send(input(extra)).expect(400);
  const body = input();
  delete body.emergencySigns;
  await send(body).expect(400);
  await request(app)
    .post('/api/recommendations')
    .set('Cookie', tokens.patient)
    .send(input())
    .expect(403);
});
test('age is taken from the patient profile and child accounts receive staff fallback', async () => {
  await Patient.findOneAndUpdate(
    { user: fixtures.users.patient._id },
    { dateOfBirth: '2020-01-01' },
  );
  const r = await send(input()).expect(200);
  assert.equal(r.body.outcome, 'staff');
  assert.equal(r.body.suggestions.length, 0);
  await Patient.findOneAndUpdate(
    { user: fixtures.users.patient._id },
    { dateOfBirth: '1998-05-20' },
  );
});
test('inactive and unavailable services never silently map to another department', async () => {
  const before = await send(input({ symptoms: 'rash' })).expect(200);
  assert.equal(before.body.suggestions[0].doctors[0].name, 'Skin Doctor');
  await User.findByIdAndUpdate(skinDoctor.user, { isActive: false });
  const empty = await send(input({ symptoms: 'rash' })).expect(200);
  assert.equal(empty.body.suggestions[0].doctorCount, 0);
  assert.equal(empty.body.suggestions[0].doctors.length, 0);
  await Department.findByIdAndUpdate(skinDepartment._id, { isActive: false });
  const hidden = await send(input({ symptoms: 'rash' })).expect(200);
  assert.equal(hidden.body.outcome, 'unavailable');
  assert.equal(hidden.body.suggestions.length, 0);
  const absent = await send(input({ symptoms: 'ear pain' })).expect(200);
  assert.equal(absent.body.outcome, 'unavailable');
  await Department.findByIdAndUpdate(skinDepartment._id, { isActive: true });
  await User.findByIdAndUpdate(skinDoctor.user, { isActive: true });
});
test('unknown and mixed symptom input directs to reception with no fallback booking', async () => {
  for (const symptoms of ['unrecognised concern', 'rash and cough', 'no cough']) {
    const r = await send(input({ symptoms })).expect(200);
    assert.equal(r.body.outcome, 'staff');
    assert.deepEqual(r.body.suggestions, []);
  }
});
test('booking deep link resolves only active doctors and exposes safe directory fields', async () => {
  const get = (id) =>
    request(app).get(`/api/directory/doctors/${id}`).set('Cookie', tokens.patient);
  const r = await get(doctor._id).expect(200);
  assert.equal(r.body.doctor.id, String(doctor._id));
  assert.equal(r.body.doctor.name, 'Test doctor');
  assert.equal(r.body.doctor.passwordHash, undefined);
  assert.equal(r.body.doctor.email, undefined);
  await get('invalid').expect(400);
  await get(new mongoose.Types.ObjectId()).expect(404);
  await User.findByIdAndUpdate(skinDoctor.user, { isActive: false });
  await get(skinDoctor._id).expect(404);
  await User.findByIdAndUpdate(skinDoctor.user, { isActive: true });
  await Department.findByIdAndUpdate(skinDepartment._id, { isActive: false });
  await get(skinDoctor._id).expect(404);
  await Department.findByIdAndUpdate(skinDepartment._id, { isActive: true });
});
