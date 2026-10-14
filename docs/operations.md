# Operations and recovery

Updated 14 October 2026. The local development installation is now managed by **systemd user services**. This is separate from the prepared production Docker/Caddy deployment.

## Local service and monitoring

Open http://localhost:5173. The API is http://localhost:4000/api/health. Use `systemctl --user restart smart-hms-dev.service` to restart both API and frontend. The service first runs `npm run db:up` and waits for the existing Compose database to become healthy; startup retries if Docker or the mounted project is not yet available. MongoDB uses `restart: unless-stopped`. Existing database volumes are preserved. Logs are available through `journalctl --user -u smart-hms-dev.service`. Do not start a second `npm run dev` while the managed service is running. Stop it first for manual development.

`smart-hms-health.timer` checks application and database readiness every minute. It records status and elapsed time in the user journal without patient information. It does not send email or SMS alerts. Configure an operator-owned alert destination before production; no external alert recipient has been provided. Planned backup maintenance can briefly show an unavailable result.

User units run while the user's systemd manager is active; the computer must be powered on, the project drive mounted and Docker available. The managed app now starts and checks MongoDB automatically. No claim of around-the-clock laptop availability or remote uptime monitoring is made. `Persistent=true` on the backup timer schedules a missed backup after the user manager resumes. No privileged lingering configuration was changed.

## Daily encrypted local backup

`smart-hms-backup.timer` is enabled for **03:00 Asia/Colombo daily**. Manual runs completed successfully on 13 and 14 October. The task pauses only the managed local development service, verifies the API has stopped, creates an AES-256-GCM encrypted database archive with an authenticated manifest, and restarts the app even after failure. It resumes the application before an optional off-site transfer. Keep other direct writers to the development database stopped during the maintenance window.

Archives are under `.local/backups/`. The separate private key is under `~/.local/share/smart-hms/backup.key`. Never store the key with the encrypted archive. Login sessions and password reset tokens are excluded. Existing backups are retained; automatic deletion is deliberately not enabled before retention/storage ownership is agreed.

Inspect scheduling and results:

```bash
systemctl --user list-timers smart-hms-backup.timer smart-hms-health.timer
systemctl --user show smart-hms-backup.service -p Result
journalctl --user -u smart-hms-backup.service -n 20
```

## Off-site setup pending

A storage host has not been supplied, so current backups are **local only**. Copy `deploy/offsite.example.json` to `.local/offsite.json`, make it mode 600, and replace the example with the approved SSH account and directory. Provision the directory on the host, install `rsync` at both ends, configure a dedicated SSH key and verify the server host-key fingerprint through the storage operator. The helper enforces strict known-host verification and noninteractive authentication; it will not accept an unknown host automatically.

`npm run db:offsite -- .local/backups/backup-DIRECTORY` authenticates the local manifest and copies only `database.enc` and `manifest.json`. It never copies the decryption key. The scheduled backup invokes this helper automatically once the private configuration exists. A failed copy preserves the local backup and returns a failed job status. Transport errors and credentials are not printed. Set restricted permissions and an agreed retention policy on the remote account; proposed retention is 14 daily and four weekly copies, subject to operator approval. No remote copy or retention policy has been activated or tested.

## Restore and production

`npm run test:recovery` creates synthetic source data, checks archive encryption and tamper rejection, restores to a random isolated database, verifies document/index fingerprints, confirms that authentication sessions/reset links are absent, and removes only its own test databases. Eleven checks passed on 13 October.

For an operator-selected local archive, `npm run db:restore -- .local/backups/backup-DIRECTORY` restores into a new isolated database and keeps it for inspection. It never replaces the running database. Review restored data before any deliberate switch. For production, use the selected provider's authenticated snapshot/PITR tooling and test restoration there. Revoke recovered sessions and reset tokens; reconcile delivery jobs before re-enabling outbound messages.

Production HTTPS, external monitoring, managed snapshots and live SMTP/Twilio remain deployment steps requiring actual accounts and a hosting target. See [deployment](deployment.md) and [connectivity](connectivity.md). The local timers and loopback health check do not establish those services.

## Reboot recovery check - 14 October

The morning check found the frontend running while the API had exited after MongoDB failed to start. Node watch mode remained waiting for file changes, so the parent service appeared active. The installed development unit and its repository template now require a healthy Compose database before launching the app. MongoDB also has a restart policy. Starting the updated unit restored the existing published hospital data, API readiness and frontend proxy without resetting the database.

After a reboot, mount the project drive and ensure Docker is available. Check the backup journal for missed-run errors if the drive was absent when the persistent timer fired; run `systemctl --user start smart-hms-backup.service` after the app is healthy when a catch-up backup needs retrying. The backup is still local until a remote destination is configured.
