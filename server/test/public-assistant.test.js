import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createHospitalAssistant, assistantFacts } from '../src/public/assistant.js';
import { createApp } from '../src/app.js';
import { connectDatabase, HospitalSettings, Department, Doctor, User } from '../src/models.js';
import { defaultHospitalDetails } from '../src/settings/hospital.js';
import { isolatedUri, seedTestAccounts, testConfig } from './helpers.js';
const config = {
  provider: 'groq',
  apiKey: 'test-secret',
  model: 'openai/gpt-oss-120b',
  timeoutMs: 1000,
};
const facts = [
  {
    id: 'hospital',
    title: 'Hospital information',
    text: '{details}',
    values: { details: 'Published hospital contact' },
    href: '/contact',
  },
  { id: 'booking', title: 'Book appointment', text: 'Book through the portal.', href: '/book' },
];
const envelope = (selection, finish_reason = 'stop') =>
  new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason,
          message: {
            content: JSON.stringify({
              reply: 'You can use the published hospital information below.',
              query: '',
              doctorId: '',
              departmentId: '',
              date: '',
              period: 'any',
              ...selection,
            }),
          },
        },
      ],
    }),
  );
const ask = (message, history = []) => ({ message, history });
let fixtures;
before(async () => {
  await connectDatabase(isolatedUri('public_assistant'));
  fixtures = await seedTestAccounts();
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('AI replies conversationally with validated published sources and no internal IDs', async () => {
  let body;
  const assistant = createHospitalAssistant(config, {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(options.redirect, 'error');
      body = JSON.parse(options.body);
      return envelope({ kind: 'information', factIds: ['hospital'] });
    },
  });
  const response = await assistant.answer(ask('Where is the hospital?'), facts);
  assert.equal(response.mode, 'information');
  assert.equal(response.reply, 'You can use the published hospital information below.');
  assert.deepEqual(response.facts, [facts[0]]);
  assert.ok(response.context);
  assert.equal(body.include_reasoning, false);
  assert.ok(!body.messages[1].content.includes('/contact'));
  assert.ok(!JSON.stringify(body).includes('test-secret'));
  for (const response of [
    { kind: 'information', factIds: ['invented'] },
    { kind: 'information', factIds: [] },
    { kind: 'information', factIds: ['hospital'], answer: 'Invented phone number' },
  ]) {
    const ai = createHospitalAssistant(config, { fetchImpl: async () => envelope(response) });
    assert.equal((await ai.answer(ask('contact details'), facts)).mode, 'unavailable');
  }
});

test('private-looking input and urgent wording never call the provider; medical requests cannot output treatment', async () => {
  let called = 0;
  const assistant = createHospitalAssistant(config, {
    fetchImpl: async () => {
      called++;
      return envelope({ kind: 'medical', factIds: ['hospital'] });
    },
  });
  for (const message of [
    'my email is patient@example.com',
    'my password is secret',
    'call me 0771234567',
  ])
    assert.equal((await assistant.answer(ask(message), facts)).mode, 'privacy');
  assert.equal((await assistant.answer(ask('I have chest pain'), facts)).mode, 'urgent');
  assert.equal(called, 0);
  assert.deepEqual(await assistant.answer(ask('What tablets should I take?'), facts), {
    mode: 'medical',
    facts: [],
  });
});

test('provider failures, malformed or oversized replies, timeouts and rate limits fall back without leaking errors', async () => {
  for (const fetchImpl of [
    async () => new Response('SECRET_PROVIDER_ERROR', { status: 401 }),
    async () => new Response('not json'),
    async () => new Response('x'.repeat(17000)),
    async () => envelope({ kind: 'information', factIds: ['hospital'] }, 'length'),
    async () => {
      throw new Error('SECRET_NETWORK_ERROR');
    },
    async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
      }),
  ]) {
    const ai = createHospitalAssistant({ ...config, timeoutMs: 20 }, { fetchImpl });
    const response = await ai.answer(ask('hours'), facts);
    assert.equal(response.mode, 'unavailable');
    assert.ok(!JSON.stringify(response).includes('SECRET'));
  }
  let calls = 0,
    time = 1000;
  const ai = createHospitalAssistant(config, {
    now: () => time,
    fetchImpl: async () => {
      calls++;
      return new Response('', { status: 429 });
    },
  });
  assert.equal((await ai.answer(ask('hours'), facts)).mode, 'busy');
  assert.equal((await ai.answer(ask('hours'), facts)).mode, 'busy');
  assert.equal(calls, 1);
  time += 61000;
  await ai.answer(ask('hours'), facts);
  assert.equal(calls, 2);
});

