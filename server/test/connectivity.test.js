import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import request from 'supertest';
import { io } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { startRealtime } from '../src/realtime.js';
import {
  connectDatabase,
  User,
  Patient,
  Doctor,
  Payment,
  AppointmentSlot,
  Delivery,
} from '../src/models.js';
import { testConfig, isolatedUri, seedTestAccounts, testPassword } from './helpers.js';
import { hospitalDate, dayBounds } from '../src/scheduling/time.js';
import { notifyPatient } from '../src/notifications/service.js';
import { deliveryConfig, sriLankanMobile } from '../src/notifications/delivery-config.js';
import { runDeliveryBatch } from '../src/notifications/delivery-worker.js';
import { createTransports, deliveryFailure } from '../src/notifications/transports.js';

const config = { ...testConfig, delivery: deliveryConfig({}) };
let app, server, realtime, url, fixtures, patient, otherPatient, doctor;
const tokens = {},
  sockets = [];
const send = (method, path, role = 'patient') =>
  request(app)[method](`/api${path}`).set('Origin', config.origin).set('Cookie', tokens[role]);
const waitFor = (socket, event) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out: ${event}`));
    }, 5000);
    function listener(...args) {
      clearTimeout(timeout);
      resolve(args);
    }
    socket.once(event, listener);
  });
function client(role, origin = config.origin, cookie = tokens[role]) {
  const socket = io(url, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: false,
    extraHeaders: { Origin: origin, Cookie: cookie || '' },
  });
  sockets.push(socket);
  return socket;
}
before(async () => {
  await connectDatabase(isolatedUri('connectivity'));
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
  otherPatient = await Patient.create({
    user: other._id,
    dateOfBirth: '1990-01-01',
    gender: 'other',
  });
  fixtures.users.other = other;
  app = createApp(config, { rateLimitEnabled: false });
  for (const [role, user] of Object.entries(fixtures.users)) {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Origin', config.origin)
      .send({ email: user.email, password: testPassword })
      .expect(200);
    tokens[role] = response.headers['set-cookie'].map((v) => v.split(';')[0]).join('; ');
  }
  const schedule = await send('post', '/schedules', 'admin')
    .send({
      doctor: String(doctor._id),
      date: hospitalDate(new Date(Date.now() + 86400000)),
      startTime: '09:00',
      endTime: '10:00',
      slotMinutes: 15,
    })
    .expect(201);
  const slots = await AppointmentSlot.find({ schedule: schedule.body.schedule._id }).sort({
    startsAt: 1,
  });
  await send('post', '/appointments')
    .send({ slot: String(slots[0]._id), reason: '' })
    .expect(201);
  await send('post', '/appointments', 'other')
    .send({ slot: String(slots[1]._id), reason: '' })
    .expect(201);
  server = createServer(app);
  realtime = await startRealtime(server, config);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  sockets.forEach((s) => s.disconnect());
  await realtime?.stop();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('dashboard aggregates are role scoped, fill all seven days and reject injected filters', async () => {
  for (const role of ['admin', 'receptionist', 'doctor', 'patient']) {
    const { body } = await send('get', '/dashboard/analytics?window=upcoming', role).expect(200);
    assert.equal(body.days.length, 7);
    assert.equal(
      body.days.reduce((n, p) => n + p.value, 0),
      role === 'patient' ? 1 : 2,
    );
    assert.equal(
      body.statuses.reduce((n, p) => n + p.value, 0),
      role === 'patient' ? 1 : 2,
    );
    assert.equal(Boolean(body.revenue), role === 'admin');
    assert.equal(Boolean(body.departments), role === 'admin');
    assert.ok(!JSON.stringify(body).includes('test.local'));
  }
  await send('get', `/dashboard/analytics?patient=${otherPatient._id}`).expect(400);
  await request(app).get('/api/dashboard/analytics').expect(401);
});

test('Socket.IO rejects missing sessions and foreign origins', async () => {
  for (const socket of [
    client('patient', 'https://other.example'),
    client('patient', config.origin, ''),
  ]) {
    const rejected = waitFor(socket, 'connect_error');
    socket.connect();
    await rejected;
    assert.equal(socket.connected, false);
  }
});

test('committed private notices push only to their recipient; rollback emits no refresh', async () => {
  const own = client('patient'),
    other = client('other');
  for (const socket of [own, other]) {
    const connected = waitFor(socket, 'connect');
    socket.connect();
    await connected;
  }
  let leaked = 0,
    refreshed = 0;
  other.on('data:changed', () => leaked++);
  own.on('data:changed', () => refreshed++);
  const received = waitFor(own, 'data:changed');
  await mongoose.connection.transaction((session) =>
    notifyPatient(
      patient._id,
      {
        eventKey: 'socket-private',
        type: 'appointment',
        title: 'Private test',
        message: 'Private details',
        path: '/appointments',
      },
      session,
    ),
  );
  assert.deepEqual(await received, []);
  await assert.rejects(
    mongoose.connection.transaction(async (session) => {
      await notifyPatient(
        patient._id,
        {
          eventKey: 'socket-rollback',
          type: 'appointment',
          title: 'Private rollback',
          message: 'Private',
          path: '/appointments',
        },
        session,
      );
      throw new Error('Rollback');
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(leaked, 0);
  assert.equal(refreshed, 1);
  own.disconnect();
  other.disconnect();
});

test('logout revokes a connected socket and refuses reconnect with the old cookie', async () => {
  const socket = client('other');
  const connected = waitFor(socket, 'connect');
  socket.connect();
  await connected;
  const disconnected = waitFor(socket, 'disconnect');
  await send('post', '/auth/logout', 'other').send({}).expect(204);
  await disconnected;
  const rejected = waitFor(socket, 'connect_error');
  socket.connect();
  await rejected;
});

test('outbox commits atomically, deduplicates and stores only opted-in channels', async () => {
  await User.updateOne({ _id: fixtures.users.patient._id }, { $set: { phone: '0771234567' } });
  await send('patch', '/notifications/preferences').send({ email: true, sms: true }).expect(200);
  const event = {
    eventKey: 'delivery-one',
    type: 'clinical',
    title: 'Private diagnosis',
    message: 'Do not send clinical content externally',
    path: '/records',
  };
  await mongoose.connection.transaction(async (session) => {
    await notifyPatient(patient._id, event, session);
    await notifyPatient(patient._id, event, session);
  });
  assert.equal(await Delivery.countDocuments({ eventKey: event.eventKey }), 2);
  await assert.rejects(
    mongoose.connection.transaction(async (session) => {
      await notifyPatient(patient._id, { ...event, eventKey: 'delivery-rollback' }, session);
      throw new Error('Rollback');
    }),
  );
  assert.equal(await Delivery.countDocuments({ eventKey: 'delivery-rollback' }), 0);
  await runDeliveryBatch(config, { now: new Date(Date.now() + 1000) });
  assert.equal(await Delivery.countDocuments({ eventKey: event.eventKey, status: 'simulated' }), 2);
  const history = (await send('get', '/notifications/deliveries').expect(200)).body;
  assert.ok(history.records.every((r) => r.destination.includes('*')));
  assert.ok(
    history.records.every(
      (r) =>
        (r.preview.includes('/notifications') || r.preview.includes('patient portal')) &&
        !r.preview.includes('diagnosis'),
    ),
  );
  await send('get', '/admin/deliveries').expect(403);
  await send('patch', '/notifications/preferences', 'doctor')
    .send({ email: true, sms: true })
    .expect(403);
});

test('delivery retries explicit rejection, stops on ambiguity, and honours opt-out before send', async () => {
  const make = (key) =>
    Delivery.create({
      recipient: patient.user,
      eventKey: key,
      channel: 'email',
      transport: 'local',
      destination: fixtures.users.patient.email,
    });
  const retried = await make('retry');
  await runDeliveryBatch(config, {
    now: new Date(Date.now() + 1000),
    transports: {
      send: async () => {
        throw deliveryFailure('provider_rate_limit', true);
      },
    },
  });
  assert.equal((await Delivery.findById(retried._id)).status, 'queued');
  await runDeliveryBatch(config, {
    now: new Date(Date.now() + 125000),
    transports: {
      send: async () => {
        throw new Error('Potential secret provider response');
      },
    },
  });
  const uncertain = await Delivery.findById(retried._id);
  assert.equal(uncertain.status, 'unknown');
  assert.equal(uncertain.attempts, 2);
  assert.equal(uncertain.lastError, 'provider_result_uncertain');
  const skipped = await make('opt-out');
  await send('patch', '/notifications/preferences').send({ email: false, sms: false }).expect(200);
  await runDeliveryBatch(config, {
    now: new Date(Date.now() + 1000),
    transports: { send: () => assert.fail('Opted-out message sent') },
  });
  assert.equal((await Delivery.findById(skipped._id)).status, 'skipped');
});

test('delivery config requires explicit live recipients and normalises Sri Lankan mobile numbers', () => {
  assert.equal(sriLankanMobile('077 123 4567'), '+94771234567');
  assert.equal(sriLankanMobile('+94 77 123 4567'), '+94771234567');
  assert.equal(sriLankanMobile('0112345678'), null);
  assert.throws(() => deliveryConfig({ EMAIL_TRANSPORT: 'smtp' }), /Live delivery/);
  const sms = {
    SMS_TRANSPORT: 'twilio',
    ALLOW_LIVE_DELIVERY: 'true',
    DELIVERY_ALLOWED_RECIPIENTS: '+94771234567',
    TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`,
    TWILIO_AUTH_TOKEN: 'test',
    TWILIO_FROM: 'HMSDemo',
  };
  assert.equal(deliveryConfig(sms).twilio.from, 'HMSDemo');
  assert.throws(
    () => deliveryConfig({ ...sms, TWILIO_FROM: '+15005550006' }),
    /registered alphanumeric/,
  );
});

