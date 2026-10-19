import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  connectDatabase,
  User,
  Department,
  Doctor,
  DoctorSchedule,
  AppointmentSlot,
  Appointment,
  Patient,
} from '../src/models.js';
import { isolatedUri, seedTestAccounts } from './helpers.js';
import { seedDemoDirectory, demoEmail } from '../src/demo/directory.js';
import { departmentCatalog } from '../src/recommendations/departments.js';
import { departmentChoices } from '../src/recommendations/ai.js';
import { nextAvailability } from '../src/scheduling/next-availability.js';

let fixtures;
const catalog = departmentCatalog.filter((d) => ['general', 'cardiology'].includes(d.id));
before(async () => {
  await connectDatabase(isolatedUri('demo_directory'));
  fixtures = await seedTestAccounts();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
test('demo seed rejects production before touching records', async () => {
  await assert.rejects(seedDemoDirectory({ environment: 'production' }), /restricted/);
  assert.equal(await User.countDocuments({ isDemo: true }), 0);
});
test('catalog contains 20 services with 18 bounded adult AI scopes and no duplicate names', () => {
  assert.equal(departmentCatalog.length, 20);
  assert.equal(new Set(departmentCatalog.map((d) => d.name)).size, 20);
  const choices = departmentChoices(
    departmentCatalog.map((d, i) => ({ _id: String(i), name: d.name })),
  );
  assert.equal(choices.length, 18);
  assert.ok(!choices.some((d) => /paediatrics|obstetrics/i.test(d.name)));
  assert.ok(choices.some((d) => d.name === 'Cardiology'));
  assert.ok(choices.some((d) => d.name === 'Endocrinology'));
});
test('seed creates fictional private profiles and future bookable sessions without appointments or delivery opt-in', async () => {
  let credentials = 0;
  const stats = await seedDemoDirectory({
    environment: 'development',
    catalog,
    days: 1,
    onCredential: ({ password }) => {
      assert.ok(password.length >= 24);
      credentials++;
    },
  });
  assert.equal(stats.departmentsCreated, 1);
  assert.equal(stats.doctorsCreated, 6);
  assert.equal(stats.schedulesCreated, 6);
  assert.equal(credentials, 6);
  assert.equal(await AppointmentSlot.countDocuments(), 48);
  assert.equal(await Appointment.countDocuments(), 0);
  const users = await User.find({ isDemo: true }).lean();
  assert.ok(
    users.every(
      (u) =>
        u.email.endsWith('.invalid') &&
        u.name.includes('(Demo)') &&
        !u.phone &&
        !u.notificationPreferences.email &&
        !u.notificationPreferences.sms,
    ),
  );
  assert.equal(await Doctor.countDocuments({ isDemo: true, isPublic: true }), 0);
  assert.equal(await Department.countDocuments({ isDemo: true, isPublic: true }), 0);
  assert.equal((await Department.findById(fixtures.department._id)).description, 'Test department');
});
test('repeat seed preserves edits, passwords and closed sessions without duplicates', async () => {
  const user = await User.findOne({ email: demoEmail('general', 0) }).select('+passwordHash');
  const doctor = await Doctor.findOneAndUpdate(
    { user: user._id },
    { consultationFeeMinor: 987600 },
  );
  const closed = await DoctorSchedule.findOneAndUpdate({ doctor: doctor._id }, { isActive: false });
  const stats = await seedDemoDirectory({
    environment: 'development',
    catalog,
    days: 1,
    onCredential: () => assert.fail('No replacement credentials'),
  });
  assert.equal(stats.doctorsCreated, 0);
  assert.equal(stats.schedulesCreated, 0);
  assert.equal(stats.sessionsSkipped, 6);
  assert.equal(await Doctor.countDocuments({ isDemo: true }), 6);
  assert.equal(await AppointmentSlot.countDocuments(), 48);
  assert.equal((await Doctor.findById(doctor._id)).consultationFeeMinor, 987600);
  assert.equal(
    (await User.findById(user._id).select('+passwordHash')).passwordHash,
    user.passwordHash,
  );
  assert.equal((await DoctorSchedule.findById(closed._id)).isActive, false);
});
test('slot previews exclude reservations and closed sessions and expose no patient data', async () => {
  const doctor = await Doctor.findOne({
    user: (await User.findOne({ email: demoEmail('cardiology', 0) }))._id,
  });
  const slots = await AppointmentSlot.find({ doctor: doctor._id }).sort({ startsAt: 1 });
  const patient = await Patient.findOne({ user: fixtures.users.patient._id });
  await Appointment.create({
    reference: 'HMS-DEMO-SLOT-TEST',
    patient: patient._id,
    doctor: doctor._id,
    slot: slots[0]._id,
    schedule: slots[0].schedule,
    startsAt: slots[0].startsAt,
    endsAt: slots[0].endsAt,
    doctorName: 'Demo doctor',
    departmentName: 'Cardiology',
    consultationFeeMinor: 250000,
    bookedBy: fixtures.users.patient._id,
  });
  const preview = await nextAvailability([doctor._id]);
  const available = preview.get(String(doctor._id));
  assert.equal(available.length, 3);
  assert.equal(String(available[0].id), String(slots[1]._id));
  assert.deepEqual(Object.keys(available[0]).sort(), ['endsAt', 'id', 'startsAt']);
  await DoctorSchedule.findByIdAndUpdate(slots[0].schedule, { isActive: false });
  assert.equal((await nextAvailability([doctor._id])).size, 0);
});
test('reserved email collision aborts without modifying an unmarked account', async () => {
  const user = await User.findOneAndUpdate({ email: demoEmail('general', 1) }, { isDemo: false });
  await assert.rejects(
    seedDemoDirectory({ environment: 'development', catalog, days: 1 }),
    /unmarked account/,
  );
  assert.equal((await User.findById(user._id)).isDemo, false);
});
