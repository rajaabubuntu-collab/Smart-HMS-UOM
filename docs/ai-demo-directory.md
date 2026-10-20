# AI guide design and demo directory

The recommendation page uses the shared Smart HMS theme: emergency strip, simplified symptom form, explanation cards, clinician cards and appointment-time links. Duration and pain-score fields are no longer shown. The existing app navigation, authentication, language selector and emergency/scope gates remain functional.

Only real application state is displayed. Directory counts come from active records; appointment previews come from active future sessions with unreserved slots. Doctor profile details expand inline. Clicking a preview opens that doctor's booking page on the correct Colombo calendar date; it does not reserve a slot. The normal booking transaction checks availability again. The reference's example confidence percentage, triage level, waiting time, certifications, insurance coverage, laboratory advice, patient history and compliance claims were not evidence about this project and are not shown.

## Seeded local data

Run from the project root:

```bash
npm run seed:ai-demo
```

This command is restricted to `NODE_ENV=development`. It creates up to **20 departments and 60 fictional doctor profiles**, three per department, using Sri Lankan-style names and sample fees of **LKR 2,500–5,000**. Each new profile is marked `isDemo`, has `(Demo)` in its name, has a reserved `.invalid` email and has email/SMS delivery preferences disabled. New departments/profiles are not published on the public website. These people, qualifications and fees are not representations of real healthcare providers.

The seed reuses matching existing departments without overwriting their details or publication state. It preserves existing passwords, edited fees, inactive accounts/departments, closed sessions and appointments. It does not delete data or create patient visits, invoices or notifications. A reserved email collision with an unmarked account aborts before seeding. Repeat runs add missing sessions rather than duplicating them.

Each demo doctor gets a two-hour session with 15-minute slots on each of the next seven days, using Asia/Colombo time. Three daily session patterns are 09:00–11:00, 12:00–14:00 and 15:00–17:00. A fresh complete seed therefore adds **420 sessions / 3,360 appointment slots**, beginning tomorrow. Rerun later to replenish the next seven days.

Doctor login credentials are written only for newly created users to `.local/ai-demo-credentials.txt`, with file permissions `0600`. The file is gitignored. Use these only for local testing; ordinary patient testing does not require signing in as a doctor.

## Testing the expanded AI

Sign in as a patient and open **Department guide**. The **Try a demo scenario** selector appears when active demo profiles exist. Selecting a department copies a synthetic description into the form. The patient must still answer the warning-sign question and acknowledge the limitations, plus consent to cloud processing when Groq is enabled. No request is automatically submitted.

| Department                     | Synthetic test description                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| General Medicine               | I have been coughing for two days                                                             |
| Dermatology                    | My skin feels itchy and has small red patches                                                 |
| ENT                            | My ear feels blocked                                                                          |
| Ophthalmology                  | My eyes feel dry after working at a screen                                                    |
| Orthopaedics                   | My knee aches when walking                                                                    |
| Cardiology                     | I would like a routine follow-up for my heart condition                                       |
| Neurology                      | I need a routine follow-up for my migraine                                                    |
| Gastroenterology               | I need a follow-up for recurring indigestion                                                  |
| Endocrinology                  | I would like a routine review for diabetes                                                    |
| Respiratory Medicine           | I want a routine asthma review                                                                |
| Nephrology                     | I need a routine follow-up for chronic kidney disease                                         |
| Urology                        | I want a routine follow-up for a prostate condition                                           |
| Rheumatology                   | I would like a review for rheumatoid arthritis                                                |
| Dental Care                    | I would like a routine dental check-up                                                        |
| General Surgery                | I need a routine review of a healed surgical wound                                            |
| Psychiatry                     | I would like support with ongoing anxiety                                                     |
| Physiotherapy & Rehabilitation | I need help with rehabilitation after a healed ankle injury                                   |
| Clinical Nutrition             | I would like help planning a balanced diet                                                    |
| Paediatrics                    | Directory/booking testing only; child guidance remains staff-assisted                         |
| Obstetrics & Gynaecology       | Directory/booking testing only; pregnancy/reproductive-health guidance remains staff-assisted |

These are demonstration prompts, not a medical test set or assurances of appropriate routing. The AI directory is now 18 supported adult service groups, defined separately from the five original fallback keyword groups. An offline model can therefore fall back for `cough` but does not gain keyword matching for every specialty. Unsupported, unclear and potentially urgent concerns continue to go to staff/emergency information.

Service names are consistent with the range of Sri Lankan hospital specialties, for example [Asiri Kandy's service overview](https://asirihealth.com/kandy-home) and [Lanka Hospitals' services](https://www.lankahospitals.lk/). These sources are vocabulary/context references only; they do not validate our prototype routing scopes, examples, fictional staff or clinical accuracy. No real doctor names, photographs or qualifications were copied from those hospitals.

## Verification

Verified on 18 October 2026: all 161 backend tests passed, followed by 21 recommendation tests after the short-ID model-request optimization and six adapter tests after tightening invalid-output fixtures. Lint, translation-key parity (1,176 entries per language) and the production build passed. The build retains its existing large-bundle advisory.

The opt-in full-directory browser test passed against the actual local Qwen model: a synthetic diabetes follow-up selected Endocrinology, showed three demo doctors and available slots, and opened the correct booking date. Desktop and mobile screenshots were inspected. Repeating the seed against the local development database created zero duplicates and skipped all 420 existing sessions. This checks integration and demonstration behaviour, not clinical accuracy across the 18 specialties.

The standard browser regression run passed the safety/mobile and AI-label/fallback cases. Its booking case initially timed out during patient sign-in while other checks were running; an isolated rerun passed the complete booking flow in 5.2 seconds. The two real-model tests are opt-in and skipped in the standard run; the expanded-directory test was run separately as described below.

`server/test/demo-directory.test.js` verifies development-only seeding, 20/18 catalog boundaries, fictional/private records, repeatability, preservation of edits and closed sessions, and slot previews that exclude bookings and inactive schedules. The recommendation adapter translates short request-local model IDs back to allowlisted database IDs; schema and evidence validation remain server-side.

Run the browser test with a disposable seeded database and the real local model:

```bash
E2E_AI_DEMO=true E2E_LOCAL_AI=true EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npx playwright test tests/e2e/recommendations.spec.js --grep 'demo directory'
```

The test covers the full directory, a specialty outside the original five rules, quoted evidence, three demo doctors, profile details, real upcoming times, correct booking-date hand-off, clear/reset behaviour and mobile layout. It does not book an appointment or send a live email/SMS. Screenshots are saved under `.local/screenshots/ai-guide-*`.

All symptom examples remain English. Sinhala/Tamil interface translations are included but still need human linguistic review. Clinical review and a held-out evaluation set remain necessary before any use with real patients; see [local AI limitations](local-ai.md).
