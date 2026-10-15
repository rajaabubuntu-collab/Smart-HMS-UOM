# Smart HMS — Care, connected.

## Current completion pass - 13 October 2026

Open **http://localhost:5173**. On this computer the application is managed by `smart-hms-dev.service`; use `systemctl --user restart smart-hms-dev.service` to restart it. Stop that service before starting another manual development server. Daily encrypted local backups and one-minute health checks are enabled while the user manager, project drive and MongoDB are available. See [operations](docs/operations.md).

Added password recovery, audited patient activation/deactivation, department lifecycle editing, an approved public doctor/service directory, doctor queue pagination and daily timeline, full-period CSV/print-PDF report exports and login-IP auditing. English, Sinhala and Tamil are selectable with 935 entries per language catalogue, self-hosted fonts and persistent preferences. Native language review remains pending; clinical free text is preserved and symptom keyword input remains English.

Current evidence and remaining boundaries are in [verification](docs/verification.md). Read the [implementation report draft](docs/implementation-report.md), [user manual](docs/user-manual.md), [100-requirement traceability matrix](docs/requirements-traceability.csv), [rendered use cases](docs/use-cases.md) and [human acceptance checklist](docs/acceptance-plan.md). The original interim PDF remains unchanged. Earlier dated notes below record historical milestones.

**Still pending:** live receipt of the latest detailed SMS format, an approved production host/domain, off-site storage and alert destination, representative human acceptance and clinical/native-language reviews. Local previews, local HTTPS smoke tests and automated browser checks do not establish those results.

University of Moratuwa BIT final-year project. Weeks 1–10 implementation: a MERN application with patient/staff management, doctor schedules, appointment booking, rescheduling, cancellation, receptionist check-in, consultations, prescriptions, medical history, billing, in-app notifications, a rule-based department guide, patient feedback, ten operational reports, an audit viewer, dashboard charts, Socket.IO updates and email/SMS delivery adapters.

## Interim review and interface revision — 7 October 2026

The public entrance at **http://localhost:5173/** now presents patient services, visit guidance and demo hospital information. The homepage, login/register and shared workspace use a new Apple-inspired glass design, with a persistent **Solid surfaces** option and system accessibility fallbacks. The portal remains at `/dashboard`; account access is still required for personal records and bookings. This initial revision used demonstration content. The hospital-settings revision below now supports approved published details.

See the [report gap review and revised delivery plan](docs/interim-review.md) and [revised use-case specification](docs/use-cases.md). The 9 October revision adds Socket.IO, dashboard charts and email/SMS adapters with local previews; see the [connectivity and delivery guide](docs/connectivity.md). Hospital settings and public information were added in the next revision below. At that milestone, live provider validation, password recovery and patient deactivation were pending; see the current completion pass above. Current Colombo time and LKR support does not imply a fully localised or multilingual settings module.

Verified on 8 October 2026: lint, production build, formatting and whitespace checks passed. The 22-scenario browser run passed 21 scenarios; the remaining public recovery scenario exposed a test navigation timing issue. After explicitly waiting for the login form, both public scenarios passed on the targeted rerun, covering all 22 scenarios across these runs. The earlier session-recovery defect was fixed so a failed initial session lookup does not block login/registration. Desktop/mobile screenshots were inspected; 320/390/768px homepage overflow checks, persistent display preference, keyboard skip link and increased-contrast opaque navigation were verified. This is not a complete accessibility or cross-browser certification.

## Connectivity revision — 9 October 2026

Charts now appear on **Overview** for all four roles, with additional LKR receipts and department charts for administrators. The top bar shows **Live updates** when Socket.IO is connected. Patients can opt in under **Email & SMS** and inspect local previews; administrators can monitor history. SMTP, Notify.lk and Twilio adapters are implemented; external sending requires private provider configuration and approved recipients. The user confirmed Gmail receipt on 14 October and a provider-dashboard SMS on 15 October. The user subsequently confirmed receiving an app notification through Notify.lk. New [detailed SMS templates](docs/sms-notifications.md) were tested locally with mocked HTTP, without spending credits; receipt of the new format remains to be checked. See [Notify.lk setup](docs/notifylk-setup.md) and [delivery behaviour](docs/connectivity.md).

