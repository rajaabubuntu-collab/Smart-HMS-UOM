import mongoose from 'mongoose';
import {
  connectDatabase,
  Doctor,
  Patient,
  DoctorSchedule,
  AppointmentSlot,
  Appointment,
} from '../src/models.js';
import { hospitalDate, localInstant } from '../src/scheduling/time.js';
import { createApp } from '../src/app.js';
import { testConfig, isolatedUri, seedTestAccounts } from './helpers.js';

await connectDatabase(isolatedUri('browser'));
const fixtures = await seedTestAccounts();
// A pre-existing visit today lets the arrival UI be tested at any time of day.
const doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
const patient = await Patient.findOne({ user: fixtures.users.patient._id });
const date = hospitalDate();
const startsAt = localInstant(date, '08:00'),
  endsAt = localInstant(date, '08:15');
const schedule = await DoctorSchedule.create({
  doctor: doctor._id,
  date,
  startsAt,
  endsAt,
  slotMinutes: 15,
  createdBy: fixtures.users.admin._id,
});
const slot = await AppointmentSlot.create({
  schedule: schedule._id,
  doctor: doctor._id,
  startsAt,
  endsAt,
});
await Appointment.create({
  reference: 'HMS-ARRIVALTEST',
  patient: patient._id,
  doctor: doctor._id,
  slot: slot._id,
  schedule: schedule._id,
  startsAt,
  endsAt,
  doctorName: 'Test doctor',
  departmentName: 'General Medicine',
  consultationFeeMinor: 250000,
  bookedBy: fixtures.users.patient._id,
  history: [{ action: 'Booked', actor: fixtures.users.patient._id }],
});
// Independent clinical fixture keeps consultation tests separate from arrival tests.
const clinicalStart = localInstant(date, '07:30');
const clinicalEnd = localInstant(date, '07:45');
const clinicalSlot = await AppointmentSlot.create({
  schedule: schedule._id,
  doctor: doctor._id,
  startsAt: clinicalStart,
  endsAt: clinicalEnd,
});
await Appointment.create({
  reference: 'HMS-CLINICALTEST',
  patient: patient._id,
  doctor: doctor._id,
  slot: clinicalSlot._id,
  schedule: schedule._id,
  startsAt: clinicalStart,
  endsAt: clinicalEnd,
  doctorName: 'Test doctor',
  departmentName: 'General Medicine',
  consultationFeeMinor: 250000,
  bookedBy: fixtures.users.patient._id,
  status: 'Waiting',
  checkedInAt: new Date(),
  history: [{ action: 'Checked in', actor: fixtures.users.receptionist._id }],
});
// Legacy completed visit without an invoice exercises manual bill generation.
const billingStart = localInstant(date, '06:30');
const billingEnd = localInstant(date, '06:45');
const billingSlot = await AppointmentSlot.create({
  schedule: schedule._id,
  doctor: doctor._id,
  startsAt: billingStart,
  endsAt: billingEnd,
});
await Appointment.create({
  reference: 'HMS-BILLINGTEST',
  patient: patient._id,
  doctor: doctor._id,
  slot: billingSlot._id,
  schedule: schedule._id,
  startsAt: billingStart,
  endsAt: billingEnd,
  doctorName: 'Test doctor',
  departmentName: 'General Medicine',
  consultationFeeMinor: 250000,
  bookedBy: fixtures.users.patient._id,
  status: 'Completed',
});
// Browser tests intentionally run many distinct users behind one loopback IP.
// Rate limiting is exercised separately in api.test.js with the real limiter.
const server = createApp(testConfig, { rateLimitEnabled: false }).listen(4100, '127.0.0.1', () =>
  console.log('Isolated browser-test API ready on 4100.'),
);
async function cleanup() {
  server.close(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    process.exit(0);
  });
}
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
