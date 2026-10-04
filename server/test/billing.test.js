import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  Appointment,
  Bill,
  Payment,
  Consultation,
  Doctor,
  Patient,
  User,
  AuditLog,
  connectDatabase,
} from '../src/models.js';
import { billStatus } from '../src/billing/service.js';
import { hospitalDate } from '../src/scheduling/time.js';
import { testPassword, testConfig, isolatedUri, seedTestAccounts } from './helpers.js';
let app, fixtures, doctor, patient;
const tokens = {};
const send = (method, path, role = 'receptionist') =>
  request(app)[method](`/api${path}`).set('Origin', testConfig.origin).set('Cookie', tokens[role]);
const pay = (revision, amountMinor, extra = {}) => ({
  revision,
  requestKey: randomUUID(),
  amountMinor,
  method: 'Cash',
  externalReference: '',
  ...extra,
});
async function appointment(extra = {}) {
  return Appointment.create({
    reference: `HMS-${new mongoose.Types.ObjectId()}`,
    doctor: doctor._id,
    patient: patient._id,
    slot: new mongoose.Types.ObjectId(),
    schedule: new mongoose.Types.ObjectId(),
    bookedBy: fixtures.users.patient._id,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 900000),
    doctorName: 'Booked doctor name',
    departmentName: 'General Medicine',
    consultationFeeMinor: 250050,
    status: 'Completed',
    ...extra,
  });
}
async function manual(extra = {}) {
  const a = await appointment(extra);
  const r = await send('post', '/billing/bills')
    .send({
      appointment: String(a._id),
      dueDate: hospitalDate(),
      reason: 'Historical completed visit',
    })
    .expect(201);
  return r.body.bill;
}
before(async () => {
  await connectDatabase(isolatedUri('billing'));
  fixtures = await seedTestAccounts();
  doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
  patient = await Patient.findOne({ user: fixtures.users.patient._id });
  const passwordHash = (await User.findById(fixtures.users.patient._id).select('+passwordHash'))
    .passwordHash;
  const other = await User.create({
    name: 'Other patient',
    email: 'other@test.local',
    role: 'patient',
    passwordHash,
  });
  await Patient.create({ user: other._id, dateOfBirth: '2000-01-01', gender: 'other' });
  fixtures.users.other = other;
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

test('consultation completion creates exactly one fee snapshot bill atomically', async () => {
  const a = await appointment({ status: 'Waiting' });
  await send('post', `/clinical/appointments/${a._id}/start`, 'doctor').send({}).expect(201);
  const body = {
    revision: 0,
    notes: 'Synthetic notes',
    diagnosis: 'Synthetic diagnosis',
    treatment: '',
    currentMedications: '',
    medications: [],
    noMedicationReason: 'None needed for test',
    allergiesReviewed: true,
    reviewedAllergies: [],
  };
  await send('post', `/clinical/appointments/${a._id}/complete`, 'doctor')
    .send({ ...body, diagnosis: '' })
    .expect(400);
  assert.equal(await Bill.countDocuments({ appointment: a._id }), 0);
  await Doctor.findByIdAndUpdate(doctor._id, { consultationFeeMinor: 999999 });
  const results = await Promise.all(
    [1, 2].map(() => send('post', `/clinical/appointments/${a._id}/complete`, 'doctor').send(body)),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const bill = await Bill.findOne({ appointment: a._id });
  assert.equal(bill.totalMinor, 250050);
  assert.equal(bill.doctorName, 'Booked doctor name');
  assert.equal(await Bill.countDocuments({ appointment: a._id }), 1);
  assert.equal((await Consultation.findOne({ appointment: a._id })).status, 'Completed');
  assert.ok(await AuditLog.exists({ action: 'bill_generated', target: String(bill._id) }));
});
test('bill generation failure rolls back consultation completion', async () => {
  const a = await appointment({ status: 'Waiting', consultationFeeMinor: -1 });
  await send('post', `/clinical/appointments/${a._id}/start`, 'doctor').send({}).expect(201);
  await send('post', `/clinical/appointments/${a._id}/complete`, 'doctor')
    .send({
      revision: 0,
      notes: 'Synthetic',
      diagnosis: 'Synthetic',
      treatment: '',
      currentMedications: '',
      medications: [],
      noMedicationReason: 'Synthetic',
      allergiesReviewed: true,
      reviewedAllergies: [],
    })
    .expect(400);
  assert.equal((await Appointment.findById(a._id)).status, 'In Consultation');
  assert.equal((await Consultation.findOne({ appointment: a._id })).status, 'Draft');
  assert.equal(await Bill.countDocuments({ appointment: a._id }), 0);
  // Repair only this synthetic fixture and complete it so later tests can start visits.
  await Appointment.findByIdAndUpdate(a._id, { consultationFeeMinor: 0 });
  await send('post', `/clinical/appointments/${a._id}/complete`, 'doctor')
    .send({
      revision: 0,
      notes: 'Synthetic',
      diagnosis: 'Synthetic',
      treatment: '',
      currentMedications: '',
      medications: [],
      noMedicationReason: 'Synthetic',
      allergiesReviewed: true,
      reviewedAllergies: [],
    })
    .expect(200);
});
test('patient ownership, role isolation and strict fields protect bills and payment writes', async () => {
  const bill = await manual();
  await send('get', `/billing/bills/${bill._id}`, 'patient').expect(200);
  await send('get', `/billing/bills/${bill._id}`, 'other').expect(404);
  const other = await send('get', '/billing/bills', 'other').expect(200);
  assert.equal(other.body.total, 0);
  await send('get', '/billing/bills', 'doctor').expect(403);
  await send('post', `/billing/bills/${bill._id}/payments`, 'patient').send(pay(0, 1)).expect(403);
  await send('post', '/billing/bills', 'patient').send({}).expect(403);
  await send('patch', `/billing/bills/${bill._id}`, 'patient').send({}).expect(403);
  await send('get', '/billing/bills?patient=123', 'patient').expect(400);
  await send('get', '/billing/bills/invalid').expect(400);
  await send('post', `/billing/bills/${bill._id}/payments`)
    .send({ ...pay(0, 1), paidMinor: 999 })
    .expect(400);
});
test('manual generation permits completed appointments only and prevents duplicates under concurrency', async () => {
  const a = await appointment();
  const body = {
    appointment: String(a._id),
    additionalItems: [{ description: 'Synthetic service', quantity: 3, unitPriceMinor: 125 }],
    dueDate: hospitalDate(),
    reason: 'Imported visit',
  };
  const results = await Promise.all([1, 2].map(() => send('post', '/billing/bills').send(body)));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await Bill.findOne({ appointment: a._id })).totalMinor, 250425);
  for (const status of ['Scheduled', 'Waiting', 'Cancelled', 'In Consultation']) {
    const pending = await appointment({ status });
    await send('post', '/billing/bills')
      .send({ ...body, appointment: String(pending._id) })
      .expect(409);
  }
});
test('itemised revisions use exact minor units, retain previous versions and reject stale or invalid changes', async () => {
  const bill = await manual();
  const data = {
    revision: 0,
    additionalItems: [{ description: 'Synthetic consumables', quantity: 3, unitPriceMinor: 101 }],
    dueDate: '2000-01-01',
    reason: 'Add service charge',
  };
  const r = await send('patch', `/billing/bills/${bill._id}`).send(data).expect(200);
  assert.equal(r.body.bill.totalMinor, 250353);
  assert.equal(r.body.bill.status, 'Overdue');
  assert.equal(r.body.bill.versions.length, 2);
  assert.equal(r.body.bill.versions[0].totalMinor, 250050);
  await send('patch', `/billing/bills/${bill._id}`).send(data).expect(409);
  for (const bad of [
    { dueDate: '2026-02-30' },
    { reason: '' },
    { additionalItems: [{ description: 'Invalid', quantity: 1.5, unitPriceMinor: 100 }] },
    { additionalItems: [{ description: 'Invalid', quantity: 1, unitPriceMinor: -1 }] },
    { totalMinor: 0 },
  ])
    await send('patch', `/billing/bills/${bill._id}`)
      .send({ ...data, revision: 1, ...bad })
      .expect(400);
});
test('payment retries are idempotent; partial balances and history remain correct', async () => {
  const bill = await manual();
  const body = pay(0, 10000);
  const responses = await Promise.all(
    [1, 2].map(() => send('post', `/billing/bills/${bill._id}/payments`).send(body)),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal(responses[0].body.payment.reference, responses[1].body.payment.reference);
  assert.equal(await Payment.countDocuments({ bill: bill._id }), 1);
  await send('post', `/billing/bills/${bill._id}/payments`)
    .send({ ...body, amountMinor: 20000 })
    .expect(409);
  const r = await send('get', `/billing/bills/${bill._id}`, 'patient').expect(200);
  assert.equal(r.body.bill.paidMinor, 10000);
  assert.equal(r.body.bill.balanceMinor, 240050);
  assert.equal(r.body.bill.status, 'Pending');
  assert.equal(r.body.payments.length, 1);
  assert.equal(r.body.payments[0].requestKey, undefined);
  await send('patch', `/billing/bills/${bill._id}`)
    .send({
      revision: 1,
      additionalItems: [],
      dueDate: hospitalDate(),
      reason: 'Cannot change paid bill',
    })
    .expect(409);
  await send('post', `/billing/bills/${bill._id}/payments`)
    .send(pay(1, 240050, { method: 'Bank transfer', externalReference: 'TEST-TRANSFER' }))
    .expect(201);
  const paid = await send('get', `/billing/bills/${bill._id}`, 'patient').expect(200);
  assert.equal(paid.body.bill.status, 'Paid');
  assert.equal(paid.body.bill.balanceMinor, 0);
});
test('competing distinct payments cannot overpay; amount and method validation is enforced', async () => {
  const bill = await manual();
  const results = await Promise.all(
    [1, 2].map(() =>
      send('post', `/billing/bills/${bill._id}/payments`).send(pay(0, bill.totalMinor)),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await Bill.findById(bill._id)).paidMinor, bill.totalMinor);
  await send('post', `/billing/bills/${bill._id}/payments`).send(pay(1, 1)).expect(409);
  for (const invalid of [
    pay(1, 0),
    pay(1, -1),
    pay(1, 1.5),
    pay(1, 1, { method: 'Card' }),
    pay(1, 1, { method: 'Bank transfer' }),
    pay(1, 1, { requestKey: 'bad' }),
  ])
    await send('post', `/billing/bills/${bill._id}/payments`).send(invalid).expect(400);
});
test('admin reversal preserves receipt and restores balance exactly once; reception cannot reverse', async () => {
  const bill = await manual();
  const response = await send('post', `/billing/bills/${bill._id}/payments`)
    .send(pay(0, 5000))
    .expect(201);
  const path = `/billing/bills/${bill._id}/payments/${response.body.payment.id}/reverse`;
  await send('post', path).send({ revision: 1, reason: 'Correction' }).expect(403);
  const results = await Promise.all(
    [1, 2].map(() =>
      send('post', path, 'admin').send({
        revision: 1,
        reason: 'Duplicate external entry correction',
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const r = await send('get', `/billing/bills/${bill._id}`, 'patient').expect(200);
  assert.equal(r.body.bill.paidMinor, 0);
  assert.equal(r.body.payments.length, 1);
  assert.ok(r.body.payments[0].reversedAt);
  assert.ok(
    await AuditLog.exists({ action: 'payment_reversed', target: response.body.payment.id }),
  );
  await send('patch', `/billing/bills/${bill._id}`)
    .send({
      revision: 2,
      additionalItems: [],
      dueDate: hospitalDate(),
      reason: 'Still locked after reversal',
    })
    .expect(409);
});
test('zero fee bills are paid, overdue uses date boundary and list status/search/pagination work', async () => {
  const zero = await manual({ consultationFeeMinor: 0 });
  assert.equal(zero.status, 'Paid');
  assert.equal(
    billStatus({ totalMinor: 100, paidMinor: 1, dueDate: '2026-10-03' }, '2026-10-03'),
    'Pending',
  );
  assert.equal(
    billStatus({ totalMinor: 100, paidMinor: 1, dueDate: '2026-10-03' }, '2026-10-04'),
    'Overdue',
  );
  assert.equal(
    billStatus({ totalMinor: 100, paidMinor: 100, dueDate: '2026-10-03' }, '2026-10-04'),
    'Paid',
  );
  for (const status of ['Pending', 'Paid', 'Overdue']) {
    const r = await send('get', `/billing/bills?status=${status}&limit=1`).expect(200);
    assert.ok(r.body.total > 0);
    assert.equal(r.body.records.length, 1);
    assert.equal(r.body.records[0].status, status);
  }
  const search = await send('get', `/billing/bills?search=${zero.reference}`, 'patient').expect(
    200,
  );
  assert.equal(search.body.total, 1);
  await send('get', '/billing/bills?search=%5B%2E*').expect(200);
  await send('get', '/billing/bills?limit=100').expect(400);
});
