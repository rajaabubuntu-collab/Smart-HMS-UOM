# Security decisions (weeks 1–7)

This is a local academic prototype, not a production clinical deployment. Use synthetic data.

## Authentication and sessions

- Passwords are hashed with bcrypt cost 12. API schemas reject passwords longer than bcrypt's 72-byte boundary when accounts are created.
- Only patients may self-register. Administrators create doctors/receptionists. No route accepts creation of an administrator.
- JWTs use HS256 with a generated secret, explicit issuer/audience, user subject and persisted session ID. Tokens expire after `SESSION_HOURS` (default 8).
- The browser receives an HTTP-only, SameSite=Strict cookie; production adds Secure. JWTs are never stored in localStorage or returned in JSON.
- Every authenticated request checks the database session expiry and account active state, not just the JWT signature. Logout deletes the active session, preventing cookie replay. Other device sessions remain active until expiry.
- TTL indexes clean expired session records; security does not depend on TTL timing.
- Invalid account/password messages match. Unknown-user login still performs a bcrypt comparison. Rate limits protect authentication endpoints.

## Permissions and request validation

- API roles are enforced independently of frontend navigation. Users cannot choose a role at login or elevate it through request bodies.
- Patients read/update only the profile associated with their session and their own appointments. Doctors see their own staff profile, schedules and assigned appointments; reported allergy details are included only for their non-cancelled appointments. Receptionists/admins have hospital operational appointment and patient-intake access; doctors cannot browse that directory. Clinical routes additionally require a non-cancelled appointment assigned to the doctor; patients see only their own completed records. Operational roles cannot read clinical notes or prescriptions.
- Strict request schemas allowlist fields. MongoDB operators and arbitrary profile IDs are not accepted.
- Every mutating request requires a trusted exact Origin, including login. This protects the cookie-based API from cross-site form/fetch actions. CORS is restricted to the configured frontend origin, but is not treated as the sole CSRF defence.
- Response headers come from Helmet; JSON body limit is 20 KB. Secrets, passwords and patient form bodies are not logged. Internal errors are not returned to the browser.

## Data integrity and audit

- Unique indexes enforce email/department identity, including competing requests. Validation alone is not treated as a uniqueness guarantee.
- Registration, profile/contact updates, staff management, schedules and appointment mutations use MongoDB transactions. Their associated audit entries commit with the data change. Shared doctor/patient document writes prevent race conditions across overlapping sessions and patient bookings; partial unique indexes enforce slot occupancy.
- Audit records contain actor ID (if known), action, module, target ID and UTC creation time. They exclude password values and medical details. Failed login attempts are recorded without the attempted email.
- There are no audit update/delete API endpoints. This is append-only at the application level, not tamper-proof against a database administrator. Restricted database permissions and retention controls belong in deployment work.
- Integer minor currency units prevent fee rounding loss. Age should be calculated from birth date rather than stored independently.

## Local configuration and remaining work

- `.env` and `.local/dev-credentials.txt` are ignored by Git; newly generated files request owner-only filesystem permissions. The seed refuses non-development mode and preserves existing accounts.
- Local MongoDB is bound to loopback on 27018, has its own volume and uses a single-member replica set. Do not expose this unauthenticated development database externally.
- Do not enable proxy trust unless the application is reachable only through the configured trusted proxy. The API binds to loopback.
- Production needs HTTPS, database authentication/least privilege, backups and a restore drill, operational logs, monitoring and a reviewed access/retention policy.
- Password reset, password change/forced initial-password rotation, user-initiated all-device logout and patient account-state management remain future tasks. Admin staff deactivation revokes all sessions and is blocked for doctors with open appointments. Seed and staff-created initial passwords are for the academic prototype only and must be shared privately.
- Receptionist/admin intake editing records patient-reported allergy information; doctors review the current reported allergies explicitly, with stale allergy reviews rejected on save/completion/revision. Empty allergy records are labelled as unrecorded, never treated as confirmation of no allergies.

No claims of legal compliance, clinical safety certification or production readiness are made by this milestone.

## Clinical integrity (week 4)

- Clinical routes deny receptionist/admin access. Patient history is resolved from the signed-in user and contains completed records only. Doctors must supply a non-cancelled appointment assigned to them; no arbitrary patient-ID history lookup exists.
- Consultation starts, saves, completion and prescription revisions use transactions. Shared doctor/patient write locks and partial unique indexes permit only one active consultation per doctor and patient. Completion cannot partially publish a record or leave the appointment in its old state.
- Expected revision numbers reject stale edits. Allergy review must match the current patient record; concurrent intake edits and consultation writes cannot silently approve a stale list.
- Completion locks consultation notes. Prescription edits append an attributed version and reason, preserving originals. Clinical read and mutation audit entries contain identifiers, not copied medical note text.
- Clinical history access remains available through completed assigned appointments. A cancelled appointment never grants access. This appointment-based policy is documented for the academic prototype; consent, delegated care teams and break-glass access are not implemented.

