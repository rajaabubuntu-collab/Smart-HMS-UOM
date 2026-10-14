# Verification record - 13 October 2026

All application tests used synthetic records and isolated databases. The development database was not reset. These are automated local results, not human acceptance, clinical validation or production operation.

## Completed checks

| Check                                      | Result                                                                                | Evidence                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------- |
| Server integration suite                   | 117/117 passed                                                                        | `.local/final-api.log`                  |
| Final recovery timing/replay/session tests | 3/3 passed after restoring the common response-delay floor                            | `.local/final-recovery-tests.log`       |
| Chrome browser regression                  | All 31 unique scenarios covered by passing completed/targeted runs                    | Files and corrections below             |
| Firefox public/new-feature scenarios       | 6/6 passed                                                                            | `.local/firefox-e2e.log`                |
| Linux WebKit public/new-feature scenarios  | 6/6 passed                                                                            | `.local/webkit-e2e-final.log`           |
| Sinhala and Tamil catalogue integrity      | 935 entries each; keys, nonempty values and placeholders match                        | `npm run test:translations`             |
| Automated accessibility                    | No violations in the configured WCAG A/AA scans on five routes, in each tested engine | `tests/e2e/completion.spec.js`          |
| Encrypted backup/recovery rehearsal        | 11/11 checks passed                                                                   | `docs/evidence/recovery-rehearsal.json` |
| Local production container/HTTPS smoke     | 8/8 checks passed                                                                     | `docs/evidence/production-smoke.json`   |
| Load benchmark                             | 300/300 HTTP 200; 100 pre-established sessions                                        | `docs/evidence/load-result.json`        |

The 117-test complete server run preceded a final fix restoring the 300 ms forgot-password response floor. The affected recovery file was then rerun with assertions for both known and unknown accounts. This floor reduces fast lookup differences; it does not guarantee constant-time behaviour under database load.

## Browser coverage and corrections

The initial core regression ran 11 cases: eight passed and three booking scenarios failed because the new English locale used uppercase AM/PM instead of the existing displayed `am`/`pm` labels. The English time formatter now preserves the existing display. The complete appointment file then passed 5/5; the six workflow/clinical cases had passed in the core run. The unique passing scenarios across all batches total 31, rather than claiming that the first run was entirely green.

| File group                                                             | Passing coverage | Local log                                    |
| ---------------------------------------------------------------------- | ---------------- | -------------------------------------------- |
| workflows + clinical                                                   | 6                | `.local/final-e2e-core.log`                  |
| appointments (corrected rerun)                                         | 5                | `.local/final-appointments-rerun.log`        |
| billing + reporting + feedback + recommendations                       | 8                | `.local/final-e2e-business.log`              |
| notifications + connectivity + hospital-settings + public + completion | 12               | `.local/final-e2e-public-communications.log` |

The initial new-feature run also found low pagination contrast and a recovery test locator that ignored the required-field marker. The interface contrast was corrected and the locator changed to match the accessible textbox role. All four new-feature cases passed on the rerun. Firefox and WebKit then passed those four plus the two public scenarios. A final targeted password-recovery browser run passed 1/1 after the delay-floor fix; its log is `.local/final-recovery-browser.log`.

Browser checks include translated form values, persisted language selection, mobile overflow, recovery token removal from the address bar, private-preview redemption, explicit public-profile publication, CSV/complete print reports and Axe checks. Existing workflows also exercise role isolation, bills/payments, clinical revisions, realtime invalidation, delivery previews and draft/public hospital settings.

Linux WebKit is an engine check, not a test on actual Safari hardware. Firefox/WebKit did not run all 31 workflows. Safari on iOS/macOS, Edge, assistive-technology usability, keyboard review of every screen and native language validation remain human/device acceptance work. The local WebKit runtime used an extracted private dependency directory because system libraries were unavailable; no privileged system package installation was performed.

## Performance interpretation

| Synthetic API workload       | Concurrency | Requests | p50    | p95    | Maximum |
| ---------------------------- | ----------- | -------- | ------ | ------ | ------- |
| Role-scoped dashboard reads  | 50          | 100      | 106 ms | 440 ms | 452 ms  |
| Appointment-list reads       | 100         | 100      | 174 ms | 263 ms | 267 ms  |
| Transactional profile writes | 50          | 100      | 143 ms | 178 ms | 200 ms  |

