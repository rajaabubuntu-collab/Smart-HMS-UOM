import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { registerSchema } from '../src/validation.js';
import {
  User,
  Patient,
  Doctor,
  DoctorSchedule,
  AppointmentSlot,
  Appointment,
  AuditLog,
  connectDatabase,
} from '../src/models.js';
import { hospitalDate, localInstant, dayBounds } from '../src/scheduling/time.js';
import { testPassword, testConfig, isolatedUri, seedTestAccounts } from './helpers.js';

let app, fixtures, doctor, otherDoctor, patient, otherPatient;
const tokens = {};
let nextDay = 1;
const futureDay = () => hospitalDate(new Date(Date.now() + nextDay++ * 86400000));
function send(method, path, role = 'admin') {
  return request(app)[method](path).set('Origin', testConfig.origin).set('Cookie', tokens[role]);
}
async function schedule(options = {}) {
  const body = {
    doctor: String(doctor._id),
    date: futureDay(),
    startTime: '09:00',
    endTime: '10:00',
    slotMinutes: 15,
    ...options,
  };
  const response = await send('post', '/api/schedules').send(body).expect(201);
  const slots = await AppointmentSlot.find({ schedule: response.body.schedule._id }).sort({
    startsAt: 1,
  });
  return { ...response.body.schedule, slots, body };
}
async function book(slot, role = 'patient', patientId) {
  return send('post', '/api/appointments', role).send({
    slot: String(slot._id),
    ...(patientId ? { patient: String(patientId) } : {}),
  });
}
before(async () => {
  await connectDatabase(isolatedUri('scheduling'));
  fixtures = await seedTestAccounts();
  doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
  patient = await Patient.findOne({ user: fixtures.users.patient._id });
  const passwordHash = (await User.findById(fixtures.users.patient._id).select('+passwordHash'))
    .passwordHash;
  const secondUser = await User.create({
    name: 'Second Patient',
    email: 'other@test.local',
    role: 'patient',
    passwordHash,
  });
  otherPatient = await Patient.create({
    user: secondUser._id,
    dateOfBirth: '2000-01-01',
    gender: 'other',
    allergies: ['Sample allergy'],
  });
  const secondDoctorUser = await User.create({
    name: 'Second Doctor',
    email: 'otherdoctor@test.local',
    role: 'doctor',
    passwordHash,
  });
  otherDoctor = await Doctor.create({
    user: secondDoctorUser._id,
    department: fixtures.department._id,
    specialization: 'General Medicine',
    consultationFeeMinor: 100000,
  });
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const role of ['admin', 'doctor', 'receptionist', 'patient', 'other', 'otherdoctor']) {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', testConfig.origin)
      .send({ email: `${role}@test.local`, password: testPassword })
      .expect(200);
    tokens[role] = response.headers['set-cookie'][0].split(';')[0];
  }
});
after(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('Sri Lanka midnight boundaries map to the correct UTC day', () => {
  assert.equal(localInstant('2026-10-04', '00:15').toISOString(), '2026-10-03T18:45:00.000Z');
  assert.equal(hospitalDate(new Date('2026-10-03T18:29:59Z')), '2026-10-03');
  assert.equal(hospitalDate(new Date('2026-10-03T18:30:00Z')), '2026-10-04');
  const bounds = dayBounds('2026-10-04');
  assert.equal(bounds.end - bounds.start, 86400000);
});
test('only administrators publish sessions; slots are generated exactly in local time', async () => {
  const data = {
    doctor: String(doctor._id),
    date: futureDay(),
    startTime: '09:00',
    endTime: '10:00',
    slotMinutes: 15,
  };
  for (const role of ['doctor', 'patient', 'receptionist'])
    await send('post', '/api/schedules', role).send(data).expect(403);
  const session = await schedule(data);
  assert.equal(session.slots.length, 4);
  assert.equal(session.slots[0].startsAt.toISOString(), `${data.date}T03:30:00.000Z`);
  assert.equal(session.slots[3].endsAt.toISOString(), `${data.date}T04:30:00.000Z`);
  assert.ok(await AuditLog.exists({ action: 'schedule_created', target: session._id }));
});
test('invalid, past, oversized, nondivisible and overlapping sessions are rejected', async () => {
  const existing = await schedule();
  for (const change of [
    { date: '2026-02-30' },
    { date: '2000-01-01' },
    { date: '2999-01-01' },
    { startTime: '10:00', endTime: '09:00' },
    { slotMinutes: 17 },
    { startTime: '00:00', endTime: '23:00' },
    { startTime: '25:00' },
  ])
    await send('post', '/api/schedules')
      .send({ ...existing.body, ...change })
      .expect(400);
  await send('post', '/api/schedules').send(existing.body).expect(409);
  assert.equal(await DoctorSchedule.countDocuments({ doctor: doctor._id, date: existing.date }), 1);
});
test('concurrent overlapping sessions cannot bypass the overlap check', async () => {
  const date = futureDay();
  const results = await Promise.all([
    send('post', '/api/schedules').send({
      doctor: String(doctor._id),
      date,
      startTime: '09:00',
      endTime: '10:00',
      slotMinutes: 15,
    }),
    send('post', '/api/schedules').send({
      doctor: String(doctor._id),
      date,
      startTime: '09:10',
      endTime: '10:10',
      slotMinutes: 20,
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});
test('directory filters doctors and availability exposes no patient information', async () => {
  const session = await schedule();
  const list = await send(
    'get',
    `/api/directory/doctors?department=${fixtures.department._id}&search=Second`,
    'patient',
  ).expect(200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].name, 'Second Doctor');
  const availability = await send(
    'get',
    `/api/directory/doctors/${doctor._id}/availability?date=${session.date}`,
    'patient',
  ).expect(200);
  assert.equal(availability.body.slots.length, 4);
  assert.equal(availability.body.timezone, 'Asia/Colombo');
  assert.ok(!JSON.stringify(availability.body).includes('patient'));
  await send('get', '/api/directory/doctors?search=%5B', 'patient').expect(200); // regex is escaped
});
test('competing patients cannot book the same slot; cancellation makes it reusable', async () => {
  const session = await schedule();
  const results = await Promise.all([book(session.slots[0]), book(session.slots[0], 'other')]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const appointment = results.find((r) => r.status === 201).body.appointment;
  assert.equal(
    await Appointment.countDocuments({ slot: session.slots[0]._id, holdsSlot: true }),
    1,
  );
  await send('post', `/api/appointments/${appointment.id}/cancel`)
    .send({ reason: 'Patient requested cancellation' })
    .expect(200);
  const replacement = await book(session.slots[0], 'other');
  assert.equal(replacement.status, 201);
  assert.equal(await Appointment.countDocuments({ slot: session.slots[0]._id }), 2);
  const availability = await send(
    'get',
    `/api/directory/doctors/${doctor._id}/availability?date=${session.date}`,
  ).expect(200);
  assert.equal(availability.body.slots.length, 3);
});
test('patient cannot reserve overlapping appointments with different doctors concurrently', async () => {
  const a = await schedule(),
    b = await schedule({ doctor: String(otherDoctor._id), date: a.date });
  const results = await Promise.all([book(a.slots[0]), book(b.slots[0])]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});
test('patients cannot impersonate another patient, view another record, or check themselves in', async () => {
  const session = await schedule();
  await send('post', '/api/appointments', 'patient')
    .send({ slot: String(session.slots[0]._id), patient: String(otherPatient._id) })
    .expect(400);
  const response = await book(session.slots[0], 'other');
  const id = response.body.appointment.id;
  await send('get', `/api/appointments/${id}`, 'patient').expect(404);
  await send('post', `/api/appointments/${id}/cancel`, 'patient')
    .send({ reason: 'Not mine' })
    .expect(404);
  await send('get', `/api/appointments?patient=${otherPatient._id}`, 'patient').expect(403);
  await send('post', `/api/appointments/${id}/check-in`, 'patient').send({}).expect(403);
  await send('post', `/api/appointments/${id}/reschedule`, 'patient')
    .send({ slot: String(session.slots[1]._id), reason: 'Move' })
    .expect(403);
  const list = await send('get', `/api/appointments?date=${session.date}`, 'patient').expect(200);
  assert.equal(list.body.items.length, 0);
});
test('doctors see only their own sessions and appointments; clinical intake is scoped to assigned appointments', async () => {
  const session = await schedule();
  const booked = await book(session.slots[0], 'other');
  const id = booked.body.appointment.id;
  const own = await send('get', `/api/appointments/${id}`, 'doctor').expect(200);
  assert.deepEqual(own.body.appointment.patient.allergies, ['Sample allergy']);
  await send('get', `/api/appointments/${id}`, 'otherdoctor').expect(404);
  await send('get', `/api/appointments?doctor=${doctor._id}`, 'otherdoctor').expect(403);
  await send('get', `/api/schedules?doctor=${doctor._id}`, 'otherdoctor').expect(403);
  await send('get', `/api/reception/patients/${otherPatient._id}`, 'doctor').expect(403);
  await send('post', `/api/appointments/${id}/cancel`, 'other')
    .send({ reason: 'Changed plans' })
    .expect(200);
  const cancelled = await send('get', `/api/appointments/${id}`, 'doctor').expect(200);
  assert.equal(cancelled.body.appointment.patient.allergies, undefined);
});
test('staff can book on behalf of a patient but must provide a patient ID', async () => {
  const session = await schedule();
  await book(session.slots[0], 'receptionist').then((r) => assert.equal(r.status, 400));
  const result = await book(session.slots[0], 'receptionist', patient._id);
  assert.equal(result.status, 201);
  const persisted = await Appointment.findById(result.body.appointment.id);
  assert.equal(String(persisted.bookedBy), String(fixtures.users.receptionist._id));
  await book(session.slots[1], 'doctor').then((r) => assert.equal(r.status, 403));
});
test('rescheduling is atomic: a taken target keeps the original slot, successful move releases it', async () => {
  const session = await schedule();
  const first = (await book(session.slots[0])).body.appointment;
  await book(session.slots[1], 'other');
  await send('post', `/api/appointments/${first.id}/reschedule`, 'receptionist')
    .send({ slot: String(session.slots[1]._id), reason: 'Requested move' })
    .expect(409);
  assert.equal(String((await Appointment.findById(first.id)).slot), String(session.slots[0]._id));
  const moved = await send('post', `/api/appointments/${first.id}/reschedule`, 'receptionist')
    .send({ slot: String(session.slots[2]._id), reason: 'Requested later time' })
    .expect(200);
  assert.equal(moved.body.appointment.reference, first.reference);
  assert.equal(moved.body.appointment.history.at(-1).action, 'Rescheduled');
  assert.equal((await book(session.slots[0], 'other')).status, 201);
});
test('closing a session with open appointments is blocked; closing an empty session removes availability', async () => {
  const session = await schedule();
  const booking = (await book(session.slots[0])).body.appointment;
  await send('post', `/api/schedules/${session._id}/close`)
    .send({ reason: 'Doctor leave' })
    .expect(409);
  await send('post', `/api/appointments/${booking.id}/cancel`)
    .send({ reason: 'Doctor unavailable' })
    .expect(200);
  await send('post', `/api/schedules/${session._id}/close`)
    .send({ reason: 'Doctor leave' })
    .expect(200);
  const availability = await send(
    'get',
    `/api/directory/doctors/${doctor._id}/availability?date=${session.date}`,
  ).expect(200);
  assert.equal(availability.body.slots.length, 0);
  assert.equal((await book(session.slots[0])).status, 409);
  await schedule(session.body); // A replacement session may reuse inactive slots' times.
});
test('check-in is same-day only; repeated and terminal transitions are rejected', async () => {
  const session = await schedule();
  const booking = (await book(session.slots[0])).body.appointment;
  await send('post', `/api/appointments/${booking.id}/check-in`, 'receptionist')
    .send({})
    .expect(409);
  await Appointment.updateOne(
    { _id: booking.id },
    {
      startsAt: localInstant(hospitalDate(), '09:00'),
      endsAt: localInstant(hospitalDate(), '09:15'),
    },
  );
  const checked = await send('post', `/api/appointments/${booking.id}/check-in`, 'receptionist')
    .send({})
    .expect(200);
  assert.equal(checked.body.appointment.status, 'Waiting');
  assert.ok(checked.body.appointment.checkedInAt);
  await send('post', `/api/appointments/${booking.id}/check-in`, 'receptionist')
    .send({})
    .expect(409);
  await send('post', `/api/appointments/${booking.id}/cancel`, 'patient')
    .send({ reason: 'Cannot self-cancel waiting' })
    .expect(409);
  await send('post', `/api/appointments/${booking.id}/cancel`, 'receptionist')
    .send({ reason: 'Patient left the hospital' })
    .expect(200);
  await send('post', `/api/appointments/${booking.id}/check-in`, 'receptionist')
    .send({})
    .expect(409);
  assert.ok(await AuditLog.exists({ action: 'appointment_checked_in', target: booking.id }));
});
test('past slots cannot be booked; cancelled appointments and past dates appear in history', async () => {
  const session = await schedule();
  await AppointmentSlot.updateOne(
    { _id: session.slots[0]._id },
    { startsAt: new Date(Date.now() - 60000) },
  );
  assert.equal((await book(session.slots[0])).status, 409);
  const booked = (await book(session.slots[1])).body.appointment;
  await send('post', `/api/appointments/${booked.id}/cancel`, 'patient')
    .send({ reason: 'Changed plans' })
    .expect(200);
  const history = await send(
    'get',
    `/api/appointments?view=history&date=${session.date}`,
    'patient',
  ).expect(200);
  assert.ok(history.body.items.some((i) => i.id === booked.id));
  const upcoming = await send(
    'get',
    `/api/appointments?view=upcoming&date=${session.date}`,
    'patient',
  ).expect(200);
  assert.ok(!upcoming.body.items.some((i) => i.id === booked.id));
});
test('walk-in registration preserves receptionist session and captures reported allergies', async () => {
  const data = {
    name: 'Walk-in Patient',
    email: 'walkin@test.local',
    password: testPassword,
    phone: '0771234567',
    dateOfBirth: '1980-04-03',
    gender: 'female',
    allergies: ['Reported penicillin allergy'],
    bloodType: 'O+',
  };
  await send('post', '/api/reception/patients', 'patient').send(data).expect(403);
  const created = await send('post', '/api/reception/patients', 'receptionist')
    .send(data)
    .expect(201);
  assert.equal(created.headers['set-cookie'], undefined);
  assert.deepEqual(created.body.profile.allergies, data.allergies);
  const me = await send('get', '/api/auth/me', 'receptionist').expect(200);
  assert.equal(me.body.user.role, 'receptionist');
  await send('post', '/api/reception/patients', 'receptionist').send(data).expect(409);
  const search = await send('get', '/api/reception/patients?search=walkin', 'receptionist').expect(
    200,
  );
  assert.equal(search.body.total, 1);
  assert.equal(search.body.items[0].id, created.body.profile._id);
  assert.ok(!JSON.stringify(search.body).includes('password'));
});
test('staff intake updates are audited and patient self-service cannot change clinical fields', async () => {
  const payload = {
    name: 'Updated Patient',
    phone: '0772222222',
    dateOfBirth: '2000-01-01',
    gender: 'other',
    bloodType: 'B+',
    allergies: ['New reported allergy'],
    address: 'Sample address',
    emergencyContact: { name: 'Sample Contact', phone: '0771111111', relationship: 'Sibling' },
  };
  await send('patch', `/api/reception/patients/${otherPatient._id}`, 'patient')
    .send(payload)
    .expect(403);
  await send('patch', `/api/reception/patients/${otherPatient._id}`, 'receptionist')
    .send(payload)
    .expect(200);
  const saved = await send('get', '/api/patients/me', 'other').expect(200);
  assert.deepEqual(saved.body.profile.allergies, payload.allergies);
  assert.ok(
    await AuditLog.exists({ action: 'patient_intake_updated', target: String(otherPatient._id) }),
  );
});
test('staff profile edits retain booked snapshots; doctor deactivation is blocked with open appointments', async () => {
  const session = await schedule();
  const booking = (await book(session.slots[0])).body.appointment;
  const body = { name: 'Updated Doctor', phone: '', isActive: true, consultationFeeMinor: 900000 };
  await send('patch', `/api/admin/staff/${fixtures.users.doctor._id}`).send(body).expect(200);
  const saved = await Appointment.findById(booking.id);
  assert.equal(saved.doctorName, 'Test doctor');
  assert.equal(saved.consultationFeeMinor, 250000);
  await send('patch', `/api/admin/staff/${fixtures.users.doctor._id}`)
    .send({ ...body, isActive: false })
    .expect(409);
});
test('deactivation of unused staff revokes sessions and removes doctor availability', async () => {
  // A dedicated account avoids changing other test fixtures with existing bookings.
  const hash = (await User.findById(fixtures.users.patient._id).select('+passwordHash'))
    .passwordHash;
  const user = await User.create({
    name: 'Unused Doctor',
    email: 'unused@test.local',
    role: 'doctor',
    passwordHash: hash,
  });
  const unused = await Doctor.create({
    user: user._id,
    department: fixtures.department._id,
    specialization: 'General',
    consultationFeeMinor: 0,
  });
  const login = await request(app)
    .post('/api/auth/login')
    .set('Origin', testConfig.origin)
    .send({ email: user.email, password: testPassword })
    .expect(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  await send('patch', `/api/admin/staff/${user._id}`)
    .send({ name: user.name, phone: '', isActive: false })
    .expect(200);
  await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  await send('get', `/api/directory/doctors/${unused._id}/availability?date=${futureDay()}`).expect(
    404,
  );
});
test('pagination, malformed IDs and filters are bounded without leaking raw records', async () => {
  const result = await send('get', '/api/appointments?limit=1&page=2').expect(200);
  assert.equal(result.body.items.length, 1);
  assert.ok(result.body.total > 1);
  await send('get', '/api/appointments?limit=200').expect(400);
  await send('get', '/api/appointments/not-an-id').expect(400);
  await send('get', '/api/appointments?date=2026-02-30').expect(400);
  await send('get', '/api/reception/patients?search=x', 'receptionist').expect(400);
  await send('get', '/api/schedules', 'patient').expect(403);
});

test('birth dates use the hospital calendar date even when UTC is still yesterday', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-03T20:00:00Z') });
  const body = {
    name: 'Sample',
    email: 'sample@example.com',
    password: testPassword,
    gender: 'other',
    dateOfBirth: '2026-10-04',
  };
  assert.equal(registerSchema.safeParse(body).success, true);
  assert.equal(registerSchema.safeParse({ ...body, dateOfBirth: '2026-10-05' }).success, false);
});

test('racing session closure and booking never creates an appointment in a closed session', async () => {
  const session = await schedule();
  const [booking, closure] = await Promise.all([
    book(session.slots[0]),
    send('post', `/api/schedules/${session._id}/close`).send({ reason: 'Doctor unavailable' }),
  ]);
  if (booking.status === 201) {
    assert.equal(closure.status, 409);
    assert.equal((await DoctorSchedule.findById(session._id)).isActive, true);
  } else {
    assert.equal(booking.status, 409);
    assert.equal(closure.status, 200);
    assert.equal(await Appointment.countDocuments({ schedule: session._id }), 0);
  }
});

test('competing reschedules reserve a target once and preserve the losing original', async () => {
  const session = await schedule();
  const a = (await book(session.slots[0])).body.appointment;
  const b = (await book(session.slots[1], 'other')).body.appointment;
  const results = await Promise.all(
    [a, b].map((item) =>
      send('post', `/api/appointments/${item.id}/reschedule`, 'receptionist').send({
        slot: String(session.slots[2]._id),
        reason: 'Competing request',
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const loserIndex = results.findIndex((r) => r.status === 409);
  const loser = [a, b][loserIndex];
  assert.equal(
    String((await Appointment.findById(loser.id)).slot),
    String(session.slots[loserIndex]._id),
  );
  assert.equal(
    await Appointment.countDocuments({ slot: session.slots[2]._id, holdsSlot: true }),
    1,
  );
});