Verification: **102/102 server tests and 24/24 browser tests passed**, including both public-session recovery scenarios. Lint, production build, formatting and whitespace checks passed; the production dependency audit reported zero vulnerabilities. Desktop and mobile chart/delivery screenshots were inspected. API health and frontend HTTP responses were checked after restarting the local app. These results do not establish production load or live-provider delivery readiness.

## Hospital settings revision — 9 October 2026

Administrators can open **Hospital settings** (`/admin/settings`) to save drafts, preview, publish or withdraw public hospital information. The local homepage now shows the user-supplied **Smart HMS · Colombo 09**, reception **+94115279429**, **smarthms@gmail.com** and **24/7 opening hours**. Fresh databases retain demonstration mode until details are published. Colombo time and LKR are fixed defaults; English was the only interface language at that milestone. See the [settings guide](docs/hospital-settings.md).

Settings verification completed: **110/110 server tests and 27/27 browser tests passed** in the 9 October regression run. On 13 October, lint, production build, formatting and whitespace checks were rechecked; the local services were restarted and published hospital information was verified again. Mobile settings and public-information layouts were visually inspected.

## Colour and interface refresh — 13 October 2026

The public website, sign-in screens and shared workspace now use an indigo, mint, coral and violet palette. Changes include a brighter glass illustration, tinted service and summary cards, stronger navigation highlights, distinct chart colours, improved secondary text contrast and compact visual markers for appointment counts. Chart values, access rules and hospital information remain data-driven.

Desktop/mobile screenshots were inspected. Dashboard widths of 320, 390, 768 and 1440 pixels were checked for horizontal overflow; solid surfaces, increased-contrast opaque navigation and reduced-motion transitions were checked in Chromium. The original clinical forms and tables retain readable opaque content surfaces. These checks are not a full accessibility certification. Lint, production build, formatting and whitespace checks passed. Browser verification covered all 27 scenarios across two runs: the first was interrupted after 12 passes, and the remaining file set completed with 16 passes, including one repeated publication scenario.

## Start locally

Requirements: **Node.js 24**, npm, Docker with Compose. Ports **5173**, **4000** and **27018** must be free.

```bash
npm ci
npm run setup
npm run db:up
npm run seed
npm run dev
```

Open **http://localhost:5173** (use `localhost`, matching `APP_ORIGIN`). The API runs at http://localhost:4000/api/health. Development requests are proxied through Vite.

`npm run setup` creates a gitignored `.env` with a random JWT signing secret; it never replaces an existing environment file. `npm run seed` creates four **synthetic** development accounts, one per role, plus General Medicine. Their randomly generated passwords are saved to **`.local/dev-credentials.txt`**, excluded from Git. Open that file locally to sign in. Re-running the seed preserves existing accounts and passwords.

The database runs in an isolated Compose project on **127.0.0.1:27018**, separate from any existing MongoDB on port 27017. Its volume persists across restarts. The container has a 64,000-file descriptor limit to avoid MongoDB file exhaustion during repeated development/test runs. A single-node replica set enables atomic multi-document operations. `directConnection=true` supports the local port mapping.

To stop: press Ctrl+C in the development terminal and run `npm run db:stop`. Do not remove the database volume if you want to keep your data.

## What works