test('SMTP and Twilio adapters use generic content and distinguish acceptance from delivery', async () => {
  const c = {
    ...config,
    delivery: {
      ...config.delivery,
      email: 'smtp',
      smtp: {
        host: 'smtp.example',
        port: 587,
        user: 'test',
        password: 'test',
        from: 'hms@example.com',
      },
      sms: 'twilio',
      twilio: {
        account: `AC${'a'.repeat(32)}`,
        token: 'test',
        from: 'HMSDemo',
        service: `MG${'c'.repeat(32)}`,
      },
    },
  };
  const calls = [];
  const transports = createTransports(c, {
    mailFactory: (options) => {
      assert.equal(options.requireTLS, true);
      return {
        sendMail: async (message) => {
          assert.ok(!message.text.includes('diagnosis'));
          return { accepted: [message.to], messageId: 'smtp-test' };
        },
      };
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          sid: `SM${'b'.repeat(32)}`,
          status: options.method === 'POST' ? 'queued' : 'delivered',
        }),
      };
    },
  });
  assert.equal(
    (
      await transports.send({
        _id: 'test',
        channel: 'email',
        transport: 'smtp',
        destination: 'test@example.com',
      })
    ).status,
    'accepted',
  );
  const sent = await transports.send({
    channel: 'sms',
    transport: 'twilio',
    destination: '+94771234567',
  });
  assert.equal(sent.status, 'accepted');
  assert.equal((await transports.receipt({ providerId: sent.providerId })).status, 'delivered');
  assert.ok(calls[0].options.body.get('Body').includes('/notifications'));
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.body.get('MessagingServiceSid'), `MG${'c'.repeat(32)}`);
  assert.equal(calls[0].options.body.has('From'), false);
});