Measurements used loopback HTTP, a disposable synthetic database and 100 pre-established JWT sessions. The shared-IP rate limiter was disabled for the generator; its normal behaviour is tested separately. Login, internet latency and browser rendering are excluded. This supplies bounded local evidence for API response/session targets; it does not verify the SRS dashboard rendering target over broadband, sustained load, every write path or production sizing.

## Reproduction

Use Node.js 24, `npm ci`, the lockfile and a MongoDB replica set. `npm run db:up` starts the local test MongoDB on port 27018. API/browser tests select random test database names. Browser tests start isolated services on 4100/5174; run browser batches sequentially so these ports do not conflict.

```bash
npm run lint
npm run format:check
npm run build
npm test
npm run test:translations
npm run test:e2e
E2E_BROWSER=firefox npm run test:e2e -- tests/e2e/public.spec.js tests/e2e/completion.spec.js
E2E_BROWSER=webkit npm run test:e2e -- tests/e2e/public.spec.js tests/e2e/completion.spec.js
npm run test:load
npm run test:recovery
npm run test:production
```

Install the requested Playwright browser and its documented operating-system dependencies before cross-engine runs. `PLAYWRIGHT_WEBKIT_EXECUTABLE_PATH` supports the local private wrapper. Reproduction on another computer can use a standard Playwright installation instead.

Local stdout logs are intentionally ignored by Git. Structured, non-sensitive load/recovery/production evidence is retained in `docs/evidence/`; test sources and dependency versions are retained in the repository. Vite can log websocket `EPIPE`/`ECONNRESET` when a browser closes or signs out; the reported pass counts come from completed assertions and runner summaries.

## Build, document and local-service checks

Lint, production build and formatting checks pass. Vite reports a main-bundle size advisory (approximately 714 kB minified / 192 kB gzip, including bundled language catalogues); this does not fail the build and should inform hosted performance measurement. The chart library is already loaded in a separate chunk. Git whitespace checks pass.

The report draft (five pages), user manual (three pages) and use-case diagram pack (four pages) were rendered and visually inspected. Their Markdown and DOT sources remain editable. The app and database health check returned success, the frontend returned HTTP 200, and the local backup/health user units reported successful runs. These checks establish availability on this computer at verification time only.

## Remaining acceptance

Actual SMS receipt, a hosted HTTPS domain, off-site copy/restore, external alert delivery, long-running uptime, representative human tasks and clinician/native-language approval are pending. The user confirmed receiving a Gmail notification on 14 October; live rendering of the subsequent detailed templates remains to be checked. No participants or clinical accuracy values have been invented. Use [acceptance-plan.md](acceptance-plan.md) to record those results when performed.

## Follow-up runtime verification - 14 October 2026

The initial check found MongoDB stopped after reboot and the API unavailable even though the Vite frontend and parent service were active. The development unit now starts/waits for the Compose database before launching either process, with a 300-second startup timeout; MongoDB has an `unless-stopped` restart policy. The existing database volume was retained.

The updated systemd unit and Compose configuration validated. Starting the unit restored database health and API readiness. Fetching the public hospital endpoint through the frontend proxy returned the previously published Smart HMS contact details and all-day hours. A new encrypted local backup completed and the app resumed; the one-minute health job returned success. These were runtime/configuration changes; the 13 October application regression results above remain the recorded code-level evidence.

## Detailed email verification - 14 October 2026

The [email content update](email-notifications.md) passed **125 server tests** and **3 targeted Chromium browser scenarios**. These cover real booking, rescheduling, cancellation, reminder, consultation, prescription and billing event wiring; immutable content snapshots; exact LKR values; excluded clinical/free-text fields; patient ownership; administrator projections; mocked multipart SMTP; and the existing transaction, retry and security-recovery paths. Browser checks verify subjects and previews, SMS isolation, live notification delivery, and an appointment link returning to its selected booking after sign-in.

Fourteen synthetic HTML/plain-text examples were generated without reading credentials or sending mail. All fourteen fit desktop (960px), mobile (390px) and narrow mobile (320px) browser viewports. Appointment confirmation, rescheduling, payment and reset screenshots were visually inspected. This does not establish equivalent rendering in all email clients. No live message was sent during this template update; the earlier Gmail receipt is user-confirmed evidence only.

Lint, production build, translation placeholder/coverage checks and Git whitespace checks passed. The pre-existing bundle-size advisory remains. The development service is active, API/database health returned `ok`, and the frontend returned HTTP 200. The original 13 October PDF documentation pack predates this email update; current details are in the Markdown documentation and generated email examples.
