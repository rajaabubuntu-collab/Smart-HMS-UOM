import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { startRecoveryWorker } from '../src/security/recovery.js';
import { runReminderBatch } from '../src/notifications/reminders.js';
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
import { createServer } from 'node:http';
import { startRealtime } from '../src/realtime.js';
import { startDeliveryWorker } from '../src/notifications/delivery-worker.js';
import { deliveryConfig } from '../src/notifications/delivery-config.js';
import { recommendationConfig } from '../src/recommendations/ai.js';
import { seedDemoDirectory } from '../src/demo/directory.js';

await connectDatabase(isolatedUri('browser'));
const fixtures = await seedTestAccounts();
if (process.env.E2E_AI_DEMO === 'true')
  await seedDemoDirectory({ environment: 'development', days: 1 });
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
// A future appointment proves reminder delivery through the real worker function.
const reminderStart = new Date(Date.now() + 3600000);
const reminderEnd = new Date(reminderStart.getTime() + 900000);
const reminderSlot = await AppointmentSlot.create({
  schedule: schedule._id,
  doctor: doctor._id,
  startsAt: reminderStart,
  endsAt: reminderEnd,
});
await Appointment.create({
  reference: 'HMS-REMINDERTEST',
  patient: patient._id,
  doctor: doctor._id,
  slot: reminderSlot._id,
  schedule: schedule._id,
  startsAt: reminderStart,
  endsAt: reminderEnd,
  doctorName: 'Test doctor',
  departmentName: 'General Medicine',
  consultationFeeMinor: 250000,
  bookedBy: fixtures.users.patient._id,
  status: 'Scheduled',
});
await runReminderBatch();
// Browser tests intentionally run many distinct users behind one loopback IP.
// Rate limiting is exercised separately in api.test.js with the real limiter.
testConfig.delivery = deliveryConfig({});
// Explicit opt-in only: normal browser tests never depend on a local model or private .env.
testConfig.recommendations = recommendationConfig({
  RECOMMENDATION_PROVIDER: process.env.E2E_LOCAL_AI === 'true' ? 'ollama' : 'rules',
});
testConfig.avatarStorageDir = await mkdtemp(path.join(tmpdir(), 'hms-e2e-avatars-'));
const server = createServer(createApp(testConfig, { rateLimitEnabled: false }));
const realtime = await startRealtime(server, testConfig);
const stopDelivery = startDeliveryWorker(testConfig);
await rm('.local/e2e-reset-mail', { recursive: true, force: true });
const stopRecovery = startRecoveryWorker(testConfig, { previewDirectory: '.local/e2e-reset-mail' });
server.listen(4100, '127.0.0.1', () => console.log('Isolated browser-test API ready on 4100.'));
async function cleanup() {
  await stopDelivery();
  await stopRecovery();
  await rm('.local/e2e-reset-mail', { recursive: true, force: true });
  await realtime.stop();
  await rm(testConfig.avatarStorageDir, { recursive: true, force: true });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  process.exit(0);
}
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
