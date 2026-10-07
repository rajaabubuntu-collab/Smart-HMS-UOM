# Week 8 — patient feedback

Patients can submit a 1–5 star rating and an optional comment (up to 2,000 characters) for their own completed visits. Administrators have a read-only inbox with literal text search, rating filters and pagination. This implements the interim report's feedback requirements; reporting and audit viewing remain the next phase.

## Walkthrough

1. Complete a consultation through the existing receptionist → doctor workflow. The appointment becomes **Completed**. Existing completed appointments are also eligible; payment is not a prerequisite.
2. Sign in as that patient and choose **My feedback**. Alternatively, open **Appointments → History → Feedback** to view one visit.
3. Choose **Leave feedback**, select a star rating and optionally comment on the experience. The form explains who can read it and that submission is final. Avoid medical/contact details; this is not an urgent care channel.
4. Submit. The saved rating, comment and submission time replace the form action, including after reload. Failed requests preserve the draft while the form remains open; drafts are not saved in browser storage.
5. Sign in as an administrator and choose **Patient feedback**. Search by patient name, doctor, department, appointment reference or comment, then combine with a star-rating filter. Clear filters to return to all submissions.
6. Doctors and receptionists cannot open either feedback workspace. Patients cannot view the admin inbox or another patient's feedback.

## Requirement traceability

| Requirement | Implementation                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| FBK-001     | Rating and optional comment for the authenticated patient's completed appointment                                    |
| FBK-002     | Unique appointment index, duplicate error and transaction-safe audit; covers simultaneous requests                   |
| FBK-003     | Admin-only paginated list with literal search across five fields and a rating filter                                 |
| FBK-004     | Appointment, patient and doctor references derived server-side; visit reference/date and names retained as snapshots |

## Decisions and limits

- Appointment status **Completed** is the eligibility boundary. The current workflow sets it on consultation completion and treats it as terminal. Imported/legacy completed appointments are eligible even without a separate consultation document. Scheduled, waiting, in-consultation and cancelled visits are rejected.
- Feedback is one immutable submission per appointment. No edit, delete, reply, moderation status or public doctor-rating endpoint is introduced. Immutability is an implementation choice; the report explicitly requires duplicate prevention but does not specify an edit workflow.
- The comment is optional and plain text. HTML-like text displays literally. Rating must be a numeric integer from 1 to 5; strings and fractional values are rejected by the API.
- The patient identity is not anonymous: the UI discloses administrator access. Snapshots remain as submitted even if staff names or departments later change. Historical visits remain eligible after doctor deactivation.
- Search is a bounded literal case-insensitive substring, not regular-expression input. Results sort newest submission first with a stable ID tie-breaker. Lists use page/limit pagination; concurrent new submissions can shift later pages.
- Submission and its content-free audit event share a transaction. The database's unique appointment index enforces uniqueness across concurrent requests and API instances. A duplicate produces 409 and cannot overwrite the original rating/comment.
- List responses exclude appointment reasons, clinical notes, diagnoses, contacts and credentials. Free-text comments can still contain details a patient chooses to enter; they are restricted to the patient and administrators and never copied into audit entries.
- This milestone does not add external notifications, sentiment scoring, aggregated feedback reports or clinical assessments.

## Verification

Validated on 6 October 2026: all 77 API tests and 17 browser tests passed, together with lint, production build and formatting checks. Desktop and 390px mobile feedback screenshots were visually reviewed.

Eight new API tests cover ownership, eligible states, strict validation, roles/authentication/origin checks, safe response fields, literal combined filters, stable pagination, sequential/concurrent duplicate submissions, historical inactive doctors and immutable records.

Two browser tests cover appointment-to-feedback navigation, mobile star selection, preserving a draft during a simulated failed request, successful submission/reload, literal HTML-like comments, administrator filtering, empty states and protected pages. They use the existing synthetic completed billing visit in a disposable database, without modifying development patient records.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` and `npm run format:check`. Browser screenshots are under `.local/screenshots/feedback-form-mobile.png`, `feedback-patient-mobile.png` and `feedback-admin-desktop.png`.

Operational reports and audit viewing are now implemented in [week 9](week-9.md).
