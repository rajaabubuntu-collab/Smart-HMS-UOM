# Smart HMS gap review — 26 October 2026

## Conclusion

The core outpatient HMS is implemented. The next phase should close specific reliability gaps, validate AI guidance, and bring the final-year evidence up to date. Adding unrelated hospital modules would expand the scope before the current implementation is fully evidenced.

This review used the submitted interim PDF, its appended SRS, the current source, the 100-row requirements matrix, selected runtime settings, service status, public directory counts and fresh automated tests. It is a source and regression review, not a penetration test, clinical evaluation or certification. No production records were edited, no live email/SMS was sent, and no hosted AI requests were made by this review.

## What already exists

- Four roles, JWT sessions in HttpOnly cookies, bcrypt password hashing, server-side role/ownership checks, recovery and account deactivation.
- Patient profiles, doctor/department administration, dated availability, conflict-safe bookings, rescheduling, cancellation and reception check-in.
- Doctor queue, consultation drafts/completion, allergy visibility, medical history and versioned prescriptions.
- Itemised bills, recorded cash/bank-transfer receipts, payment history and audited reversals. These record money received outside the app.
- In-app notifications, Socket.IO updates, charts, feedback, reports/exports and audit review.
- SMTP email and Notify.lk SMS adapters with detailed operational messages. Current development configuration selects both; the user previously reported successful receipt. That does not independently verify every template or handset delivery.
- Groq department guidance, bounded rule fallback, cloud-consent handling, and the public hospital information assistant.
- Public hospital details, directory, enquiries, photographs and English/Sinhala/Tamil UI catalogues.
- Local encrypted database backups, health checks and a prepared production Docker/Caddy configuration.

Evidence is distributed across `server/src`, `client/src`, `server/test`, `tests/e2e` and the module guides in `docs/`. An existing file or passing test does not establish complete requirements coverage.

## Confirmed gaps and next actions

### 1. Uploaded photos are outside the backup/restore package — high priority

Profile images are written to `AVATAR_STORAGE_DIR`, currently `.local/avatars`, while users store the image identifier in MongoDB. Production Compose persists photos in a separate volume. The backup library exports MongoDB to `database.enc` and records database collection fingerprints; it does not archive the image files. Off-site copying likewise copies the database archive and manifest only.

**Impact:** restoring onto a fresh machine can restore the user record while leaving its photo missing. Replacing an image also deletes the old file, so retaining only the current photo directory does not guarantee that an older database backup has matching images.

**Next:** include uploaded images in an authenticated, encrypted backup package; define a consistent database/files snapshot and restore it into isolated destinations. Add a restore check that actually serves the restored photograph.

**Evidence:** `server/src/profile-avatars.js:35`, `server/src/profile-avatars.js:95`, `scripts/ops/backup-lib.mjs:125`, `scripts/ops/offsite-copy.mjs`, `compose.production.yaml:19`.

### 2. Assistant answers lose directory demonstration labels — high priority for the preview

The public directory carries `isDemo`. The assistant preserves demonstration status for hospital information but omits it when selecting and constructing doctor/department facts. The UI already supports an `entry.demo` label, so the missing information is upstream.

**Impact:** a synthetic profile can appear in chat without the label visible on its directory page. This conflicts with the approved scope of publishing labelled demo profiles.

**Next:** carry demonstration status through the assistant fact pipeline and verify both direct answers and follow-ups.

**Evidence:** `server/src/public/assistant.js:61`, `server/src/public/assistant.js:123`, `client/src/components/HospitalAssistant.jsx:150`. A read-only runtime check returned 30 doctor facts and 19 department facts, with zero demo flags on either group.

### 3. Assistant directory coverage stops at 30 doctors — medium priority

The public API currently reports 57 doctors and 19 departments. The assistant sorts and loads only the first 30 of each. It can fall back to directory/contact links for names outside that selection, but cannot directly answer about all published clinicians.