## Billing integrity (week 5)

- Patient queries resolve ownership from the authenticated account; client-supplied patient filters are rejected. Doctors cannot access billing routes. Reception/admin billing responses contain operational billing data, not clinical notes.
- Completion and automatic invoice generation share a transaction; a unique appointment index prevents duplicate invoices. Manual generation locks the assigned doctor consistently with consultation operations and rechecks appointment state.
- All monetary values are integer minor units. Totals, paid amounts, balances and status are server-controlled; clients submit bounded line quantities/prices and payment amounts only.
- Bill edits/payment writes/reversals increment the bill revision and use transactions. Concurrent updates conflict and retry against the latest revision, preventing overpayment and lost edits. Once a payment exists, charge changes are blocked even after reversal.
- Payment retries use unique per-bill UUID keys plus exact actor/payload matching. Original receipts and reversed entries remain in history; only admins can reverse with a mandatory reason. This records an external payment correction and never sends money.
- Audit entries record invoice creation/revision, payment recording and reversal. Online gateway integration, credit notes, refunds and financial-system reconciliation remain outside scope.

## Notifications (week 6)

- Inbox list/count/read operations always include the authenticated recipient ID. Staff/admin have no cross-user inbox access. Strict schemas reject attempts to provide another recipient or edit message/path content.
- Notification paths and messages are generated server-side. Notices avoid clinical note, diagnosis, medication and allergy content. Target pages still enforce their own record permissions.
- Workflow notices share source transactions. Unique recipient/event keys deduplicate delivery; payment retries return the existing receipt before notification generation.
- Reminder delivery rechecks appointment status/time under the scheduling doctor lock and commits its deduplication marker with the notice. Reschedule revision keys make repeated workers/restarts safe. At the week-6 baseline, no unauthenticated scheduling trigger or external email/SMS service was introduced. The later delivery implementation is documented below.
- Mark-all is scoped to the caller and a timestamp cutoff. Read flags represent in-app acknowledgement only. Historical messages remain even if an appointment subsequently changes; users follow the link for current state.

## Department guide (week 7)

- Only authenticated patients submit requests. Strict bounded schemas reject forged patient/age fields; age comes from the caller's profile. Symptoms are treated as plain data, never as executable rules or prompts to an external model.
- Fixed rule matching is local. Raw symptom text, comments, duration and pain scores are not persisted or sent to external AI services. Audit entries store actor, outcome and rule version only; booking links contain doctor/department IDs, not medical text.
- Warning-sign responses, high reported pain and uncertainty suppress routine booking suggestions. This does not establish the absence of danger and is not clinically validated triage. No diagnosis/treatment output or fabricated medical probabilities are provided.
- Doctor suggestions and booking deep links exclude inactive accounts/departments. Final booking still applies existing transactional scheduling and ownership checks. Previously generated suggestions cannot bypass deactivation or reserve a slot.
- The MongoDB container's file descriptor limit is explicitly 64,000 to prevent the observed development file-exhaustion crash. This changes only the container limit and preserves its named data volume.

## Feedback (week 8)

- Patient identity derives from the session and patient profile; every visit query includes ownership. Only completed visits are eligible. Doctor/patient/appointment snapshots are generated by the server, not accepted from the request body.
- A unique appointment index blocks duplicate feedback even under simultaneous requests. Submission and its content-free audit event commit together. No feedback edit/delete APIs exist; administrators have read-only search/list access, and doctors/receptionists have neither list nor submit access.
- Ratings are bounded integers, comments are at most 2,000 characters, search is at most 100 characters, and query schemas reject extra identity filters. Search escapes regex metacharacters. React renders comment text without HTML interpretation.
- Patient responses omit identity/contact/clinical fields. Admin responses retain only feedback and visit-identification data, not clinical record content. Feedback is explicitly identified to administrators, not anonymous or public. Comments are stored but not copied into notifications or audit events. Drafts remain only in component memory while the form is open.

## Reports and audit viewer (week 9)

- Catalogue, report generation, audit listings and filter options require the administrator role server-side as well as in the UI. Read-only routes accept strict bounded filters; no role, patient identity or executable aggregation stages are accepted from clients.
- Report aggregation projects only required fields. Patient contact/credential/clinical fields and feedback comments never enter responses. Demographics and feedback reports return aggregate counts; registrations and daily appointments expose only necessary identification to admins.
- Each report response uses a MongoDB snapshot transaction so table rows, metrics and row counts are internally consistent. Date bounds use Asia/Colombo midnight; audit event timestamps stay UTC. Server-side pagination, date indexes and ten-second aggregation timeouts bound queries.
- Audit searches escape regex metacharacters. Actor names/roles are current lookup values; stored actor ID and UTC event time remain visible even for missing accounts. Exact action/module filters combine with date/user/text filters.
- The app offers no audit edits or deletion, including for administrators. This is application-level immutability, not cryptographic proof or write-once storage. Raw database operators still have access; production database permissions and archival are separate work. Report/audit reads create no recursively logged viewing events.

