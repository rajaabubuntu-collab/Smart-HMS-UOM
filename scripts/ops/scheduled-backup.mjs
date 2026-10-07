// Optional systemd user timer entry point for this local development Compose database.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { root } from './backup-lib.mjs';
const exec = promisify(execFile),
  unit = 'smart-hms-dev.service';
let restart = false;
try {
  // Refuse unknown service state; never stop arbitrary manually started processes.
  let status;
  try {
    status = (await exec('systemctl', ['--user', 'is-active', unit])).stdout.trim();
  } catch (err) {
    status = err.stdout?.trim();
    if (status !== 'inactive')
      throw new Error('Configure smart-hms-dev.service before enabling the backup timer.', {
        cause: err,
      });
  }
  if (!['active', 'inactive'].includes(status))
    throw new Error('The managed development service is not in a stable state.');
  restart = status === 'active';
  if (restart) await exec('systemctl', ['--user', 'stop', unit]);
  const result = await exec(
    process.execPath,
    [join(root, 'scripts/ops/backup.mjs'), 'create', '--writes-stopped'],
    { cwd: root, maxBuffer: 1024 * 1024 },
  );
  process.stdout.write(result.stdout);
} catch {
  console.error(
    'Scheduled backup failed. Check the user-service journal; existing backups were retained.',
  );
  process.exitCode = 1;
} finally {
  if (restart)
    try {
      await exec('systemctl', ['--user', 'start', unit]);
    } catch {
      console.error('Could not restart smart-hms-dev.service; operator action required.');
      process.exitCode = 1;
    }
}