**Next:** retrieve a bounded set of relevant published records for the visitor's question instead of sending only the first alphabetic batch. Preserve publication filters and approved-fact output. Test a clinician beyond the first 30, ambiguous names and unpublished profiles.

**Evidence:** `server/src/public/assistant.js:61`, current read-only `/api/public/doctors` and `/api/public/departments` totals.

### 4. Full regression and repeatable CI need attention — high priority

The backend suite is green. The broader browser suite exposes failures that targeted checks did not catch. A billing test expects the dashboard after sign-in even though the browser is on the preserved bill destination; a hospital-settings test still expects public copy removed during the redesign; a reporting test uses an unscoped link selector that now matches both sidebar and dashboard shortcuts. These observed failures do not by themselves prove broken billing, publication or reports. They prevent claiming that the full browser regression is green and leave later assertions unexecuted.

There is no `.github/workflows` directory in this checkout, so no repository-defined GitHub Actions pipeline was found. External CI configuration was not inspected.

**Next:** diagnose every failure, update stale expectations without weakening the business assertions, fix any application faults, and run the complete suite on a clean synthetic database. Add CI for lint, translation integrity, build, server tests and essential browser flows, with local/mock notification and AI providers.

**Evidence:** `.local/project-gap-api-tests.log`, `.local/project-gap-browser-tests.log`, `tests/e2e/billing.spec.js:4`, `tests/e2e/hospital-settings.spec.js`.

### 5. AI quality evidence is missing — high priority for the final-year evaluation

Provider tests cover schemas, allowed department IDs, timeouts, consent, quota failures and fallback. Those tests establish software behavior, not whether real users' descriptions consistently reach appropriate departments. No reviewed, labelled evaluation dataset and measured end-to-end routing-quality report was found.

**Next:** prepare fictional cases covering ordinary descriptions, spelling mistakes, ambiguous concerns, out-of-scope inputs and urgent referral handling. Have appropriate reviewers agree expected destinations/referrals. Measure correct routing, safe referrals, inappropriate routing, fallback rate and response time; record provider/model/date and repeat runs. Keep unsupported languages and populations explicit. Do not report a clinical accuracy percentage based on mocked-provider tests.

**Evidence:** `server/test/recommendation-groq.test.js`, `server/test/recommendation-ai.test.js`, `server/src/recommendations/routes.js`, `docs/groq-ai.md`, `docs/acceptance-plan.md`.

### 6. Final-report and diagram evidence is behind the implementation — high priority for submission

The implementation report and use-case guide still describe rule-based guidance and/or simulated-only messaging. Traceability refers to local AI and live SMTP/Twilio being pending. Current configuration selects Groq and Notify.lk/SMTP. The verification record still lists 117 backend tests and 935 translation entries, while current runs have 189 backend tests and 1,277 entries per translated catalogue.

The original report requested symptom duration and optional pain level; the user later explicitly simplified that form. It also specified rule-based v1 guidance, whereas hosted AI is now an extension. These are documented scope changes, not automatically missing form fields to re-add.

**Next:** preserve the submitted interim report as historical. Update the implementation addendum, requirement-to-test mapping, current architecture/data-flow and use-case figures, screenshots, user manual and evaluation chapter. Include Groq, the public assistant, Notify.lk, simplified input and the restored UI. Separate implemented behavior, tests actually run and human approval.

**Evidence:** `docs/implementation-report.md:5`, `docs/use-cases.md:3`, `docs/requirements-traceability.csv`, `docs/verification.md:9`; interim SRS AI-001 and AI-005.

### 7. Human acceptance and language review remain unrecorded — high priority before final sign-off

The acceptance plan has pending patient, receptionist, doctor, administrator, language and accessibility reviews. Automated translation checks verify keys/placeholders; they do not judge Sinhala/Tamil wording. Passing browser tests is not evidence of clinician approval or staff usability.

**Next:** run a short, recorded UAT session for each role, using fictional patients. Capture the task, device, expected result, observed result and reviewer feedback. Include billing corrections, recovery, permission boundaries and rejected/uncertain AI inputs. Have fluent readers review both translated interfaces.