test('revenue uses Colombo transaction dates and counts old receipt reversals in the current period', async () => {
  const today = dayBounds(hospitalDate()).start;
  const past = new Date(today.getTime() - 10 * 86400000);
  await Payment.create([
    {
      bill: new mongoose.Types.ObjectId(),
      reference: 'TEST-OLD',
      requestKey: 'old',
      actor: fixtures.users.receptionist._id,
      amountMinor: 10000,
      method: 'Cash',
      createdAt: past,
      reversedAt: today,
    },
    {
      bill: new mongoose.Types.ObjectId(),
      reference: 'TEST-NEW',
      requestKey: 'new',
      actor: fixtures.users.receptionist._id,
      amountMinor: 25050,
      method: 'Cash',
      createdAt: today,
    },
  ]);
  const { body } = await send('get', '/dashboard/analytics?window=recent', 'admin').expect(200);
  assert.equal(body.revenue.at(-1).label, hospitalDate());
  assert.equal(body.revenue.at(-1).value, 15050);
  assert.equal(
    body.revenue.reduce((sum, p) => sum + p.value, 0),
    15050,
  );
});

test('concurrent delivery workers claim once; stale in-flight sends are not retried', async () => {
  await User.updateOne({ _id: patient.user }, { $set: { 'notificationPreferences.email': true } });
  const job = await Delivery.create({
    recipient: patient.user,
    eventKey: 'concurrent',
    channel: 'email',
    transport: 'local',
    destination: fixtures.users.patient.email,
  });
  let sends = 0;
  const options = {
    now: new Date(Date.now() + 1000),
    transports: {
      send: async () => {
        sends++;
        return { status: 'simulated' };
      },
    },
  };
  await Promise.all([runDeliveryBatch(config, options), runDeliveryBatch(config, options)]);
  assert.equal(sends, 1);
  assert.equal((await Delivery.findById(job._id)).attempts, 1);
  const stale = await Delivery.create({
    recipient: patient.user,
    eventKey: 'stale',
    channel: 'email',
    transport: 'local',
    destination: fixtures.users.patient.email,
    status: 'processing',
    startedAt: new Date(Date.now() - 180000),
  });
  await runDeliveryBatch(config, options);
  assert.equal(sends, 1);
  assert.equal((await Delivery.findById(stale._id)).status, 'unknown');
});