test('budget rolls over daily and at most two provider requests run concurrently', async () => {
  let time = 1000,
    calls = 0;
  const ai = createHospitalAssistant(config, {
    dailyLimit: 1,
    now: () => time,
    fetchImpl: async () => {
      calls++;
      return envelope({ kind: 'information', factIds: ['booking'] });
    },
  });
  assert.equal((await ai.answer(ask('book'), facts)).mode, 'information');
  assert.equal((await ai.answer(ask('book'), facts)).mode, 'busy');
  time += 86400000;
  assert.equal((await ai.answer(ask('book'), facts)).mode, 'information');
  assert.equal(calls, 2);
  const releases = [];
  const concurrent = createHospitalAssistant(config, {
    fetchImpl: () => new Promise((resolve) => releases.push(resolve)),
  });
  const pending = [concurrent.answer(ask('book'), facts), concurrent.answer(ask('book'), facts)];
  assert.equal((await concurrent.answer(ask('book'), facts)).mode, 'busy');
  releases.forEach((resolve) => resolve(envelope({ kind: 'information', factIds: ['booking'] })));
  await Promise.all(pending);
});

test('catalogue includes only published hospital details and active published directory entries', async () => {
  const details = {
    ...defaultHospitalDetails(),
    name: 'Public hospital',
    address: 'Public address',
    phone: '0112345678',
  };
  await HospitalSettings.create({
    _id: '000000000000000000000001',
    draft: { ...details, description: 'PRIVATE DRAFT' },
    published: details,
    updatedBy: fixtures.users.admin._id,
  });
  await Department.updateOne({ _id: fixtures.department._id }, { isPublic: true });
  await Doctor.updateOne({ user: fixtures.users.doctor._id }, { isPublic: true });
  await Department.create({
    name: 'PRIVATE DEPARTMENT',
    nameKey: 'private department',
    isPublic: false,
  });
  const catalog = await assistantFacts();
  assert.ok(catalog.some((item) => item.title === 'Test doctor'));
  const text = JSON.stringify(catalog);
  assert.ok(!/PRIVATE|passwordHash|@test.local/.test(text));
  await User.updateOne({ _id: fixtures.users.doctor._id }, { isActive: false });
  assert.ok(!(await assistantFacts()).some((item) => item.title === 'Test doctor'));
  await HospitalSettings.updateOne({ _id: '000000000000000000000001' }, { published: null });
  assert.ok(!(await assistantFacts()).some((item) => item.id === 'hospital'));
});

test('public endpoint enforces origin, strict validation and rate limiting without requiring login', async () => {
  const app = createApp(
    { ...testConfig, recommendations: config },
    { assistantFetch: async () => envelope({ kind: 'information', factIds: ['booking'] }) },
  );
  await request(app).post('/api/public/assistant').send(ask('booking')).expect(403);
  await request(app)
    .post('/api/public/assistant')
    .set('Origin', testConfig.origin)
    .send({ ...ask('booking'), patientId: 'private' })
    .expect(400);
  for (let i = 0; i < 7; i++) {
    const res = await request(app)
      .post('/api/public/assistant')
      .set('Origin', testConfig.origin)
      .send(ask('booking'))
      .expect(200);
    assert.equal(res.body.facts[0].id, 'booking');
  }
  await request(app)
    .post('/api/public/assistant')
    .set('Origin', testConfig.origin)
    .send(ask('booking'))
    .expect(429);
});