**Evidence:** `docs/acceptance-plan.md`, `scripts/verification/translations.mjs`.

### 8. Operations are local; production evidence is incomplete — before external deployment

Current configuration is development mode at `http://localhost:5173`. The app and local backup/health timers are active; the backup service reported success and the timer last triggered on 26 October. No off-site configuration was found. Health checks write status to the journal; they do not alert an operator. Historical production and recovery evidence is dated 13 October and does not cover all subsequent features.

**Next:** agree the target host/domain, off-site storage, archive retention and an alert destination. Test HTTPS, recovery mail, uploaded-image persistence, restart recovery and a fresh off-site restore on the actual deployment. Measure browser load time under the SRS workload; loopback API benchmarks are not proof of the three-second hosted dashboard target.

**Evidence:** `docs/operations.md`, `scripts/ops/health-check.mjs`, `docs/evidence/production-smoke.json`, `docs/evidence/load-result.json`, runtime configuration and systemd status. Do not treat production templates as proof of a live hosted system.

### 9. Integration limits need clear release evidence — medium priority

Notify.lk success is recorded as provider acceptance; the current adapter does not confirm handset delivery. SMTP acceptance likewise is not proof of inbox placement. Only explicitly approved recipients receive live messages. The public assistant's daily quota is an in-memory counter that resets on restart and is not shared across server instances.

**Next:** record approved-recipient delivery checks for booking, rescheduling, cancellation, reminders, billing and recovery, without unnecessary credit use. Keep acceptance distinct from delivery. If deployment needs multiple processes or a restart-resistant budget, use a shared persisted quota counter. Test exhausted quotas and provider downtime.

**Evidence:** `server/src/notifications/transports.js:128`, `server/src/notifications/delivery-worker.js:64`, `server/src/public/assistant.js:165`, `docs/notifylk-setup.md`, `docs/public-assistant.md`.

## Optional product improvements, not missing interim commitments

- Printable prescription/visit summary with hospital details and clear version information. Billing statement printing already exists.
- Missed-appointment/no-show workflow and reporting; add a distinct state rather than treating absence as clinical completion. The original SRS lists only five appointment states.
- Repeating doctor schedules and leave management; dated sessions and closure controls already exist.
- A plain-language public data-handling page explaining contact enquiries, AI processing and account data. This would supplement existing inline disclosures.

Laboratory equipment integration, insurance, pharmacy dispensing hardware, national identity integration, native mobile apps and video consultations are explicitly outside the original report scope. Online card payments and advanced diagnostic machine learning were future extensions. They are not prerequisites for completing this outpatient final-year project.

## Recommended delivery order

1. Close the browser-regression failures and assistant demo-label/coverage gaps.
2. Extend backups to uploaded images and prove restoration.
3. Run the AI evaluation and four-role UAT/language review.
4. Update the final-report evidence and diagrams; add repeatable CI.
5. Validate hosting, off-site recovery and alerts if a public deployment is required.

## Verification for this review

- Server suite: **189 passed, zero failed, zero skipped**; isolated synthetic databases, local/mock providers.
- Browser regression: **53 passed, three failed, three skipped**, 59 total, Chromium on Linux. Failed scenarios: billing payment/reversal flow, hospital draft/publication/conflict flow, and all-ten-reports flow. Their observed stopping points are documented in item 4. The three skipped cases are opt-in local Ollama scenarios; they were not enabled for this offline-provider audit. The two user-requested UI restorations passed their browser checks in this full run.
- Recent restoration checks: lint, build and translation integrity passed; seven targeted browser tests passed before this broader audit. Existing large-bundle build warning remains.
- No fresh hosted-load test, production redeployment, live model evaluation, SMS send, off-site restore or human acceptance was performed.

Machine-readable review evidence: [project-gap-review-2026-10-26.json](evidence/project-gap-review-2026-10-26.json). Detailed transient test logs remain under `.local/`; preserve selected redacted evidence for the final submission after closing the failures.
