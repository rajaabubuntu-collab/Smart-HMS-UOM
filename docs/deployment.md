# Deployment runbook

This is a prepared deployment procedure, not evidence of a live production deployment. Use an empty production database and real operator-provided settings; never publish the development demo accounts or unauthenticated development MongoDB container.

## 1. Provision the target

Choose a Linux host with Docker Compose, an HTTPS domain and a separately protected MongoDB replica set (MongoDB 7/compatible FCV). Use a database account restricted to the application database, encrypted transport and network access limited to the application host. The app initializes its collection indexes at startup, so grant required database/index privileges during provisioning. Confirm those permissions and transactional writes in staging. Keep the database inaccessible from the public internet except through the provider's controlled access mechanism.

Configure daily managed snapshots and restore access. Proposed retention: 14 daily and four weekly backups. Test restoration to a separate database before launch; the local backup CLI is intentionally not a cloud/remote tool. Record the chosen provider, schedule, retention, backup owner, restore credentials storage and measured recovery time. No production RPO/RTO has been established by the small local rehearsal.

## 2. Create private configuration and build

From the checkout:

```bash
cp deploy/production.env.example .env.production
chmod 600 .env.production
npm run image:build
```

Edit `.env.production` privately: set the exact HTTPS origin (no trailing slash/path), the authenticated TLS replica-set connection URI and a new random JWT secret of at least 32 characters. URL-encode database credentials. Generate the secret locally with a secure random generator; do not paste it into chat, shell command arguments or version control. Keep a protected copy for disaster recovery; rotating it invalidates existing sessions.

The Compose template supplies production mode, port 4000, container bind address and one trusted proxy hop. `TRUST_PROXY=true` assumes host Caddy is the only public entry point. Keep port 4000 loopback-only; never expose the app directly while trusting forwarded headers. DNS and port 80/443 firewall settings must point to this chosen host. `.env.production` stays outside the Docker build context but is passed as runtime environment, accessible to trusted Docker/host administrators.

The runtime uses a pinned Node image and the lockfile. Build a versioned tag per release and retain the previous image for rollback. The checked-in `smart-hms:0.10.0` tag is a local release label, not a published registry image.

## 3. Start privately and bootstrap the administrator

Keep the public proxy/firewall closed until the initial admin exists; otherwise public registration could create the first user before bootstrap.

```bash
docker compose -f compose.production.yaml up -d --wait
curl --fail http://127.0.0.1:4000/api/health
```

Create a mode-600 JSON file **outside version control** containing `name`, `email` and a strong `password` (12–72 UTF-8 bytes; minimum 12 characters). Choose the real administrator's details. Then redirect that file to:

```bash
docker compose -f compose.production.yaml exec -T app node server/scripts/bootstrap-admin.js < /PRIVATE/PATH/admin.json
```

Remove the private input file when done and transfer credentials through your chosen secure channel. Bootstrap requires zero existing user accounts and cannot add another admin later. An existing restored installation should use its original administrator accounts. Development `npm run seed` is not a production provisioning step.

## 4. Enable HTTPS and acceptance checks

Install Caddy on the host using its official instructions. Copy `deploy/Caddyfile.example` into its configuration and replace `hms.example.com` with the exact domain from `APP_ORIGIN`. Validate the config before reloading Caddy. Caddy connects to `127.0.0.1:4000` and handles HTTPS at the host; its certificate storage must persist.

Before inviting users, verify through the actual domain:

- HTTPS certificate validity, HTTP-to-HTTPS redirect and no exposed API/database ports.
- `/api/health`, administrator login, Secure/HttpOnly/SameSite=Strict cookie and logout revocation.
- One synthetic appointment → check-in → completed consultation → bill/payment → feedback workflow, plus report totals and audit visibility.
- Non-admin denial on admin screens/APIs, CSRF Origin rejection and absence of private content in operational logs.
- Actual provider backup restore into an isolated database, validated data/index counts, and the documented rollback path.

The built-in symptom guide remains an unvalidated navigation prototype. This deployment procedure does not authorize use as clinical triage or certify real-patient operational readiness.

## 5. Operation, rollback and recovery

Check `docker compose -f compose.production.yaml ps` and `logs --tail=100 app` (do not share configuration dumps containing secrets). Docker health status reports API/database readiness; an unhealthy status alone does not automatically restart a running process. Arrange external monitoring and alert ownership. `restart: unless-stopped` handles process/container exits, not a replacement for monitoring.

For an application-only rollback, stop traffic, retain the current database backup, change to the previous tested image tag and recreate the app. Confirm schema/index compatibility before doing so; there is no automatic schema-downgrade migration in this project. Do not restore an older database merely to roll back a frontend/server release, because that would discard later clinical/payment changes.

For database recovery, keep writers stopped; restore to a fresh database using the provider's tooling, verify collections/indexes and critical linked records, revoke recovered sessions, then deliberately update the app URI during the maintenance window. Preserve the old database until acceptance is complete. Check payment reconciliation with the operator before resuming writes. Resume service only after the actual environment's checks pass. Never run a destructive drop/overwrite command against the working database as a rehearsal.

The local commands and optional daily timer are documented in [week 10](week-10.md). They do not install a production backup service or perform a live cutover.
