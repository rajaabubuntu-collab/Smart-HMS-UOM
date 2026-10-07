import { resolve } from 'node:path';
import mongoose from 'mongoose';
import { loadConfig } from '../../server/src/config.js';
import { localUri, key, keyPath, createBackup, restoreBackup } from './backup-lib.mjs';
const args = process.argv.slice(2),
  action = args.shift();
let client;
try {
  const config = loadConfig(),
    uri = new URL(config.mongoUri);
  if (
    config.env !== 'development' ||
    uri.hostname !== '127.0.0.1' ||
    uri.port !== '27018' ||
    uri.pathname !== '/smart_hms' ||
    uri.username ||
    uri.password
  )
    throw new Error('This tool is restricted to the existing local development database.');
  if (action === 'create' && (args.length !== 1 || args[0] !== '--writes-stopped'))
    throw new Error(
      'Usage: npm run db:backup -- --writes-stopped (stop all database writers first).',
    );
  if (action === 'restore' && (args.length !== 1 || args[0].startsWith('-')))
    throw new Error('Usage: npm run db:restore -- .local/backups/backup-DIRECTORY');
  if (!['create', 'restore'].includes(action)) throw new Error('Choose create or restore.');
  if (action === 'create') {
    let running = false;
    try {
      await fetch(`http://127.0.0.1:${config.port}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      running = true;
    } catch (err) {
      if (err.cause?.code !== 'ECONNREFUSED')
        throw new Error('Cannot verify that the local API is stopped. Stop it before backing up.', {
          cause: err,
        });
    }
    if (running)
      throw new Error(
        'The local API is still running. Stop it and every other writer before backing up.',
      );
  }
  const secret = await key(action === 'create');
  client = new mongoose.mongo.MongoClient(localUri);
  await client.connect();
  if (action === 'create') {
    const backup = await createBackup({ client, secret, writesStopped: true });
    console.log(
      `Encrypted backup: ${backup.path}\nKey (store separately): ${keyPath}\nSessions excluded. Copy the backup and key to separate protected storage.`,
    );
  } else {
    const result = await restoreBackup({ client, secret, path: resolve(args[0]) });
    console.log(
      `Verified isolated restore: ${result.target}\nWorking database untouched. Restored sessions: 0.\nThe restored database is retained for inspection; no application was switched to it.`,
    );
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client?.close();
}
