import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  Notification,
  Delivery,
  Appointment,
  AppointmentSlot,
  Doctor,
  Patient,
  User,
  Bill,
  connectDatabase,
} from '../src/models.js';
import { runReminderBatch, startReminderWorker } from '../src/notifications/reminders.js';
import { hospitalDate } from '../src/scheduling/time.js';
import { testPassword, testConfig, isolatedUri, seedTestAccounts } from './helpers.js';
import { randomUUID } from 'node:crypto';
import { renderEmail } from '../src/notifications/email-content.js';
import { runDeliveryBatch } from '../src/notifications/delivery-worker.js';
import { deliveryConfig } from '../src/notifications/delivery-config.js';
import { isSingleSegmentSms } from '../src/notifications/sms-content.js';
let app, fixtures, doctor, patient, slots;
const tokens = {};
const send = (method, path, role = 'patient') =>
  request(app)[method](`/api${path}`).set('Origin', testConfig.origin).set('Cookie', tokens[role]);
async function book(index = 0) {
  return (
    await send('post', '/appointments')
      .send({ slot: String(slots[index]._id), reason: 'Synthetic visit' })
      .expect(201)
  ).body.appointment;
}
const notices = (id) =>
  Notification.find({
    recipient: fixtures.users.patient._id,
    eventKey: { $regex: String(id) },
  }).sort({ createdAt: 1 });
