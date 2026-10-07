import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, mkdtemp, rm, readFile, writeFile, cp } from 'node:fs/promises';
import mongoose from 'mongoose';
import {
  connectDatabase,
  Patient,
  Doctor,
  Appointment,
  Consultation,
  Bill,
  Payment,
  Feedback,
  Notification,
  Session,
  AuditLog,
} from '../../server/src/models.js';
import { seedTestAccounts } from '../../server/test/helpers.js';
import {
  root,
  localUri,
  newDatabase,
  assertSource,
  createBackup,
  restoreBackup,
  fingerprints,
} from './backup-lib.mjs';
const source = newDatabase('rehearsal'),
  secret = randomBytes(32),
  started = Date.now();
let client, folder, target;
const checks = [];
try {
  await mkdir(join(root, '.local'), { recursive: true, mode: 0o700 });
  folder = await mkdtemp(join(root, '.local/recovery-test-'));
  const uri = new URL(localUri);
  uri.pathname = `/${source}`;
  await connectDatabase(uri.toString());
  const fixtures = await seedTestAccounts(),
    patient = await Patient.findOne({ user: fixtures.users.patient._id }),
    doctor = await Doctor.findOne({ user: fixtures.users.doctor._id });
  const id = () => new mongoose.Types.ObjectId();
  const appointment = await Appointment.create({
    reference: 'RECOVERY-SYNTHETIC',
    patient: patient._id,
    doctor: doctor._id,
    slot: id(),
    schedule: id(),
    bookedBy: fixtures.users.patient._id,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 900000),
    doctorName: 'Synthetic Doctor',
    departmentName: 'General Medicine',
    consultationFeeMinor: 250000,
    status: 'Completed',
  });
  await Consultation.create({
    appointment: appointment._id,
    patient: patient._id,
    doctor: doctor._id,
    status: 'Completed',
    completedAt: new Date(),
    notes: 'Synthetic recovery note',
  });
  const bill = await Bill.create({
    reference: 'RECOVERY-INVOICE',
    appointment: appointment._id,
    patient: patient._id,
    doctor: doctor._id,
    totalMinor: 250000,
    paidMinor: 100000,
    dueDate: '2026-10-31',
    items: [{ description: 'Synthetic consultation', quantity: 1, unitPriceMinor: 250000 }],
  });
  await Payment.create({
    bill: bill._id,
    reference: 'RECOVERY-RECEIPT',
    requestKey: String(id()),
    actor: fixtures.users.admin._id,
    amountMinor: 100000,
    method: 'Cash',
  });
  await Feedback.create({
    appointment: appointment._id,
    patient: patient._id,
    doctor: doctor._id,
    appointmentReference: appointment.reference,
    patientName: 'Synthetic patient',
    doctorName: 'Synthetic doctor',
    departmentName: 'General Medicine',
    visitAt: appointment.startsAt,
    rating: 4,
    comment: 'Synthetic feedback',
  });
  await Notification.create({
    recipient: fixtures.users.patient._id,
    eventKey: 'recovery',
    type: 'billing',
    title: 'Synthetic notice',
    message: 'Recovery fixture',
    path: '/billing',
  });
  await Session.create({
    user: fixtures.users.patient._id,
    expiresAt: new Date(Date.now() + 3600000),
  });
  await AuditLog.create({
    actor: fixtures.users.admin._id,
    action: 'recovery_fixture',
    module: 'setup',
    target: String(appointment._id),
  });
  await mongoose.disconnect();
  client = new mongoose.mongo.MongoClient(localUri);
  await client.connect();
  const liveBefore = await fingerprints(client.db('smart_hms'));
  assert.throws(() => assertSource('admin'));
  assert.throws(() => assertSource('smart_hms_restore_bad'));
  await assert.rejects(createBackup({ client, source, secret, directory: folder }), /Stop all/);
  checks.push('source and writes-stopped guards');
  const backup = await createBackup({
    client,
    source,
    secret,
    directory: folder,
    writesStopped: true,
  });
  const encrypted = await readFile(join(backup.path, 'database.enc'));
  assert.ok(!encrypted.includes(Buffer.from('Synthetic recovery note')));
  checks.push('encrypted archive');
  await assert.rejects(
    restoreBackup({ client, path: backup.path, secret: randomBytes(32) }),
    /authentication failed/,
  );
  checks.push('wrong key rejected');
  const altered = join(folder, 'altered');
  await cp(backup.path, altered, { recursive: true });
  const manifest = JSON.parse(await readFile(join(altered, 'manifest.json'), 'utf8'));
  manifest.payload += ' ';
  await writeFile(join(altered, 'manifest.json'), JSON.stringify(manifest));
  await assert.rejects(restoreBackup({ client, path: altered, secret }), /authentication failed/);
  checks.push('altered manifest rejected');
  await cp(backup.path, altered, { recursive: true });
  const damaged = Buffer.from(encrypted);
  damaged[Math.floor(damaged.length / 2)] ^= 1;
  await writeFile(join(altered, 'database.enc'), damaged);
  await assert.rejects(
    restoreBackup({ client, path: altered, secret }),
    /damaged|authentication failed/,
  );
  checks.push('damaged archive rejected before restore');
  const result = await restoreBackup({ client, path: backup.path, secret });
  target = result.target;
  assert.notEqual(target, source);
  assert.notEqual(target, 'smart_hms');
  assert.deepEqual(result.collections, backup.collections);
  checks.push('all document hashes, collection options and indexes match');
  assert.equal(await client.db(target).collection('sessions').countDocuments(), 0);
  checks.push('login sessions excluded');
  const saved = await client.db(target).collection('patients').findOne();
  await assert.rejects(
    client
      .db(target)
      .collection('patients')
      .insertOne({ ...saved, _id: id() }),
    (err) => err.code === 11000,
  );
  checks.push('restored unique index enforced');
  const again = await restoreBackup({ client, path: backup.path, secret });
  assert.notEqual(again.target, target);
  await client.db(again.target).dropDatabase();
  checks.push('repeat restore creates another new database');
  assert.deepEqual(await fingerprints(client.db('smart_hms')), liveBefore);
  checks.push('working database unchanged');
  await writeFile(
    join(root, '.local/recovery-rehearsal.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        durationMs: Date.now() - started,
        passed: checks,
        collections: Object.fromEntries(
          Object.entries(result.collections).map(([name, value]) => [name, value.count]),
        ),
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  console.log(
    `Recovery rehearsal passed: ${checks.length} checks. Evidence: .local/recovery-rehearsal.json`,
  );
} finally {
  await mongoose.disconnect();
  if (client) {
    if (target) await client.db(target).dropDatabase();
    await client.db(source).dropDatabase();
    await client.close();
  }
  if (folder) await rm(folder, { recursive: true, force: true });
}