## Recovery and deployment preparation (week 10)

- Local archives are AES-256-GCM encrypted and manifests HMAC-authenticated with a private key outside the checkout. Restore authenticates before invoking MongoDB tools and verifies document hashes, counts, collection options and indexes in a fresh randomly named database. Login sessions are excluded. No working-database overwrite option exists.
- Backup consistency requires every writer to be stopped. The CLI checks the configured API port, requires explicit acknowledgement and compares source fingerprints; it cannot detect every independent database client. The optional daily local timer stops/restarts only its named managed dev service and is not enabled automatically. Cloud backups require provider-specific authentication, retention and restore testing.
- Runtime containers are non-root, read-only, capability-dropped and loopback-published; the Docker context excludes private settings/backups. Host HTTPS reverse proxy and authenticated TLS MongoDB are deployment requirements. Development still binds loopback by default; BIND_HOST can explicitly select 0.0.0.0 for containers.
- Initial administrator creation accepts a private stdin payload, requires an empty users collection, serializes competing attempts through a unique installation marker, hashes the password and audits atomically. There is no public bootstrap API, credential logging or production demo seeding.
- A scoped override replaces the vulnerable development-only shell-quote dependency with patched 1.11.0. Production dependency/runtime installation excludes development launchers and Vite. This change does not assert that a clean dependency audit proves the entire system secure.

## Live updates, charts and delivery — 9 October 2026

- Socket handshakes require the exact configured Origin and the existing database-backed session. Each invalidation rechecks session/account state; a five-second heartbeat also revokes idle connections. Membership is server-assigned, inbound application events disconnect the client, and connection counts/payload sizes are bounded. No clinical or contact record is sent over the socket; REST still enforces ownership and role permissions.
- Change streams observe committed mutations. Reconnect refresh and periodic REST reads reconcile state without assuming exactly-once socket delivery. Live updates are a convenience, never booking authority.
- Dashboard aggregation derives patient/doctor scope from the session. Only administrators receive money/department aggregates. Strict query validation rejects supplied identities; one snapshot transaction produces each chart response.
- Delivery jobs commit with their originating notice, with a unique recipient/event/channel key and atomic worker claims. Channels require explicit patient opt-in. The worker rechecks account, preference and destination; a transport change cannot convert an old preview into a live message.
- Live transport configuration requires an explicit recipient allowlist. SMTP requires TLS; Twilio and Notify.lk use authenticated HTTPS to fixed provider endpoints. Notify.lk credentials are sent in the POST body rather than a URL query string. Since 14 October, email includes explicitly selected appointment and billing details; diagnoses, clinical notes and medication instructions remain in the portal. Since 15 October, SMS includes selected operational event details within a fixed length budget; clinical notes and free-text reasons are excluded. Patient email and SMS snapshots are hidden from default queries and administrator delivery history; history masks addresses and omits provider IDs. Credentials remain server-only. Provider exceptions are reduced to generic status codes. See [email content boundaries](email-notifications.md).
- Ambiguous sends and interrupted processing are not automatically retried. Restore with local/off transports until provider reconciliation is complete: restoring an old outbox can otherwise duplicate messages sent after that backup. The user confirmed Gmail receipt and receipt through the Notify.lk app adapter. The later detailed SMS templates were checked locally with mocked providers; a live example of the new format remains to be checked. See [delivery setup and limits](connectivity.md).

## Hospital publication — 9 October 2026

- Only the read-only `/api/public/hospital` route is added before session authentication. It returns an explicit published projection, never draft content, editor identifiers or provider settings. Protected settings routes independently enforce the administrator role, and writes retain the API's exact-Origin check.
- Strict bounded schemas accept plain text and normalised contact details, not HTML, URLs or secrets. React renders literal text; telephone/mail links derive only from validated fields. No arbitrary external fetch or image upload is introduced.
- Drafts and published snapshots are separate within one fixed-ID document. Expected-version checks and MongoDB transactions prevent stale/concurrent edits from silently overwriting data. The mutation and its content-free audit event succeed or roll back together. Public data can be withdrawn without deleting the draft or audit history.
- Published hospital hours are visitor information and confer no scheduling permissions. The settings editor does not auto-refresh in response to sockets. Locale/currency/timezone remain fixed; changes to financial or appointment semantics are not hidden in a configuration toggle.

## Account recovery update

See [account recovery and lifecycle](security-recovery.md) for hashed one-use links, private security-mail preview handling, reset/session race protection, lifecycle locking and login IP retention. The 30-day IP cleanup preserves the rest of each audit event. Local backup/restore now excludes both `sessions` and `passwordresets`.