before(async () => {
  await connectDatabase(isolatedUri('notifications'));
  fixtures = await seedTestAccounts();
  await User.updateOne(
    { _id: fixtures.users.patient._id },
    {
      $set: {
        'notificationPreferences.email': true,
        'notificationPreferences.sms': true,
        phone: '0770000000',
      },
    },
  );
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
  const schedule = await send('post', '/schedules', 'admin')
    .send({
      doctor: String(doctor._id),
      date: hospitalDate(new Date(Date.now() + 2 * 86400000)),
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: 15,
    })
    .expect(201);
  slots = await AppointmentSlot.find({ schedule: schedule.body.schedule._id }).sort({
    startsAt: 1,
  });
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('booking, rescheduling and cancellation commit patient notifications only on success', async () => {
  const a = await book(0);
  let rows = await notices(a.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Appointment confirmed');
  assert.equal(rows[0].path, `/appointments?selected=${a.id}`);
  const confirmation = await Delivery.findOne({
    eventKey: rows[0].eventKey,
    channel: 'email',
  }).select('+emailContent');
  assert.equal(confirmation.emailContent.kind, 'appointment_booked');
  assert.match(
    renderEmail(confirmation.emailContent, testConfig.origin).text,
    /Doctor: Test doctor/,
  );
  await send('post', '/appointments')
    .send({ slot: String(slots[0]._id) })
    .expect(409);
  assert.equal((await notices(a.id)).length, 1);
  await send('post', `/appointments/${a.id}/reschedule`, 'receptionist')
    .send({ slot: String(slots[1]._id), reason: 'Synthetic move' })
    .expect(200);
  rows = await notices(a.id);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].title, 'Appointment rescheduled');
  const moved = await Delivery.findOne({ eventKey: rows[1].eventKey }).select('+emailContent');
  const movedText = renderEmail(moved.emailContent, testConfig.origin).text;
  assert.match(movedText, /Previous appointment:/);
  assert.match(movedText, /New appointment:/);
  assert.doesNotMatch(movedText, /Synthetic move|Synthetic visit/);
  await send('post', `/appointments/${a.id}/cancel`)
    .send({ reason: 'Synthetic cancellation' })
    .expect(200);
  assert.equal((await notices(a.id)).length, 3);
  const cancelled = await Delivery.findOne({ eventKey: `appointment:${a.id}:cancelled:1` }).select(
    '+emailContent',
  );
  assert.equal(cancelled.emailContent.kind, 'appointment_cancelled');
  assert.equal(await Delivery.countDocuments({ eventKey: { $regex: a.id }, channel: 'email' }), 3);
  assert.equal(await Delivery.countDocuments({ eventKey: { $regex: a.id }, channel: 'sms' }), 3);
  const sms = await Delivery.find({ eventKey: { $regex: a.id }, channel: 'sms' }).select(
    '+smsContent',
  );
  assert.deepEqual(sms.map((job) => job.smsContent.kind).sort(), [
    'appointment_booked',
    'appointment_cancelled',
    'appointment_rescheduled',
  ]);
  assert.ok(
    sms.every(
      (job) => job.smsContent.text.includes(a.reference) && isSingleSegmentSms(job.smsContent.text),
    ),
  );
  const unchanged = await Delivery.findById(confirmation._id).select('+emailContent');
  assert.deepEqual(unchanged.emailContent.toObject(), confirmation.emailContent.toObject());
  await send('post', `/appointments/${a.id}/cancel`).send({ reason: 'Repeated' }).expect(409);
  assert.equal((await notices(a.id)).length, 3);
});
test('notification ownership cannot be overridden; read and unread states persist', async () => {
  const notification = await Notification.findOne({ recipient: fixtures.users.patient._id });
  for (const role of ['other', 'doctor', 'receptionist', 'admin']) {
    const r = await send('get', '/notifications', role).expect(200);
    assert.equal(r.body.total, 0);
    await send('patch', `/notifications/${notification._id}`, role)
      .send({ read: true })
      .expect(404);
  }
  await request(app).get('/api/notifications').expect(401);
  await send('get', '/notifications?recipient=123').expect(400);
  await send('get', '/notifications?limit=100').expect(400);
  await send('patch', '/notifications/invalid').send({ read: true }).expect(400);
  await send('patch', `/notifications/${notification._id}`)
    .send({ read: true, recipient: String(fixtures.users.other._id) })
    .expect(400);
  await send('patch', `/notifications/${notification._id}`).send({ read: true }).expect(200);
  assert.ok((await Notification.findById(notification._id)).readAt);
  await send('patch', `/notifications/${notification._id}`).send({ read: false }).expect(200);
  assert.equal((await Notification.findById(notification._id)).readAt, null);
  const r = await send('get', '/notifications?limit=1').expect(200);
  assert.equal(r.body.records.length, 1);
  assert.equal(r.body.records[0].eventKey, undefined);
  assert.equal(r.body.records[0].recipient, undefined);
});
test('mark all read uses displayed cutoff and does not swallow newer notifications', async () => {
  const view = await send('get', '/notifications').expect(200);
  const newer = await Notification.create({
    recipient: fixtures.users.patient._id,
    eventKey: 'new-after-view',
    type: 'appointment',
    title: 'New update',
    message: 'Synthetic',
    path: '/appointments',
    createdAt: new Date(new Date(view.body.asOf).getTime() + 1000),
  });
  await send('post', '/notifications/read-all').send({ through: view.body.asOf }).expect(200);
  assert.equal((await Notification.findById(newer._id)).readAt, null);
  const count = await send('get', '/notifications/unread-count').expect(200);
  assert.equal(count.body.unreadCount, 1);
  await send('post', '/notifications/read-all', 'other')
    .send({ through: new Date(Date.now() + 10000).toISOString() })
    .expect(200);
  assert.equal((await Notification.findById(newer._id)).readAt, null);
});
test('24-hour reminder window skips far/past/non-scheduled visits and is safe across workers and restarts', async () => {
  const a = await book(2),
    now = new Date(slots[2].startsAt.getTime() - 86400000);
  await runReminderBatch({ now: new Date(now.getTime() - 1) });
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${a.id}:0` }), 0);
  await Promise.all([runReminderBatch({ now }), runReminderBatch({ now })]);
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${a.id}:0` }), 1);
  const reminder = await Delivery.findOne({ eventKey: `reminder:${a.id}:0` }).select(
    '+emailContent',
  );
  assert.equal(reminder.emailContent.kind, 'appointment_reminder');
  assert.ok(reminder.emailContent.details.some((row) => row.value === a.reference));
  await runReminderBatch({ now });
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${a.id}:0` }), 1);
  const b = await book(3);
  await send('post', `/appointments/${b.id}/cancel`)
    .send({ reason: 'Cancelled before reminder' })
    .expect(200);
  await runReminderBatch({ now: new Date(slots[3].startsAt.getTime() - 3600000) });
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${b.id}:0` }), 0);
  const past = await book(4);
  await runReminderBatch({ now: new Date(slots[4].startsAt.getTime() + 1) });
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${past.id}:0` }), 0);
});
test('rescheduling creates a fresh reminder revision, including a return to the original time', async () => {
  const a = await book(5);
  const now = new Date(slots[5].startsAt.getTime() - 3600000);
  await runReminderBatch({ now });
  await send('post', `/appointments/${a.id}/reschedule`, 'receptionist')
    .send({ slot: String(slots[6]._id), reason: 'Move' })
    .expect(200);
  await runReminderBatch({ now });
  await send('post', `/appointments/${a.id}/reschedule`, 'receptionist')
    .send({ slot: String(slots[5]._id), reason: 'Return' })
    .expect(200);
  await runReminderBatch({ now });
  assert.equal(
    await Notification.countDocuments({ eventKey: { $regex: `^reminder:${a.id}:` } }),
    3,
  );
  assert.equal((await Appointment.findById(a.id)).remindedRevision, 2);
});
test('legacy appointments receive reminders; notification failures roll back the reminder marker', async () => {
  const a = await book(7);
  await Appointment.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(a.id) },
    { $unset: { scheduleRevision: '', remindedRevision: '' } },
  );
  const now = new Date(slots[7].startsAt.getTime() - 3600000);
  await runReminderBatch({ now });
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${a.id}:0` }), 1);
  const b = await book(8);
  const actualPatient = (await Appointment.findById(b.id)).patient;
  await Appointment.findByIdAndUpdate(b.id, { patient: new mongoose.Types.ObjectId() });
  await assert.rejects(runReminderBatch({ now }));
  assert.equal((await Appointment.findById(b.id)).remindedRevision, -1);
  await Appointment.findByIdAndUpdate(b.id, { patient: actualPatient });
  await runReminderBatch({ now });
  assert.equal(await Notification.countDocuments({ eventKey: `reminder:${b.id}:0` }), 1);
});
test('consultation and billing updates notify the patient without clinical text or duplicate payment alerts', async () => {
  const a = await Appointment.create({
    reference: 'HMS-NOTIFYCLINICAL',
    patient: patient._id,
    doctor: doctor._id,
    slot: new mongoose.Types.ObjectId(),
    schedule: new mongoose.Types.ObjectId(),
    bookedBy: fixtures.users.patient._id,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 900000),
    doctorName: 'Test doctor',
    departmentName: 'General Medicine',
    consultationFeeMinor: 10000,
    status: 'Scheduled',
  });
  await send('post', `/appointments/${a._id}/check-in`, 'receptionist').send({}).expect(200);
  await send('post', `/clinical/appointments/${a._id}/start`, 'doctor').send({}).expect(201);
  const body = {
    revision: 0,
    notes: 'PRIVATE-SYNTHETIC-NOTES',
    diagnosis: 'PRIVATE-SYNTHETIC-DIAGNOSIS',
    treatment: '',
    currentMedications: '',
    medications: [],
    noMedicationReason: 'No medication',
    allergiesReviewed: true,
    reviewedAllergies: [],
  };
  await send('post', `/clinical/appointments/${a._id}/save`, 'doctor').send(body).expect(200);
  assert.equal((await notices(a._id)).length, 2);
  await send('post', `/clinical/appointments/${a._id}/complete`, 'doctor')
    .send({ ...body, revision: 1 })
    .expect(200);
  await send('post', `/clinical/appointments/${a._id}/prescription`, 'doctor')
    .send({
      revision: 2,
      reason: 'Correction',
      medications: [],
      noMedicationReason: 'None needed',
      allergiesReviewed: true,
      reviewedAllergies: [],
    })
    .expect(200);
  const bill = await Bill.findOne({ appointment: a._id });
  assert.equal(await Notification.countDocuments({ eventKey: `bill:${bill._id}:created` }), 1);
  await send('patch', `/billing/bills/${bill._id}`, 'receptionist')
    .send({
      revision: 0,
      additionalItems: [],
      dueDate: hospitalDate(),
      reason: 'Due date confirmed',
    })
    .expect(200);
  const payment = {
    revision: 1,
    requestKey: randomUUID(),
    amountMinor: 10000,
    method: 'Cash',
    externalReference: '',
  };
  const receipt = await send('post', `/billing/bills/${bill._id}/payments`, 'receptionist')
    .send(payment)
    .expect(201);
  await send('post', `/billing/bills/${bill._id}/payments`, 'receptionist')
    .send(payment)
    .expect(200);
  assert.equal(
    await Notification.countDocuments({ eventKey: `payment:${receipt.body.payment.id}:recorded` }),
    1,
  );
  await send(
    'post',
    `/billing/bills/${bill._id}/payments/${receipt.body.payment.id}/reverse`,
    'admin',
  )
    .send({ revision: 2, reason: 'Correction' })
    .expect(200);
  assert.equal(
    await Notification.countDocuments({ eventKey: `payment:${receipt.body.payment.id}:reversed` }),
    1,
  );
  const all = await Notification.find({ recipient: fixtures.users.patient._id });
  assert.ok(!JSON.stringify(all).includes('PRIVATE-SYNTHETIC'));
  assert.ok(all.some((n) => n.title === 'Prescription updated'));
  assert.ok(all.some((n) => n.title === 'Consultation record available'));
  const jobs = await Delivery.find({
    recipient: fixtures.users.patient._id,
    channel: 'email',
  }).select('+emailContent');
  for (const kind of [
    'appointment_checked_in',
    'consultation_started',
    'consultation_completed',
    'prescription_updated',
    'bill_created',
    'bill_updated',
    'payment_recorded',
    'payment_reversed',
  ]) {
    const matching = jobs.filter((job) => job.emailContent?.kind === kind);
    assert.equal(matching.length, 1, kind);
    assert.doesNotMatch(
      renderEmail(matching[0].emailContent, testConfig.origin).text,
      /PRIVATE-SYNTHETIC|None needed|Correction/,
    );
  }
  const recorded = jobs.find((job) => job.emailContent?.kind === 'payment_recorded');
  const reversed = jobs.find((job) => job.emailContent?.kind === 'payment_reversed');
  assert.match(
    renderEmail(recorded.emailContent, testConfig.origin).text,
    /Outstanding balance: LKR 0.00/,
  );
  assert.match(
    renderEmail(reversed.emailContent, testConfig.origin).text,
    /Outstanding balance: LKR 100.00/,
  );
  assert.ok(
    renderEmail(recorded.emailContent, testConfig.origin).text.includes(
      receipt.body.payment.reference,
    ),
  );
  assert.ok(jobs.every((job) => job.emailContent.kind !== 'portal_update'));
  const smsJobs = await Delivery.find({
    recipient: fixtures.users.patient._id,
    channel: 'sms',
  }).select('+smsContent');
  for (const kind of [
    'appointment_reminder',
    'appointment_checked_in',
    'consultation_started',
    'consultation_completed',
    'prescription_updated',
    'bill_created',
    'bill_updated',
    'payment_recorded',
    'payment_reversed',
  ]) {
    assert.ok(
      smsJobs.some((job) => job.smsContent.kind === kind),
      kind,
    );
  }
  assert.ok(
    smsJobs.every(
      (job) =>
        isSingleSegmentSms(job.smsContent.text) &&
        !job.smsContent.text.includes('PRIVATE-SYNTHETIC'),
    ),
  );
  const paidSms = smsJobs.find((job) => job.smsContent.kind === 'payment_recorded');
  const reversedSms = smsJobs.find((job) => job.smsContent.kind === 'payment_reversed');
  assert.match(paidSms.smsContent.text, /Balance LKR 0.00/);
  assert.match(reversedSms.smsContent.text, /Balance LKR 100.00/);
});
test('worker renders stored snapshots, patient history is private and admin history excludes email bodies', async () => {
  const config = { ...testConfig, delivery: deliveryConfig({}) };
  const sent = [];
  await runDeliveryBatch(config, {
    now: new Date(Date.now() + 1000),
    limit: 100,
    transports: {
      send: async (job, content) => {
        sent.push({ job, content });
        return { status: 'simulated' };
      },
    },
  });
  assert.ok(sent.length > 5);
  assert.ok(
    sent.every(({ job, content }) =>
      job.channel === 'email'
        ? content?.html && content?.text && !content.text.includes('PRIVATE-SYNTHETIC')
        : isSingleSegmentSms(job.smsContent?.text),
    ),
  );
  assert.equal((await Delivery.findOne()).emailContent, undefined);
  assert.equal((await Delivery.findOne({ channel: 'sms' })).smsContent, undefined);
  const own = (await send('get', '/notifications/deliveries?limit=50').expect(200)).body;
  assert.ok(own.records.some((row) => row.preview.includes('Receipt reference:')));
  assert.ok(
    own.records.every(
      (row) =>
        (row.channel !== 'email' || row.emailSubject) &&
        !row.emailContent &&
        !row.html &&
        !row.smsContent,
    ),
  );
  assert.ok(
    own.records.some((row) => row.channel === 'sms' && row.preview.includes('Payment received')),
  );
  const admin = (await send('get', '/admin/deliveries', 'admin').expect(200)).body;
  assert.ok(
    admin.records.every(
      (row) =>
        !row.emailSubject &&
        !row.emailContent &&
        !row.smsContent &&
        !row.preview.includes('Doctor:') &&
        !row.preview.includes('LKR'),
    ),
  );
  const other = (await send('get', '/notifications/deliveries', 'other').expect(200)).body;
  assert.equal(other.total, 0);
});
test('reminder worker starts immediately, avoids overlap, drains on shutdown and retries failures', async () => {
  let calls = 0,
    finish;
  const blocked = new Promise((resolve) => {
    finish = resolve;
  });
  const stop = startReminderWorker({
    intervalMs: 5,
    run: async () => {
      calls += 1;
      await blocked;
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(calls, 1);
  const stopping = stop();
  finish();
  await stopping;
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1);
  let attempts = 0,
    errors = 0,
    completed;
  const success = new Promise((resolve) => {
    completed = resolve;
  });
  const stopRetry = startReminderWorker({
    intervalMs: 5,
    run: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('Transient failure');
      completed();
    },
    onError: () => {
      errors += 1;
    },
  });
  // Keep the event loop alive because the production worker interval is deliberately unref'ed.
  const keepAlive = setTimeout(() => {}, 1000);
  await success;
  await stopRetry();
  clearTimeout(keepAlive);
  assert.equal(errors, 1);
  assert.ok(attempts >= 2);
});
