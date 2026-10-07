# Week 10 — recovery and deployment preparation

This milestone adds encrypted local backups, verified isolated restoration, a repeatable recovery rehearsal, a production container, HTTPS configuration, first-administrator bootstrap and optional daily-backup service templates. It does not publish a website, provision a production database or enable a timer on this computer.

## Local backup and restore

Keep MongoDB running (`npm run db:up`), but stop the API, reminder worker and every other process writing to the development database. In a normal terminal, stop `npm run dev` with Ctrl+C. The backup command checks that the configured local API port refuses connections and requires an explicit stopped-writers acknowledgement; it cannot discover an unrelated script or database client writing directly.

```bash
npm run db:backup -- --writes-stopped
npm run db:restore -- .local/backups/backup-DIRECTORY
```

The first command prints a new backup directory. Pass that directory to the second command. Neither command accepts a destination database or uses `--drop`. Restore generates a fresh `smart_hms_restore_<random>` database and verifies it before reporting success. The original `smart_hms` database is not overwritten and no running app is redirected. A successful restored database is retained for inspection. Failed restores remove only their own newly generated destination.

- Archives use gzip and AES-256-GCM encryption with a fresh nonce. An HMAC-authenticated manifest records collection document counts, SHA-256 hashes, collection options and index definitions. Wrong keys, altered manifests and corrupted archives fail verification.
- The 32-byte key lives at `~/.local/share/smart-hms/backup.key`, outside the checkout, with file mode 600. Backup directories/files use 700/600 and are under gitignored `.local/backups/`. Manifests contain collection names/counts/hashes, not record contents.
- **Store a protected copy of the key separately from the backup. Losing the key makes the archive unusable.** Copy encrypted backups to separate protected storage; a backup on the same disk does not cover disk loss. No off-device copy is made automatically.
- Login sessions are deliberately excluded. Users must sign in again after recovery. Password hashes and clinical/financial records are preserved within the encrypted archive, so the key and restored databases require the same access protection as the source.
- Restore authenticates and decrypts to a private temporary file before invoking MongoDB's restore utility, then deletes the file. This temporary plaintext exists during restoration; use an encrypted, access-controlled disk. Abrupt power loss can leave a `.restore-*` directory for an operator to remove after inspection.
- Source fingerprints are compared before/after dumping. This detects observed changes but does not replace stopping all writers: it is an offline, single-database backup, not a live point-in-time backup with oplog replay.
- Commands are deliberately restricted to the project's existing local MongoDB 7 Compose service on `127.0.0.1:27018` and development database configuration. They are not remote/Atlas backup tools. Production must use provider snapshots/PITR or separately configured authenticated database tooling.
- No automated pruning is enabled. Review storage usage; only delete older copies after verifying newer restores and the independent storage copy. The proposed production retention policy is 14 daily backups plus four weekly backups, subject to the project's actual hosting/storage choice.

### Recovery rehearsal

```bash
npm run test:recovery
```

This creates a random synthetic database containing accounts, a completed consultation, bill/payment, feedback, notification, session and audit entry. It backs up/restores, compares all documents and indexes, proves a restored unique index is enforced, rejects bad keys/modified manifests/damaged archives, verifies a second restore uses a different database and checks that the working database is unchanged. It removes its own test databases/files and writes non-sensitive evidence to `.local/recovery-rehearsal.json`. Recovery does not prove clinical correctness or production recovery time; the dataset is deliberately small.

### Daily backup automation template

The interim report calls for a daily automated strategy. `deploy/systemd/` supplies a development-service unit, backup service and a daily **03:00 Asia/Colombo** timer with missed-run catch-up. `scheduled-backup.mjs` stops only `smart-hms-dev.service`, runs the guarded backup and restarts that service in `finally`, including after a failed backup. Other/manual writers must still be stopped. There is a short maintenance interruption; allow it before enabling the timer.

To opt in on a Linux workstation:

1. Replace `/ABSOLUTE/PROJECT/PATH` in the three `.example` files, verify Node/npm paths, and copy them without `.example` into `~/.config/systemd/user/`. Leave `WorkingDirectory` unquoted even when it contains spaces; keep the script argument in `ExecStart` quoted.
2. Start MongoDB, stop any manually launched dev server, and use `systemctl --user daemon-reload` followed by `systemctl --user start smart-hms-dev.service`.
3. Test `systemctl --user start smart-hms-backup.service`, inspect `journalctl --user -u smart-hms-backup.service`, and verify an isolated restore.
4. Enable `systemctl --user enable --now smart-hms-backup.timer`. Inspect `systemctl --user list-timers`. User-session availability controls execution; persistent timers catch missed runs at the next activation. This does not enable machine boot/login persistence or keep Docker running while the computer is off.
5. Disable with `systemctl --user disable --now smart-hms-backup.timer`. Backups are retained.

These templates were syntax-checked, not installed/enabled. For production, choose the managed database's daily snapshot schedule and retention before opening access; a local workstation timer is not a production backup policy.

## Container and first deployment

See [deployment runbook](deployment.md). `Dockerfile` builds the frontend and installs only server production dependencies in a separate runtime stage. The runtime runs as `node`, serves the built SPA and API together, and has an API/database health check. The image build context excludes `.env`, `.local`, tests and other unrelated workspace files.

`compose.production.yaml` publishes only host loopback port 4000, sets a read-only root filesystem, drops capabilities, enables no-new-privileges, bounds container log files and allows graceful shutdown. Host Caddy terminates HTTPS using `deploy/Caddyfile.example`. Container binding is explicitly `0.0.0.0`; normal development still defaults to `127.0.0.1` through the new validated `BIND_HOST` setting.

The initial administrator is created from a private JSON stdin file by `server/scripts/bootstrap-admin.js`. It works only when no users exist; a unique installation marker serializes concurrent attempts. Credentials are hashed, an audit event is recorded atomically, and passwords are never printed. Subsequent attempts cannot create additional administrators. The demo seed remains restricted to development.

```bash
npm run image:build
npm run test:production
```

The production smoke test runs the actual image with a synthetic local database, read-only filesystem, non-root UID and a temporary loopback HTTPS proxy/certificate. It verifies readiness, secret/build-tool exclusion, HSTS, trusted-Origin enforcement, Secure/HttpOnly/SameSite cookies, login, a built React route, logout/session revocation and graceful shutdown. Self-signed certificate acceptance is scoped to this isolated test browser. It creates no public listener, DNS record or external deployment. Evidence: `.local/production-smoke.json`.

## Dependencies and validation

The build discovered the `shell-quote` advisory affecting the development launcher. A scoped npm override pins `concurrently`'s dependency to patched 1.11.0; no forced major downgrade was used. The production dependency stage contains no `concurrently` or Vite. The Node 24 base image is pinned to the digest tested here; rebuild and review dependency/image updates periodically.

Validated on 7 October 2026: 92 API tests and 20 browser tests passed, plus the 10-check recovery rehearsal and 8-check production smoke test. Lint, production build, formatting, Compose configuration and the project systemd units passed validation. Caddy accepted the example configuration. The dependency audit reported zero known vulnerabilities.

A backup of the existing local database was created at `.local/backups/backup-EOvFCA` and verified into `smart_hms_restore_e9b0002c69cba47de1d73392`; the working database was not switched or overwritten. This restored copy remains on the local MongoDB instance for inspection.

Four new API tests cover production config validation, bootstrap input validation, concurrent initial admin attempts and post-install rejection. Run the full checks with `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build`, `npm run format:check`, `npm run test:recovery` and `npm run test:production` (build the image first).

## Source references

- [MongoDB mongodump](https://www.mongodb.com/docs/database-tools/mongodump/): BSON archive, gzip, collection exclusion and metadata/index capture. This workflow stops writes and does not claim oplog-based consistency.
- [MongoDB mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/): archive restoration and namespace remapping into a fresh destination.
- [Docker Node.js guide](https://docs.docker.com/guides/nodejs/): container build/runtime separation and non-root execution.
- [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) and [HTTPS quick start](https://caddyserver.com/docs/quick-starts/https): host HTTPS termination in front of the loopback application.
- [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv): patched dependency version.

Next: choose the actual host/domain and backup provider, then complete deployment-specific acceptance checks and final evaluation/user documentation. Password recovery and external email/SMS remain separate unfinished features.
