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
- Reminder delivery rechecks appointment status/time under the scheduling doctor lock and commits its deduplication marker with the notice. Reschedule revision keys make repeated workers/restarts safe. No unauthenticated scheduling trigger or external email/SMS service is introduced.
- Mark-all is scoped to the caller and a timestamp cutoff. Read flags represent in-app acknowledgement only. Historical messages remain even if an appointment subsequently changes; users follow the link for current state.

## Department guide (week 7)

- Only authenticated patients submit requests. Strict bounded schemas reject forged patient/age fields; age comes from the caller's profile. Symptoms are treated as plain data, never as executable rules or prompts to an external model.
- Fixed rule matching is local. Raw symptom text, comments, duration and pain scores are not persisted or sent to external AI services. Audit entries store actor, outcome and rule version only; booking links contain doctor/department IDs, not medical text.
- Warning-sign responses, high reported pain and uncertainty suppress routine booking suggestions. This does not establish the absence of danger and is not clinically validated triage. No diagnosis/treatment output or fabricated medical probabilities are provided.
- Doctor suggestions and booking deep links exclude inactive accounts/departments. Final booking still applies existing transactional scheduling and ownership checks. Previously generated suggestions cannot bypass deactivation or reserve a slot.
- The MongoDB container's file descriptor limit is explicitly 64,000 to prevent the observed development file-exhaustion crash. This changes only the container limit and preserves its named data volume.
