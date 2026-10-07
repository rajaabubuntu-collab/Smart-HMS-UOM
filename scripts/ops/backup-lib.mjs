import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rm, mkdtemp, stat, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  timingSafeEqual,
} from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export const localUri = 'mongodb://127.0.0.1:27018/?replicaSet=rs0&directConnection=true';
export const keyPath = join(homedir(), '.local/share/smart-hms/backup.key');
export const newDatabase = (prefix) => `smart_hms_${prefix}_${randomBytes(12).toString('hex')}`;
export function assertSource(source) {
  if (!/^(smart_hms|smart_hms_rehearsal_[a-f0-9]{24})$/.test(source))
    throw new Error(
      'Only the local smart_hms database or an isolated rehearsal source is supported.',
    );
}
export async function key(create = false, path = keyPath) {
  if (create) {
    await mkdir(resolve(path, '..'), { recursive: true, mode: 0o700 });
    try {
      await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  const info = await stat(path);
  if (!info.isFile() || info.mode & 0o077)
    throw new Error('Backup key must be a private regular file (chmod 600).');
  const bytes = await readFile(path);
  if (bytes.length !== 32) throw new Error('Backup key must contain exactly 32 bytes.');
  return bytes;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
const serialized = (value) =>
  JSON.stringify(
    canonical(JSON.parse(mongoose.mongo.BSON.EJSON.stringify(value, { relaxed: false }))),
  );
export async function fingerprints(db) {
  const result = {};
  for (const c of (await db.listCollections().toArray()).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (c.name === 'sessions') continue;
    if (c.type !== 'collection' || c.name.startsWith('system.'))
      throw new Error('Only ordinary application collections are supported.');
    const hash = createHash('sha256');
    let count = 0;
    for await (const doc of db.collection(c.name).find().sort({ _id: 1 })) {
      hash.update(serialized(doc) + '\n');
      count++;
    }
    const indexes = (await db.collection(c.name).listIndexes().toArray())
      .map((i) => {
        const { ns, ...spec } = i;
        void ns;
        return { ...spec, key: Object.entries(spec.key) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    result[c.name] = {
      count,
      sha256: hash.digest('hex'),
      indexes: JSON.parse(serialized(indexes)),
      options: JSON.parse(serialized(c.options || {})),
    };
  }
  return result;
}
export function dockerTool(name, args) {
  const child = spawn(
    'docker',
    [
      'compose',
      '-f',
      join(root, 'compose.yaml'),
      'exec',
      '-T',
      'mongo',
      name,
      '--host=127.0.0.1',
      '--port=27017',
      ...args,
    ],
    { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  // Tool errors may contain source documents: retain only exit status in user output.
  child.stderr.resume();
  const done = new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error(`${name} could not start.`)));
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${name} failed (exit ${code}). Check Docker/database availability.`)),
    );
  });
  done.catch(() => {});
  return { child, done };
}
export async function createBackup({
  client,
  source = 'smart_hms',
  writesStopped = false,
  directory = join(root, '.local/backups'),
  secret,
}) {
  assertSource(source);
  if (!writesStopped)
    throw new Error(
      'Stop all application processes and other database writers, then pass --writes-stopped.',
    );
  const db = client.db(source),
    before = await fingerprints(db);
  if (!Object.keys(before).length)
    throw new Error('Source database has no application collections.');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = await mkdtemp(join(directory, 'backup-'));
  await chmod(path, 0o700);
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', secret, iv);
  const { child, done } = dockerTool('mongodump', [
    `--db=${source}`,
    '--archive',
    '--gzip',
    '--excludeCollection=sessions',
  ]);
  child.stdin.end();
  try {
    await Promise.all([
      pipeline(
        child.stdout,
        cipher,
        createWriteStream(join(path, 'database.enc'), { flags: 'wx', mode: 0o600 }),
      ),
      done,
    ]);
    const after = await fingerprints(db);
    if (serialized(before) !== serialized(after))
      throw new Error('Source changed during backup. Stop every writer and retry.');
    const payload = JSON.stringify({
      version: 1,
      source,
      createdAt: new Date().toISOString(),
      algorithm: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: cipher.getAuthTag().toString('hex'),
      excluded: ['sessions'],
      collections: before,
    });
    await writeFile(
      join(path, 'manifest.json'),
      JSON.stringify(
        { payload, signature: createHmac('sha256', secret).update(payload).digest('hex') },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    return { path, collections: before };
  } catch (err) {
    child.kill();
    await done.catch(() => {});
    await rm(path, { recursive: true, force: true });
    throw err;
  }
}
export async function restoreBackup({ client, path, secret }) {
  const envelope = JSON.parse(await readFile(join(path, 'manifest.json'), 'utf8'));
  if (typeof envelope.payload !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature || ''))
    throw new Error('Invalid backup manifest.');
  const signature = createHmac('sha256', secret).update(envelope.payload).digest();
  if (!timingSafeEqual(signature, Buffer.from(envelope.signature, 'hex')))
    throw new Error('Backup authentication failed: wrong key or altered manifest.');
  const meta = JSON.parse(envelope.payload);
  assertSource(meta.source);
  if (
    meta.version !== 1 ||
    meta.algorithm !== 'aes-256-gcm' ||
    !/^[a-f0-9]{24}$/.test(meta.iv) ||
    !/^[a-f0-9]{32}$/.test(meta.tag)
  )
    throw new Error('Unsupported backup format.');
  // Authenticate the entire archive before sending any data to mongorestore.
  const temp = await mkdtemp(join(resolve(path), '.restore-'));
  await chmod(temp, 0o700);
  const archive = join(temp, 'verified.archive.gz');
  const target = newDatabase('restore');
  let started = false;
  try {
    const cipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(meta.iv, 'hex'));
    cipher.setAuthTag(Buffer.from(meta.tag, 'hex'));
    try {
      await pipeline(
        createReadStream(join(path, 'database.enc')),
        cipher,
        createWriteStream(archive, { flags: 'wx', mode: 0o600 }),
      );
    } catch {
      throw new Error(
        'Encrypted archive is damaged or authentication failed. No database was restored.',
      );
    }
    if ((await client.db(target).listCollections().toArray()).length)
      throw new Error('Generated restore destination already exists.');
    started = true;
    const { child, done } = dockerTool('mongorestore', [
      '--archive',
      '--gzip',
      '--stopOnError',
      `--nsInclude=${meta.source}.*`,
      `--nsExclude=${meta.source}.sessions`,
      `--nsFrom=${meta.source}.*`,
      `--nsTo=${target}.*`,
    ]);
    child.stdout.resume();
    try {
      await Promise.all([pipeline(createReadStream(archive), child.stdin), done]);
    } catch (err) {
      child.kill();
      await done.catch(() => {});
      throw err;
    }
    const actual = await fingerprints(client.db(target));
    if (serialized(actual) !== serialized(meta.collections))
      throw new Error('Restored document or index verification failed.');
    if (await client.db(target).collection('sessions').countDocuments())
      throw new Error('Sessions must not be restored.');
    return { target, collections: actual };
  } catch (err) {
    if (started) await client.db(target).dropDatabase(); // Only this run's random, previously empty destination.
    throw err;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
