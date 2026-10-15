import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDatabase, Delivery, Patient, User } from '../src/models.js';
import { deliveryConfig, deliveryMessage } from '../src/notifications/delivery-config.js';
import { createTransports } from '../src/notifications/transports.js';
import { runDeliveryBatch } from '../src/notifications/delivery-worker.js';
import { notifyPatient } from '../src/notifications/service.js';
import { isolatedUri, seedTestAccounts, testConfig } from './helpers.js';

// Synthetic credentials and a mocked HTTP transport: no provider is ever contacted.
const environment = {
  EMAIL_TRANSPORT: 'off',
  SMS_TRANSPORT: 'notifylk',
  ALLOW_LIVE_DELIVERY: 'true',
  DELIVERY_ALLOWED_RECIPIENTS: '+94770000000',
  NOTIFYLK_USER_ID: '12345',
  NOTIFYLK_API_KEY: 'synthetic-api-key',
  NOTIFYLK_SENDER_ID: 'NotifyDEMO',
};
const config = { ...testConfig, delivery: deliveryConfig(environment) };
const job = { channel: 'sms', transport: 'notifylk', destination: '+94770000000' };
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
function adapter(fetchImpl) {
  return createTransports(config, { fetchImpl });
}

test('Notify.lk configuration validates credentials, sender and explicit live approval', () => {
  assert.equal(deliveryConfig({}).sms, 'local');
  assert.equal(config.delivery.notifylk.senderId, 'NotifyDEMO');
  for (const invalid of [
    { ALLOW_LIVE_DELIVERY: 'false' },
    { DELIVERY_ALLOWED_RECIPIENTS: '' },
    { NOTIFYLK_USER_ID: '' },
    { NOTIFYLK_USER_ID: 'not-an-id' },
    { NOTIFYLK_API_KEY: '  ' },
    { NOTIFYLK_SENDER_ID: '' },
    { NOTIFYLK_SENDER_ID: 'way-too-long-sender' },
  ])
    assert.throws(() => deliveryConfig({ ...environment, ...invalid }));
  const withoutSender = { ...environment };
  delete withoutSender.NOTIFYLK_SENDER_ID;
  assert.equal(deliveryConfig(withoutSender).notifylk.senderId, 'NotifyDEMO');
  assert.throws(
    () => deliveryConfig({ ...environment, NOTIFYLK_USER_ID: 'invalid' }),
    (error) => !error.message.includes(environment.NOTIFYLK_API_KEY),
  );
});

test('Notify.lk POST protects credentials, normalises +94 and sends only the generic SMS', async () => {
  let calls = 0;
  const transport = adapter(async (url, options) => {
    calls++;
    assert.equal(url, 'https://app.notify.lk/api/v1/send');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers['Content-Type'], 'application/x-www-form-urlencoded');
    assert.deepEqual(Object.fromEntries(options.body), {
      user_id: '12345',
      api_key: 'synthetic-api-key',
      sender_id: 'NotifyDEMO',
      to: '94770000000',
      message: deliveryMessage(config.origin),
    });
    assert.ok(!url.includes(environment.NOTIFYLK_API_KEY));
    return response({ status: 'success', data: 'Sent' });
  });
  const outcome = await transport.send(job, { text: 'PRIVATE clinical notes', html: 'PRIVATE' });
  assert.deepEqual(outcome, { status: 'accepted', providerStatus: 'notifylk_accepted' });
  assert.equal(calls, 1);
  await transport.send({ ...job, transport: 'local' });
  assert.equal(calls, 1, 'Local mode must not contact the provider');
  await assert.rejects(transport.send({ ...job, destination: '0111234567' }), {
    deliveryCode: 'invalid_sms_destination',
  });
  assert.equal(calls, 1);
});

test('Notify.lk rejection, ambiguous responses and rate limits have safe outcomes without raw provider data', async () => {
  for (const payload of [
    { status: 'error', data: environment.NOTIFYLK_API_KEY },
    { status: 'fail' },
    { status: 'failed' },
  ]) {
    await assert.rejects(adapter(async () => response(payload)).send(job), {
      deliveryCode: 'provider_rejected',
      retryable: false,
    });
  }
  for (const status of [400, 401, 403])
    await assert.rejects(adapter(async () => response({}, status)).send(job), {
      deliveryCode: 'provider_rejected',
      retryable: false,
    });
  await assert.rejects(adapter(async () => response({}, 429)).send(job), {
    deliveryCode: 'provider_rate_limit',
    retryable: true,
  });
  for (const status of [408, 500, 503])
    await assert.rejects(adapter(async () => response({}, status)).send(job), {
      message: 'Provider result uncertain',
    });
  for (const payload of [null, {}, { status: 'unexpected', data: environment.NOTIFYLK_API_KEY }])
    await assert.rejects(adapter(async () => response(payload)).send(job), {
      message: 'Provider result uncertain',
    });
  await assert.rejects(
    adapter(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Invalid JSON');
      },
    })).send(job),
  );
});