- Patient self-registration, validation and duplicate-email protection.
- Login for patients, doctors, receptionists and administrators; role-specific dashboards.
- Expiring JWT in an HTTP-only cookie, database-backed session revocation, logout, protected API routes, request-origin checks and rate limits.
- Patient contact/address/emergency-contact editing, with clinical and identity fields protected from self-editing.
- Administrator department creation, staff directory, doctor/receptionist account creation and hospital counts.
- Doctor schedules with dated sessions, generated slots, overlap checks and protected session closure.
- Patient doctor browsing, available slots, booking confirmation, upcoming appointments and history.
- Receptionist walk-in registration, patient search/intake editing, proxy booking, rescheduling and same-day check-in.
- Administrator staff profile editing and deactivation, with session revocation and open-appointment protection.
- Doctor appointment visibility, patient-reported allergy details for assigned non-cancelled visits, and own schedule view.
- Audit records for authentication, patient/staff changes and all schedule/appointment mutations.
- Doctor waiting queue, consultation drafts, diagnoses, treatment plans, allergy review and completion.
- Patient access to completed records and prescription version history; assigned doctors can revise prescriptions with a reason.
- Automatic consultation bills, itemised service charges, partial cash/bank-transfer payment recording, payment history and printable statements.
- Patient-owned billing access, pending/paid/overdue filters, immutable payment history and administrator correction reversals.
- In-app notification centre with unread counts, read/unread controls and appointment/clinical/billing updates.
- Durable 24-hour appointment reminders checked at startup and every minute while the API runs.
- Patient department guide with keyword explanations, active doctor suggestions, receptionist fallback and booking hand-off.
- Warning-sign and uncertainty responses suppress routine booking suggestions; no diagnosis, treatment or medical confidence score is generated.
- Patient star ratings and optional comments after completed visits, duplicate prevention and an admin feedback inbox with search/rating filters.
- Administrator reports covering appointments, schedules, consultations, registrations, demographics, revenue, billing, doctor workload, department activity and feedback.
- Read-only audit viewer with user/action/module/date filters, literal search, UTC timestamps and pagination.
- Encrypted local backups, isolated verified restoration, recovery rehearsal and optional daily backup timer templates.
- Non-root production container, HTTPS proxy template and one-time initial administrator provisioning.
- Role-scoped appointment charts on all four dashboards, plus administrator net-receipt and department charts with table alternatives.
- Authenticated Socket.IO invalidations with a visible connection indicator and periodic REST fallback.
- Patient email/SMS preferences, transactional delivery queue, local previews, SMTP/Notify.lk/Twilio adapters and masked patient/admin delivery history.
- Administrator hospital settings with private drafts, preview, audited publication/withdrawal, concurrent-edit protection, Sri Lankan reception contacts and explicit 24/7 hours.
- Responsive layouts, form feedback, loading/error states and mobile navigation.

Password recovery, patient account activation/deactivation and full-period CSV/print-PDF report exports are now implemented. Gmail receipt is user-confirmed; Notify.lk app receipt is also user-confirmed; the latest SMS template receipt check and production deployment remain pending. See [week 10 walkthrough](docs/week-10.md).

To try booking: sign in as admin, publish a future session in **Doctor schedules**, then sign in as a patient and use **Book appointment**. Reception can use **Patients & walk-ins** and **Appointments** for registration, proxy booking and check-in. All appointment dates/times use Sri Lanka time.

To try consultations: reception checks in today’s appointment, then the assigned doctor opens **Consultation queue**, starts the visit, reviews allergies and saves a draft or completes it. The patient then sees it in **Medical records**. Completed visits remain accessible to the doctor through **Appointments → Open clinical record**.

To try billing: complete a consultation, then sign in as reception/admin and open **Billing**. Review charges before recording received payments. Patients see their own invoices in **Bills & payments**. Online payment processing is outside this milestone. Older completed visits can be billed manually through **Appointments → Billing → Generate missing bill**.

To try notifications: book or change an appointment, then sign in as its patient and open the **bell** or **Notifications**. Appointments within the next 24 hours receive one reminder per schedule revision. The server checks up to 100 eligible appointments per minute. Email/SMS defaults to local previews without provider credentials. Patients can opt in under **Email & SMS** before creating a new notification; administrators can monitor the delivery history. See the [setup guide](docs/connectivity.md) for provider configuration and delivery-state meanings.

To try the guide: sign in as a patient and open **Department guide**. Use synthetic adult/non-emergency examples such as `cough` to match the seeded General Medicine service. Specialist suggestions require an active matching department and doctor; otherwise the guide directs patients to reception. This is a limited academic prototype, not clinically validated triage.

To try feedback: sign in as a patient and open **My feedback**, or choose **Feedback** on a completed appointment in **History**. Submit a 1–5 star rating and optional comment once per visit. Administrators can open **Patient feedback** to search submissions and filter by rating. Feedback is private to its patient and hospital administrators; it cannot be edited or deleted through the app.

