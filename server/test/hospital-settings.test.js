import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDatabase, HospitalSettings, AuditLog } from '../src/models.js';
import { defaultHospitalDetails } from '../src/settings/hospital.js';
import { sriLankanPhone } from '../src/settings/phone.js';
import { testConfig, isolatedUri, seedTestAccounts, testPassword } from './helpers.js';

let app;
const cookies = {};
const send = (method, path = '/admin/hospital-settings', role = 'admin') =>
  request(app)[method](`/api${path}`).set('Origin', testConfig.origin).set('Cookie', cookies[role]);
const publicPage = () => request(app).get('/api/public/hospital');
function details() {
  const value = defaultHospitalDetails();
  return {
    ...value,
    name: 'Synthetic Test Hospital',
    address: 'Synthetic test address',
    phone: '011 234 5678',
    email: 'Reception@Test.local',
    description: 'Synthetic test only',
    hours: value.hours.map((h, i) =>
      i < 5 ? { ...h, closed: false, opens: '08:00', closes: '17:00' } : h,
    ),
  };
}
before(async () => {
  await connectDatabase(isolatedUri('settings'));
  await seedTestAccounts();
  app = createApp(testConfig, { rateLimitEnabled: false });
  for (const role of ['admin', 'patient', 'doctor', 'receptionist']) {
    const r = await request(app)
      .post('/api/auth/login')
      .set('Origin', testConfig.origin)
      .send({ email: `${role}@test.local`, password: testPassword })
      .expect(200);
    cookies[role] = r.headers['set-cookie'].map((c) => c.split(';')[0]).join('; ');
  }
});
beforeEach(async () => {
  await HospitalSettings.deleteMany({});
  await AuditLog.deleteMany({ module: 'settings' });
});
after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('settings require administrator and same-origin mutation; public reads reveal only published information', async () => {
  const empty = await publicPage().expect(200);
  assert.deepEqual(empty.body, {
    hospital: null,
    regional: { timezone: 'Asia/Colombo', currency: 'LKR', language: 'English' },
  });
  await request(app).get('/api/admin/hospital-settings').expect(401);
  for (const role of ['patient', 'doctor', 'receptionist']) {
    await send('get', undefined, role).expect(403);
    await send('patch', undefined, role).send({ version: 0, details: details() }).expect(403);
    await send('post', '/admin/hospital-settings/publish', role).send({ version: 0 }).expect(403);
  }
  await request(app)
    .patch('/api/admin/hospital-settings')
    .set('Cookie', cookies.admin)
    .send({ version: 0, details: details() })
    .expect(403);
  await request(app).get('/api/public/hospital?draft=true').expect(400);
  const admin = await send('get').expect(200);
  assert.equal(admin.body.version, 0);
  assert.equal(admin.body.details.isDemo, true);
  assert.equal(await HospitalSettings.countDocuments(), 0);
});

test('drafts normalise contacts, preserve fixed regional defaults and never leak into public projection', async () => {
  const saved = await send('patch').send({ version: 0, details: details() }).expect(200);
  assert.equal(saved.body.version, 1);
  assert.equal(saved.body.details.phone, '+94112345678');
  assert.equal(saved.body.details.email, 'reception@test.local');
  assert.equal((await publicPage()).body.hospital, null);
  const audits = await AuditLog.find({ module: 'settings' }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'hospital_settings_saved');
  assert.ok(!JSON.stringify(audits).includes('Synthetic test address'));
  await send('patch')
    .send({ version: 1, details: { ...details(), SMTP_PASSWORD: 'not-a-secret' } })
    .expect(400);
  await send('patch').send({ version: 1, details: details(), timezone: 'UTC' }).expect(400);
  await send('get', '/admin/hospital-settings?version=0').expect(400);
});

test('publication requires complete contacts and valid ordered reception hours', async () => {
  await send('patch').send({ version: 0, details: defaultHospitalDetails() }).expect(200);
  const incomplete = await send('post', '/admin/hospital-settings/publish')
    .send({ version: 1 })
    .expect(400);
  assert.ok(incomplete.body.fields['details.name']);
  assert.equal((await send('get')).body.version, 1);
  for (const modify of [
    (v) => {
      v.phone = '+441234567890';
    },
    (v) => {
      v.hours[0].closes = '07:00';
    },
    (v) => {
      v.hours[0].opens = '25:00';
    },
    (v) => {
      v.hours[1].day = 'Monday';
    },
    (v) => {
      v.hours.pop();
    },
  ]) {
    const value = details();
    modify(value);
    await send('patch').send({ version: 1, details: value }).expect(400);
  }
  assert.equal(await AuditLog.countDocuments({ module: 'settings' }), 1);
});

