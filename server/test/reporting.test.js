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
  AppointmentSlot,
  DoctorSchedule,
  Consultation,
  Bill,
  Payment,
  Feedback,
  AuditLog,
} from '../src/models.js';
import { localInstant } from '../src/scheduling/time.js';
import { testConfig, isolatedUri, seedTestAccounts, testPassword } from './helpers.js';
import { reports } from '../src/reporting/definitions.js';
let app, fixtures, patient, doctor, secondDoctor, mainVisit;
const tokens = {};
const oid = () => new mongoose.Types.ObjectId();
const from = '2026-01-01',
  to = '2026-01-31';
const get = (path, role = 'admin') => request(app).get(`/api${path}`).set('Cookie', tokens[role]);
const report = (type, extra = '') => get(`/admin/reports/${type}?from=${from}&to=${to}${extra}`);
const totals = (body) => Object.fromEntries(body.summary.map((m) => [m.key, m.value]));
async function timestamp(model, id, createdAt) {
  await model.collection.updateOne({ _id: id }, { $set: { createdAt: new Date(createdAt) } });
}
async function visit(
  reference,
  status,
  date,
  departmentName = 'General Medicine',
  assigned = doctor._id,
) {
  return Appointment.create({
    reference,
    patient: patient._id,
    doctor: assigned,
    slot: oid(),
    schedule: oid(),
    bookedBy: fixtures.users.patient._id,
    startsAt: new Date(date),
    endsAt: new Date(new Date(date).getTime() + 900000),
    doctorName: assigned.equals(doctor._id) ? 'Booked doctor' : 'Booked specialist',
    departmentName,
    consultationFeeMinor: 1000,
    status,
    reason: 'PRIVATE-CLINICAL-TEXT',
  });
}
before(async () => {
  await connectDatabase(isolatedUri('reporting'));
  fixtures = await seedTestAccounts();
  patient = await Patient.findOne({ user: fixtures.users.patient._id });
  doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
  const passwordHash = (await User.findById(fixtures.users.patient._id).select('+passwordHash'))
    .passwordHash;
  await timestamp(Patient, patient._id, localInstant('2026-01-10'));
  for (const [name, dob, at] of [
    ['Birthday', '2008-01-31', new Date(localInstant('2026-02-01').getTime() - 1)],
    ['Child', '2008-02-01', localInstant(from)],
    ['Unknown', 'invalid', localInstant('2026-01-10')],
    ['Outside', '1990-01-01', localInstant('2026-02-01')],
  ]) {
    const user = await User.create({
      name,
      email: `${name}@test.local`,
      role: 'patient',
      passwordHash,
    });
    const profile = await Patient.create({
      user: user._id,
      dateOfBirth: dob,
      gender: 'other',
      allergies: ['PRIVATE-ALLERGY'],
    });
    await timestamp(Patient, profile._id, at);
  }
  const specialty = await Department.create({ name: 'Surgery', nameKey: 'surgery' });
  const staff = await User.create({
    name: 'Inactive specialist',
    email: 'specialist@test.local',
    passwordHash,
    role: 'doctor',
    isActive: false,
  });
  secondDoctor = await Doctor.create({
    user: staff._id,
    department: specialty._id,
    specialization: 'Surgery',
    consultationFeeMinor: 1000,
  });
  mainVisit = await visit('REPORT-A', 'Completed', localInstant('2026-01-15'));
  await visit(
    'REPORT-B',
    'Cancelled',
    new Date(localInstant('2026-01-16').getTime() - 1),
    'Surgery',
  );
  await visit('REPORT-C', 'Waiting', localInstant('2026-01-15', '12:00'));
  await visit('REPORT-D', 'Scheduled', new Date(localInstant('2026-01-15').getTime() - 1));
  const second = await visit('REPORT-E', 'Completed', localInstant('2026-01-16'), 'Surgery');
  const outside = await visit('REPORT-F', 'Scheduled', localInstant('2026-02-01'));
  const specialtyVisit = await visit(
    'REPORT-G',
    'Completed',
    localInstant('2026-01-28'),
    'Surgery',
    secondDoctor._id,
  );
  const legacy = await visit('REPORT-H', 'Completed', localInstant('2026-01-29'));
  for (const [appointment, completedAt] of [
    [mainVisit, localInstant('2026-01-15')],
    [second, localInstant('2026-01-16')],
    [specialtyVisit, new Date(localInstant('2026-02-01').getTime() - 1)],
  ])
    await Consultation.create({
      appointment: appointment._id,
      patient: patient._id,
      doctor: appointment.doctor,
      status: 'Completed',
      completedAt,
      notes: 'PRIVATE-NOTE',
      diagnosis: 'PRIVATE-DIAGNOSIS',
      currentMedications: 'PRIVATE-MEDICATION',
    });
  await Consultation.create({
    appointment: outside._id,
    patient: patient._id,
    doctor: doctor._id,
    status: 'Draft',
    notes: 'PRIVATE-DRAFT',
  });
  for (const [date, isActive, assigned, count] of [
    ['2026-01-15', true, doctor._id, 2],
    ['2026-01-16', false, secondDoctor._id, 1],
  ]) {
    const startsAt = localInstant(date, '09:00'),
      endsAt = localInstant(date, '10:00');
    const schedule = await DoctorSchedule.create({
      doctor: assigned,
      date,
      startsAt,
      endsAt,
      slotMinutes: 30,
      isActive,
      createdBy: fixtures.users.admin._id,
    });
    for (let i = 0; i < count; i++)
      await AppointmentSlot.create({
        schedule: schedule._id,
        doctor: assigned,
        startsAt: new Date(startsAt.getTime() + i * 1800000),
        endsAt: new Date(startsAt.getTime() + (i + 1) * 1800000),
        isActive,
      });
  }
  let mainBill, outsideBill;
  for (const [appointment, totalMinor, paidMinor, dueDate, at] of [
    [mainVisit, 1000, 600, '2000-01-01', localInstant('2026-01-15')],
    [second, 0, 0, '2000-01-01', localInstant('2026-01-16')],
    [specialtyVisit, 500, 0, '2199-01-01', localInstant('2026-01-28')],
    [outside, 1000, 500, '2199-01-01', localInstant('2026-02-01')],
  ]) {
    const bill = await Bill.create({
      reference: `INV-${appointment.reference}`,
      appointment: appointment._id,
      patient: patient._id,
      doctor: appointment.doctor,
      totalMinor,
      paidMinor,
      dueDate,
    });
    await timestamp(Bill, bill._id, at);
    if (appointment === mainVisit) mainBill = bill;
    if (appointment === outside) outsideBill = bill;
  }
  for (const [amountMinor, method, at, reversedAt, bill] of [
    [600, 'Cash', '2026-01-10', '2026-01-11', mainBill],
    [200, 'Bank transfer', '2025-12-20', '2026-01-20', mainBill],
    [400, 'Cash', '2026-01-25', '2026-02-01', mainBill],
    [600, 'Cash', '2026-10-01', null, mainBill],
    [500, 'Cash', '2026-02-01', null, outsideBill],
  ]) {
    const p = await Payment.create({
      bill: bill._id,
      reference: `RCT-${oid()}`,
      requestKey: String(oid()),
      actor: fixtures.users.admin._id,
      amountMinor,
      method,
      ...(reversedAt ? { reversedAt: localInstant(reversedAt) } : {}),
    });
    await timestamp(Payment, p._id, localInstant(at));
  }
  for (const [appointment, rating, at] of [
    [mainVisit, 5, '2026-01-15'],
    [second, 5, '2026-01-16'],
    [legacy, 1, '2026-01-31'],
    [outside, 2, '2026-02-01'],
  ]) {
    const f = await Feedback.create({
      appointment: appointment._id,
      patient: patient._id,
      doctor: appointment.doctor,
      appointmentReference: appointment.reference,
      patientName: 'Private feedback patient',
      doctorName: appointment.doctorName,
      departmentName: appointment.departmentName,
      visitAt: appointment.startsAt,
      rating,
      comment: 'PRIVATE-FEEDBACK',
    });
    await timestamp(Feedback, f._id, localInstant(at));
  }
  const logs = await AuditLog.create([
    {
      actor: fixtures.users.admin._id,
      action: 'profile_updated',
      module: 'patients',
      target: '[literal-target]',
    },
    {
      actor: fixtures.users.patient._id,
      action: 'profile_updated',
      module: 'patients',
      target: 'another-target',
    },
    { action: 'login_failed', module: 'authentication' },
    { actor: oid(), action: 'legacy_action', module: 'legacy', target: 'missing account' },
  ]);
  await timestamp(AuditLog, logs[0]._id, localInstant('2026-01-15'));
  await timestamp(AuditLog, logs[1]._id, new Date(localInstant('2026-01-16').getTime() - 1));
  await timestamp(AuditLog, logs[2]._id, new Date(localInstant('2026-01-15').getTime() - 1));
  await timestamp(AuditLog, logs[3]._id, localInstant('2026-01-16'));
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
test('all ten reports and audit endpoints are admin-only, authenticated and strictly validated', async () => {
  const paths = [
    '/admin/reports',
    '/admin/audit',
    '/admin/audit/options',
    ...Object.keys(reports).map((t) => `/admin/reports/${t}`),
  ];
  for (const path of paths) {
    await request(app).get(`/api${path}`).expect(401);
    for (const role of ['patient', 'doctor', 'receptionist']) await get(path, role).expect(403);
  }
  const catalogue = await get('/admin/reports').expect(200);
  assert.equal(catalogue.body.reports.length, 10);
  for (const query of [
    'from=2026-02-30&to=2026-03-01',
    'from=2026-02-01&to=2026-01-01',
    'from=2025-01-01&to=2026-01-02',
    'page=0',
    'limit=51',
    'doctor=anything',
    'from=1800-01-01',
    'from[$ne]=x',
  ]) {
    await get(`/admin/reports/revenue?${query}`).expect(400);
    await get(`/admin/audit?${query}`).expect(400);
  }
  await report('appointments').expect(400);
  await get('/admin/reports/unknown').expect(400);
  await get(`/admin/audit?q=${'a'.repeat(101)}`).expect(400);
});
test('daily appointments use inclusive Sri Lanka dates, exclude both neighbouring instants, and keep totals across pages', async () => {
  const r = await get('/admin/reports/appointments?from=2026-01-15&to=2026-01-15&limit=1').expect(
    200,
  );
  assert.equal(r.body.total, 3);
  assert.deepEqual(totals(r.body), { count: 3, completed: 1, cancelled: 1, pending: 1 });
  assert.equal(r.body.records[0].reference, 'REPORT-A');
  assert.equal(r.body.records[0].patientName, 'Test patient');
  assert.equal(r.body.records[0].doctorName, 'Booked doctor');
  assert.equal(r.body.period.timezone, 'Asia/Colombo');
  const second = await get(
    '/admin/reports/appointments?from=2026-01-15&to=2026-01-15&limit=1&page=2',
  ).expect(200);
  assert.equal(second.body.records[0].reference, 'REPORT-C');
  assert.deepEqual(second.body.summary, r.body.summary);
});
test('schedule report includes closed sessions and counts generated versus active slots', async () => {
  const r = await report('schedules').expect(200);
  assert.deepEqual(totals(r.body), { count: 2, active: 1, slots: 3, activeSlots: 2 });
  assert.equal(r.body.records[1].state, 'Closed');
  assert.equal(r.body.records[1].doctorName, 'Inactive specialist');
});
test('consultation completion dates and doctor workload exclude drafts and legacy-only completed visits', async () => {
  const c = await report('consultations').expect(200);
  assert.equal(totals(c.body).count, 3);
  assert.equal(c.body.records.length, 3);
  assert.deepEqual(
    c.body.records.map((r) => r.date),
    ['2026-01-15', '2026-01-16', '2026-01-31'],
  );
  const w = await report('workload').expect(200);
  assert.deepEqual(totals(w.body), { count: 3, doctors: 2 });
  assert.equal(w.body.records[0].count, 2);
  assert.equal(w.body.records[1].doctorName, 'Inactive specialist');
});
test('registrations and demographics share a cohort, handle birthday boundaries and avoid identifying aggregate data', async () => {
  const r = await report('registrations').expect(200);
  assert.equal(totals(r.body).count, 4);
  assert.equal(r.body.records.length, 4);
  assert.ok(!r.body.records.some((p) => p.name === 'Outside'));
  assert.equal(r.body.records[0].name, 'Child');
  const d = await report('demographics').expect(200);
  assert.deepEqual(totals(d.body), { count: 4, unknownAge: 1 });
  assert.equal(d.body.records.find((row) => row.ageBand === '0–17').count, 1);
  assert.equal(
    d.body.records.filter((row) => row.ageBand === '18–34').reduce((n, r) => n + r.count, 0),
    2,
  );
  assert.ok(!JSON.stringify(d.body).includes('dateOfBirth'));
  assert.ok(!JSON.stringify(d.body.records).includes('patientId'));
});
test('revenue reconciles receipt and reversal events by their own dates, including prior-period receipts and later reversals', async () => {
  const r = await report('revenue').expect(200);
  assert.deepEqual(totals(r.body), { receiptsMinor: 1000, reversalsMinor: 800, netMinor: 200 });
  assert.equal(r.body.records.find((row) => row.date === '2026-01-20').netMinor, -200);
  assert.equal(r.body.records.find((row) => row.date === '2026-01-25').netMinor, 400);
  const feb = await get('/admin/reports/revenue?from=2026-02-01&to=2026-02-01').expect(200);
  assert.deepEqual(totals(feb.body), { receiptsMinor: 500, reversalsMinor: 400, netMinor: 100 });
  const paged = await report('revenue', '&limit=1&page=2').expect(200);
  assert.deepEqual(paged.body.summary, r.body.summary);
});
test('billing summarises invoice cohorts using current balances, treating zero-value invoices as paid', async () => {
  const r = await report('billing').expect(200);
  assert.deepEqual(totals(r.body), {
    count: 3,
    totalMinor: 1500,
    paidMinor: 600,
    balanceMinor: 900,
  });
  assert.equal(r.body.records.find((row) => row.status === 'Paid').count, 1);
  assert.equal(r.body.records.find((row) => row.status === 'Overdue').balanceMinor, 400);
  assert.equal(r.body.records.find((row) => row.status === 'Pending').balanceMinor, 500);
});
test('department counts use booking snapshots and feedback average is weighted by submissions', async () => {
  const d = await report('departments').expect(200);
  assert.deepEqual(totals(d.body), { count: 7, completed: 4, cancelled: 1 });
  assert.equal(d.body.records.find((row) => row.departmentName === 'General Medicine').count, 4);
  const f = await report('feedback').expect(200);
  assert.equal(totals(f.body).count, 3);
  assert.equal(totals(f.body).average, 11 / 3);
  assert.deepEqual(f.body.records, [
    { count: 2, rating: 5 },
    { count: 1, rating: 1 },
  ]);
});
test('empty reports return zero totals, empty pages and no fabricated feedback average; no clinical/contact fields leak', async () => {
  for (const type of Object.keys(reports)) {
    const empty = await get(`/admin/reports/${type}?from=2020-01-01&to=2020-01-01`).expect(200);
    assert.equal(empty.body.total, 0);
    assert.deepEqual(empty.body.records, []);
    for (const m of empty.body.summary) assert.equal(m.value, m.key === 'average' ? null : 0);
    const full = await get(`/admin/reports/${type}?from=2026-01-15&to=2026-01-15`).expect(200);
    const text = JSON.stringify(full.body);
    for (const value of [
      'PRIVATE-',
      'passwordHash',
      'dateOfBirth',
      'allergies',
      '@test.local',
      'currentMedications',
      'diagnosis',
      'externalReference',
    ])
      assert.ok(!text.includes(value), `${type}: ${value}`);
  }
});
test('audit filters combine user, exact action, module, literal search and hospital-day bounds with UTC timestamps', async () => {
  const base = '/admin/audit?from=2026-01-15&to=2026-01-15';
  const all = await get(base).expect(200);
  assert.equal(all.body.total, 2);
  assert.equal(all.body.records[0].createdAt, '2026-01-15T18:29:59.999Z');
  const filtered = await get(
    `${base}&user=TEST%20ADMIN&module=patients&action=profile_updated&q=${encodeURIComponent('[literal-target]')}`,
  ).expect(200);
  assert.equal(filtered.body.total, 1);
  assert.equal(filtered.body.records[0].actorId, String(fixtures.users.admin._id));
  assert.equal(filtered.body.records[0].createdAt, '2026-01-14T18:30:00.000Z');
  assert.equal((await get(`${base}&user=${fixtures.users.patient._id}`)).body.total, 1);
  assert.equal((await get(`${base}&q=.*`)).body.total, 0);
  const a = await get(`${base}&limit=1`).expect(200),
    b = await get(`${base}&limit=1&page=2`).expect(200);
  assert.notEqual(a.body.records[0].id, b.body.records[0].id);
  assert.ok(!JSON.stringify(all.body).includes('@test.local'));
});
test('unlinked and missing audit actors remain visible and events have no mutation endpoints', async () => {
  const r = await get('/admin/audit?from=2026-01-01&to=2026-01-31').expect(200);
  assert.equal(r.body.total, 4);
  assert.equal(r.body.records.find((row) => row.action === 'login_failed').actorId, null);
  const missing = r.body.records.find((row) => row.action === 'legacy_action');
  assert.equal(missing.actorName, 'Unlinked actor');
  assert.ok(missing.actorId);
  const options = await get('/admin/audit/options').expect(200);
  assert.ok(options.body.actions.includes('login_failed'));
  assert.ok(options.body.modules.includes('patients'));
  for (const method of ['patch', 'delete']) {
    const attempt = request(app)[method](`/api/admin/audit/${missing.id}`);
    await attempt
      .set('Cookie', tokens.admin)
      .set('Origin', testConfig.origin)
      .send({ action: 'changed' })
      .expect(404);
  }
  assert.equal((await AuditLog.findById(missing.id)).action, 'legacy_action');
});