To try reports: sign in as admin and choose **Reports & analytics**. Select a report and date range, then **Generate report**. Each report explains its date basis; totals cover all matching rows, not just the displayed page. **Audit log** searches recorded actions by user, action, module and date. Date filters use Sri Lanka time; audit event timestamps are shown in UTC.

## Verification

Start MongoDB first with `npm run db:up`.

```bash
npm run lint
npm run build
npm test
npm run test:e2e
```

API and browser tests use uniquely named disposable databases on port 27018; they do not reset the development database. Set `MONGODB_TEST_URI` to another replica-set MongoDB connection if needed (the test harness always substitutes its own database name). The URL must be a conventional `mongodb://` URL for the test harness.

Browser tests launch their own API on 4100 and frontend on 5174. They use `/usr/bin/google-chrome` if available; otherwise run `npx playwright install chromium`. An explicit browser path can be set with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Screenshots are saved under `.local/screenshots/` and failures under `test-results/`.

## Structure

```text
client/src/            React pages, shared UI, authentication state and API client
server/src/            Express API, configuration, models, validation and permissions
server/scripts/       Development account seed
server/test/          API integration tests and isolated browser-test server
tests/e2e/            Browser workflow tests
docs/                 API reference, security decisions and requirement traceability
scripts/              Local environment setup
```

## Backup and recovery

Stop the dev server and all other database writers, keep MongoDB running, then use `npm run db:backup -- --writes-stopped`. Restore into a new database with `npm run db:restore -- .local/backups/backup-DIRECTORY`. Sessions and password reset links are excluded. Encryption keys are stored separately under `~/.local/share/smart-hms/backup.key`; protect and back up the key. Run `npm run test:recovery` for a disposable end-to-end rehearsal. See [week 10](docs/week-10.md) for daily timer templates, key handling and recovery limits.

## Build and hosting preparation

`npm run build` creates `client/dist`. In production mode, `npm start` serves both the API and this build from one origin. Set `NODE_ENV=production`, an HTTPS `APP_ORIGIN`, a new JWT secret and a protected replica-set `MONGODB_URI`. Place a trusted HTTPS reverse proxy in front of the loopback API; enable `TRUST_PROXY=true` only if there is exactly one trusted proxy. Production cookies are Secure and SameSite=Strict.

The Compose file is **local development configuration**: no database authentication, loopback-only published port, and a single replica member. A separate production container and configuration templates are now available. See [deployment runbook](docs/deployment.md) for the actual host/database setup, administrator bootstrap, HTTPS and acceptance procedure. Nothing has been publicly deployed. Use synthetic data during development.

## Implementation decisions

- Node 24, React 19, Vite 8, Express 5, Mongoose 9 and MongoDB 7. Exact installed JavaScript versions are captured by `package-lock.json`.
- MongoDB 7 follows the main report's database choice. MongoDB 8.0 was tested locally but refused startup on this machine's Linux 7.0 kernel; no host-level changes were made.
- Session duration defaults to 8 hours (configurable), replacing the SRS's tentative 24-hour default.
- JWT uses an HTTP-only cookie instead of frontend storage/Authorization headers; each token references a revocable database session. Both are intentional implementation refinements to document in the final report.
- Patients can edit contacts, address and emergency contacts only. Receptionists/admins can record identity corrections and patient-reported intake details; doctors explicitly review allergies during consultations.
- LKR consultation fees are stored as integer minor units (100 = LKR 1.00).

See [API reference](docs/api.md), [security design](docs/security.md), [week-one baseline](docs/week-1.md), and [weeks 2–3 requirements and decisions](docs/weeks-2-3.md).

Official implementation references: [Vite getting started](https://vite.dev/guide/), [Express 5 migration](https://expressjs.com/en/guide/migrating-5/), [Mongoose validation and unique indexes](https://mongoosejs.com/docs/validation.html), [MongoDB kernel compatibility tracking](https://jira.mongodb.org/browse/SERVER-121912).