let patient, user;
before(async () => {
  await connectDatabase(isolatedUri('notifylk'));
  const fixtures = await seedTestAccounts();
  user = fixtures.users.patient;
  patient = await Patient.findOne({ user: user._id });
  await User.updateOne(
    { _id: user._id },
    { $set: { phone: '0770000000', notificationPreferences: { email: false, sms: true } } },
  );
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function withNotifyEnvironment(run) {
  const saved = Object.fromEntries(Object.keys(environment).map((key) => [key, process.env[key]]));
  Object.assign(process.env, environment);
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const event = (key) => ({
  eventKey: key,
  type: 'appointment',
  title: 'Appointment confirmed',
  message: 'PRIVATE visit detail',
  path: '/appointments',
  email: {
    kind: 'appointment_booked',
    reference: 'HMS-SMS-TEST',
    startsAt: '2026-10-20T03:30:00Z',
    doctorName: 'Dr Demo',
  },
});
const make = (key) => Delivery.create({ ...job, recipient: user._id, eventKey: key });
const future = () => new Date(Date.now() + 1000);

test('Notify.lk events commit atomically, deduplicate and use the real worker with mocked HTTP', async () => {
  await withNotifyEnvironment(async () => {
    await mongoose.connection.transaction(async (session) => {
      await notifyPatient(patient._id, event('notify-success'), session);
      await notifyPatient(patient._id, event('notify-success'), session);
    });
    await assert.rejects(
      mongoose.connection.transaction(async (session) => {
        await notifyPatient(patient._id, event('notify-rollback'), session);
        throw new Error('rollback');
      }),
    );
  });
  assert.equal(await Delivery.countDocuments({ eventKey: 'notify-success' }), 1);
  assert.equal(await Delivery.countDocuments({ eventKey: 'notify-rollback' }), 0);
  let sends = 0;
  const transports = adapter(async (_url, options) => {
    sends++;
    assert.match(options.body.get('message'), /Appointment confirmed/);
    assert.match(options.body.get('message'), /Ref HMS-SMS-TEST/);
    assert.match(options.body.get('message'), /20 Oct 2026, 09:00/);
    assert.doesNotMatch(options.body.get('message'), /PRIVATE/);
    return response({ status: 'success', data: 'Sent' });
  });
  await runDeliveryBatch(config, { transports, now: future() });
  const saved = await Delivery.findOne({ eventKey: 'notify-success' });
  assert.equal(saved.transport, 'notifylk');
  assert.equal(saved.status, 'accepted');
  assert.equal(saved.providerStatus, 'notifylk_accepted');
  await runDeliveryBatch(config, { transports, now: new Date(Date.now() + 2 * 86400000) });
  assert.equal(sends, 1, 'Accepted Notify.lk sends must not be resent or polled through Twilio');
});

test('Notify.lk worker never retries uncertain sends or copies provider secrets into records', async () => {
  const uncertain = await make('notify-timeout');
  let sends = 0;
  const transports = adapter(async () => {
    sends++;
    throw new Error(`Secret provider response: ${environment.NOTIFYLK_API_KEY}`);
  });
  await runDeliveryBatch(config, { transports, now: future() });
  const saved = await Delivery.findById(uncertain._id);
  assert.equal(saved.status, 'unknown');
  assert.equal(saved.lastError, 'provider_result_uncertain');
  assert.ok(!JSON.stringify(saved).includes(environment.NOTIFYLK_API_KEY));
  await runDeliveryBatch(config, { transports, now: new Date(Date.now() + 3600000) });
  assert.equal(sends, 1);
});

test('Notify.lk worker limits retries to explicit rate limits and stops after three attempts', async () => {
  const limited = await make('notify-rate-limit');
  let sends = 0;
  const transports = adapter(async () => {
    sends++;
    return response({}, 429);
  });
  for (const offset of [1000, 125000, 366000])
    await runDeliveryBatch(config, { transports, now: new Date(Date.now() + offset) });
  const saved = await Delivery.findById(limited._id);
  assert.equal(saved.status, 'failed');
  assert.equal(saved.attempts, 3);
  assert.equal(sends, 3);
});

test('Notify.lk worker honours recipient allowlist, changed phone, opt-out and transport changes', async () => {
  const transports = adapter(() => assert.fail('Blocked SMS contacted provider'));
  const denied = await make('notify-not-approved');
  await runDeliveryBatch(
    { ...config, delivery: { ...config.delivery, allowed: [] } },
    { transports, now: future() },
  );
  assert.equal((await Delivery.findById(denied._id)).lastError, 'recipient_not_approved');
  const changed = await make('notify-phone-changed');
  await User.updateOne({ _id: user._id }, { $set: { phone: '0770000001' } });
  await runDeliveryBatch(config, { transports, now: future() });
  assert.equal((await Delivery.findById(changed._id)).status, 'skipped');
  await User.updateOne(
    { _id: user._id },
    { $set: { phone: '0770000000', 'notificationPreferences.sms': false } },
  );
  const optedOut = await make('notify-opt-out');
  await runDeliveryBatch(config, { transports, now: future() });
  assert.equal((await Delivery.findById(optedOut._id)).status, 'skipped');
  await User.updateOne({ _id: user._id }, { $set: { 'notificationPreferences.sms': true } });
  const switched = await make('notify-transport-changed');
  await runDeliveryBatch(
    { ...config, delivery: { ...config.delivery, sms: 'local' } },
    { transports, now: future() },
  );
  assert.equal((await Delivery.findById(switched._id)).lastError, 'transport_changed');
});