test('published snapshot stays stable during draft edits and can be withdrawn without deleting draft', async () => {
  await send('patch').send({ version: 0, details: details() }).expect(200);
  await send('post', '/admin/hospital-settings/publish').send({ version: 1 }).expect(200);
  const published = (await publicPage().expect(200)).body;
  assert.equal(published.hospital.name, 'Synthetic Test Hospital');
  assert.deepEqual(Object.keys(published).sort(), ['hospital', 'regional']);
  for (const forbidden of ['updatedBy', 'version', 'draft', '_id', 'publishedAt'])
    assert.ok(!JSON.stringify(published).includes(`"${forbidden}"`));
  await send('patch')
    .send({ version: 2, details: { ...details(), name: 'Second draft' } })
    .expect(200);
  assert.equal((await publicPage()).body.hospital.name, 'Synthetic Test Hospital');
  await send('post', '/admin/hospital-settings/publish').send({ version: 3 }).expect(200);
  assert.equal((await publicPage()).body.hospital.name, 'Second draft');
  await send('post', '/admin/hospital-settings/unpublish').send({ version: 4 }).expect(200);
  assert.equal((await publicPage()).body.hospital, null);
  assert.equal((await send('get')).body.details.name, 'Second draft');
  assert.deepEqual(
    (await AuditLog.find({ module: 'settings' }).sort({ createdAt: 1 }).lean()).map(
      (a) => a.action,
    ),
    [
      'hospital_settings_saved',
      'hospital_settings_published',
      'hospital_settings_saved',
      'hospital_settings_published',
      'hospital_settings_unpublished',
    ],
  );
});

test('concurrent first saves and stale publish cannot overwrite another administrator', async () => {
  const responses = await Promise.all(
    ['A', 'B'].map((name) => send('patch').send({ version: 0, details: { ...details(), name } })),
  );
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await HospitalSettings.countDocuments(), 1);
  assert.equal(await AuditLog.countDocuments({ module: 'settings' }), 1);
  await send('post', '/admin/hospital-settings/publish').send({ version: 0 }).expect(409);
  await send('post', '/admin/hospital-settings/publish').send({ version: 1 }).expect(200);
  await send('post', '/admin/hospital-settings/unpublish').send({ version: 1 }).expect(409);
  assert.ok((await publicPage()).body.hospital);
});

test('audit failure rolls back settings changes and publication together', async () => {
  await send('patch').send({ version: 0, details: details() }).expect(200);
  const create = AuditLog.create;
  try {
    AuditLog.create = async () => {
      throw new Error('Synthetic audit failure');
    };
    await send('post', '/admin/hospital-settings/publish').send({ version: 1 }).expect(500);
  } finally {
    AuditLog.create = create;
  }
  assert.equal((await publicPage()).body.hospital, null);
  assert.equal((await send('get')).body.version, 1);
});

test('shared Sri Lankan normalisation separates reception landlines from SMS destinations', () => {
  assert.equal(sriLankanPhone('(011) 234-5678'), '+94112345678');
  assert.equal(sriLankanPhone('+94 77 123 4567', { mobileOnly: true }), '+94771234567');
  assert.equal(sriLankanPhone('0771234567', { mobileOnly: true }), '+94771234567');
  for (const value of ['', '+940112345678', '077123', '+441234567890', '077abc4567'])
    assert.equal(sriLankanPhone(value), null);
  assert.equal(sriLankanPhone('0112345678', { mobileOnly: true }), null);
});

test('24/7 hours persist and publish explicitly without ambiguous midnight intervals', async () => {
  const value = details();
  value.hours = value.hours.map((h) => ({
    ...h,
    closed: false,
    allDay: true,
    opens: '',
    closes: '',
  }));
  await send('patch').send({ version: 0, details: value }).expect(200);
  await send('post', '/admin/hospital-settings/publish').send({ version: 1 }).expect(200);
  const published = (await publicPage()).body.hospital;
  assert.ok(
    published.hours.every((h) => h.allDay && !h.closed && h.opens === '' && h.closes === ''),
  );
  value.hours[0].closed = true;
  await send('patch').send({ version: 2, details: value }).expect(400);
});
