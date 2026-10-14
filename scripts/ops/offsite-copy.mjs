import { readFile, realpath, stat } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { root, key } from './backup-lib.mjs';
const exec = promisify(execFile);
try {
  if (process.argv.length !== 3)
    throw new Error('Usage: npm run db:offsite -- .local/backups/backup-DIRECTORY');
  const configPath = join(root, '.local/offsite.json');
  const permission = await stat(configPath);
  if (!permission.isFile() || permission.mode & 0o077)
    throw new Error('Off-site configuration must be a private regular file (mode 600).');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  if (
    !/^[a-z_][a-z0-9_-]*@[a-z0-9][a-z0-9.-]+$/i.test(config.host || '') ||
    !/^\/[a-z0-9_./-]+$/i.test(config.directory || '') ||
    config.directory.includes('..')
  )
    throw new Error('Configure an approved SSH user@host and absolute remote directory.');
  const folder = await realpath(resolve(process.argv[2]));
  if (
    dirname(folder) !== (await realpath(join(root, '.local/backups'))) ||
    !/^backup-[a-z0-9]+$/i.test(basename(folder))
  )
    throw new Error('Only a generated local backup directory can be copied.');
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  const expected = createHmac('sha256', await key())
    .update(manifest.payload)
    .digest();
  const actual = Buffer.from(manifest.signature || '', 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new Error('Backup manifest authentication failed.');
  for (const name of ['manifest.json', 'database.enc'])
    if (!(await stat(join(folder, name))).isFile()) throw new Error('Missing backup file.');
  // Known-host verification and noninteractive public-key authentication are required.
  // No keys, plaintext archives, database documents or recipient contact details are copied.
  await exec(
    'rsync',
    [
      '--archive',
      '--checksum',
      '--protect-args',
      '-e',
      'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15',
      '--',
      join(folder, 'database.enc'),
      join(folder, 'manifest.json'),
      `${config.host}:${config.directory}/${basename(folder)}/`,
    ],
    { timeout: 300000, maxBuffer: 1048576 },
  );
  console.log(
    'Encrypted archive and authenticated manifest copied to the configured off-site destination. Keep the recovery key separately.',
  );
} catch (error) {
  console.error(
    error.code === 'ENOENT'
      ? 'Off-site setup is incomplete. See docs/operations.md.'
      : error.cmd
        ? 'Off-site copy failed; local backup retained. Check SSH access and destination.'
        : error.message,
  );
  process.exitCode = 1;
}
