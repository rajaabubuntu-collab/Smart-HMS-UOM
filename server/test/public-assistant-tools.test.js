import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  connectDatabase,
  Department,
  Doctor,
  User,
  DoctorSchedule,
  AppointmentSlot,
  Appointment,
  Patient,
} from '../src/models.js';
import { isolatedUri, seedTestAccounts } from './helpers.js';
import { searchAssistantDoctors } from '../src/public/assistant-directory.js';
import { createHospitalAssistant } from '../src/public/assistant.js';
import { localInstant } from '../src/scheduling/time.js';
import { safePatientReturn } from '../../client/src/auth-destinations.js';
const now = new Date('2026-10-26T00:00:00Z');
const plan = (extra = {}) => ({
  kind: 'search',
  factIds: [],
  reply: '',
  query: '',
  doctorId: '',
  departmentId: '',
  date: '',
  period: 'any',
  ...extra,
});
const envelope = (content) =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }],
    }),
  );
const config = { provider: 'groq', apiKey: 'test-key', timeoutMs: 1000 };
const facts = [{ id: 'booking', title: 'Book', text: 'Use the booking page', href: '/book' }];
let fixtures, doctor, slots, schedule;
before(async () => {
  await connectDatabase(isolatedUri('assistant_tools'));
  fixtures = await seedTestAccounts();
  await Department.updateOne({ _id: fixtures.department._id }, { isPublic: true, isDemo: true });
  doctor = await Doctor.findOneAndUpdate(
    { user: fixtures.users.doctor._id },
    { isPublic: true, isDemo: true },
    { returnDocument: 'after' },
  );
  schedule = await DoctorSchedule.create({
    doctor: doctor._id,
    date: '2026-10-27',
    startsAt: localInstant('2026-10-27', '09:00'),
    endsAt: localInstant('2026-10-27', '19:00'),
    slotMinutes: 15,
    createdBy: fixtures.users.admin._id,
  });
  slots = await AppointmentSlot.create(
    ['09:00', '09:15', '10:00', '12:00', '17:00'].map((time) => ({
      doctor: doctor._id,
      schedule: schedule._id,
      startsAt: localInstant('2026-10-27', time),
      endsAt: new Date(+localInstant('2026-10-27', time) + 900000),
    })),
  );
  const patient = await Patient.findOne({ user: fixtures.users.patient._id });
  await Appointment.create({
    reference: 'HMS-TEST-ASSISTANT',
    doctor: doctor._id,
    patient: patient._id,
    slot: slots[0]._id,
    schedule: schedule._id,
    bookedBy: fixtures.users.patient._id,
    startsAt: slots[0].startsAt,
    endsAt: slots[0].endsAt,
    doctorName: 'Test doctor',
    departmentName: 'General Medicine',
    consultationFeeMinor: 250000,
    reason: 'PRIVATE REASON',
  });
  await AppointmentSlot.updateOne({ _id: slots[1]._id }, { isActive: false });
  const passwordHash = (await User.findById(fixtures.users.doctor._id).select('+passwordHash'))
    .passwordHash;
  const users = await User.insertMany(
    Array.from({ length: 35 }, (_, i) => ({
      name: `A Doctor ${String(i).padStart(2, '0')}`,
      email: `doctor${i}@test.local`,
      role: 'doctor',
      passwordHash,
    })),
  );
  await Doctor.insertMany(
    users.map((user) => ({
      user: user._id,
      department: fixtures.department._id,
      isPublic: true,
      isDemo: true,
      specialization: 'General Medicine',
      consultationFeeMinor: 200000,
    })),
  );
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('full directory search finds doctors beyond the first 30 with bounded results, exact prices and demo labels', async () => {
  const all = await searchAssistantDoctors(plan(), now);
  assert.equal(all.total, 36);
  assert.equal(all.doctors.length, 4);
  const found = await searchAssistantDoctors(plan({ query: 'Test doctor' }), now);
  assert.equal(found.total, 1);
  assert.equal(found.doctors[0].id, String(doctor._id));
  assert.equal(found.doctors[0].demo, true);
  assert.equal(found.doctors[0].consultationFeeMinor, 250000);
  assert.ok(!/PRIVATE|@test.local|passwordHash|patient|bookedBy/.test(JSON.stringify(found)));
  assert.equal((await searchAssistantDoctors(plan({ query: '.*' }), now)).total, 0);
});
test('availability excludes held, inactive and past slots and uses Sri Lanka dates and time periods', async () => {
  const search = (extra = {}) =>
    searchAssistantDoctors(
      plan({ doctorId: String(doctor._id), date: '2026-10-27', ...extra }),
      now,
    );
  assert.deepEqual(
    (await search()).doctors[0].slots.map((s) => s.id),
    slots.slice(2).map((s) => String(s._id)),
  );
  assert.deepEqual(
    (await search({ period: 'morning' })).doctors[0].slots.map((s) => s.id),
    [String(slots[2]._id)],
  );
  assert.deepEqual(
    (await search({ period: 'afternoon' })).doctors[0].slots.map((s) => s.id),
    [String(slots[3]._id)],
  );
  assert.deepEqual(
    (await search({ period: 'evening' })).doctors[0].slots.map((s) => s.id),
    [String(slots[4]._id)],
  );
  assert.equal((await search({ date: '2026-10-28' })).doctors[0].slots.length, 0);
  for (const date of ['2026-02-30', '2026-10-25', '2028-01-01'])
    assert.equal((await search({ date })).status, 'invalid-date');
  const later = await searchAssistantDoctors(
    plan({ doctorId: String(doctor._id) }),
    new Date('2026-10-28T00:00:00Z'),
  );
  assert.equal(later.doctors[0].slots.length, 0);
  const href = (await search()).doctors[0].slots[0].href;
  assert.ok(safePatientReturn(href));
  assert.ok(href.includes('date=2026-10-27'));
  await DoctorSchedule.updateOne({ _id: schedule._id }, { isActive: false });
  assert.equal((await search()).doctors[0].slots.length, 0);
  await DoctorSchedule.updateOne({ _id: schedule._id }, { isActive: true });
});
test('publication and active-account changes take effect on the next search', async () => {
  const search = () => searchAssistantDoctors(plan({ doctorId: String(doctor._id) }), now);
  for (const [Model, id, key] of [
    [Doctor, doctor._id, 'isPublic'],
    [User, fixtures.users.doctor._id, 'isActive'],
    [Department, fixtures.department._id, 'isPublic'],
    [Department, fixtures.department._id, 'isActive'],
  ]) {
    await Model.updateOne({ _id: id }, { [key]: false });
    assert.equal((await search()).total, 0);
    await Model.updateOne({ _id: id }, { [key]: true });
  }
});
test('signed follow-ups resolve only previous doctors; tampering and expired context cannot select an arbitrary ID', async () => {
  let time = +now,
    stage = 0,
    seen;
  const ai = createHospitalAssistant(config, {
    now: () => time,
    fetchImpl: async (_url, options) => {
      const data = JSON.parse(JSON.parse(options.body).messages[1].content);
      if (stage++ % 2 === 0) {
        seen = data.context;
        return envelope(
          plan({
            query: stage === 1 ? 'Test doctor' : '',
            doctorId: stage === 1 ? '' : String(doctor._id),
          }),
        );
      }
      return envelope({
        reply:
          'Here is the matching demonstration doctor. Choose a time to review your booking; it is not reserved.',
        factIds: [`doctor-${doctor._id}`],
      });
    },
  });
  const first = await ai.answer({ message: 'Find Test doctor on 2026-10-27' }, facts);
  assert.equal(first.mode, 'information');
  assert.equal(first.doctors.length, 1);
  assert.ok(first.reply);
  const second = await ai.answer(
    { message: 'The first one tomorrow', context: first.context },
    facts,
  );
  assert.equal(second.doctors[0].id, String(doctor._id));
  assert.equal(seen.doctors[0].name, 'Test doctor');
  const forged = first.context.replace(/.$/, '!');
  assert.equal(
    (await ai.answer({ message: 'The first one', context: forged }, facts)).mode,
    'unavailable',
  );
  stage = 4;
  time += 31 * 60000;
  assert.equal(
    (await ai.answer({ message: 'The first one', context: first.context }, facts)).mode,
    'unavailable',
  );
});
test('a failed synthesis or exhausted second-call budget preserves checked cards without invented prose', async () => {
  for (const dailyLimit of [1, 100]) {
    let count = 0;
    const ai = createHospitalAssistant(config, {
      now: () => +now,
      dailyLimit,
      fetchImpl: async () =>
        ++count === 1
          ? envelope(plan({ query: 'Test doctor' }))
          : envelope({ reply: 'Visit https://invented.example', factIds: ['invented'] }),
    });
    const response = await ai.answer({ message: 'Find Test doctor' }, facts);
    assert.equal(response.mode, 'information');
    assert.equal(response.degraded, true);
    assert.equal(response.reply, '');
    assert.equal(response.doctors.length, 1);
    assert.equal(count, dailyLimit === 1 ? 1 : 2);
  }
});
test('booking redirects accept only local known parameters with valid dates and IDs', () => {
  const id = 'a'.repeat(24);
  for (const path of [
    '/book',
    '/records',
    `/book?doctor=${id}&date=2026-10-27&slot=${id}`,
    `/book?department=${id}`,
  ])
    assert.equal(safePatientReturn(path), true, path);
  for (const path of [
    '//evil.example',
    'https://evil.example',
    '/book/evil',
    '/book?redirect=evil',
    `/book?doctor=${id}&doctor=${id}`,
    `/book?slot=${id}`,
    '/book?date=2026-02-30',
    '/book#evil',
  ])
    assert.equal(safePatientReturn(path), false, path);
});
