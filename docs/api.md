# Smart HMS API (weeks 1–7)

Base path: `/api`. JSON request/response bodies. Authenticated requests use the HTTP-only `hms_session` cookie. No bearer tokens are exposed to frontend JavaScript.

Every POST/PATCH/DELETE must include an `Origin` exactly matching `APP_ORIGIN` (including development scripts and Postman). Browsers set this automatically. Browser calls use the same-origin Vite proxy locally. Responses containing application data use `Cache-Control: no-store`.

| Method | Endpoint                             | Permission   | Behaviour                                                |
| ------ | ------------------------------------ | ------------ | -------------------------------------------------------- |
| GET    | `/health`                            | Public       | 200 if MongoDB is connected, otherwise 503               |
| POST   | `/auth/register`                     | Public       | Creates patient + profile + session; 201                 |
| POST   | `/auth/login`                        | Public       | Authenticates any of the four roles; sets session cookie |
| GET    | `/auth/me`                           | Signed in    | Returns safe current-user fields                         |
| POST   | `/auth/logout`                       | Signed in    | Deletes current session, clears cookie; 204              |
| GET    | `/patients/me`                       | Patient      | Own profile and account only                             |
| PATCH  | `/patients/me`                       | Patient      | Updates own contact details atomically                   |
| GET    | `/doctors/me`                        | Doctor       | Own doctor profile and department                        |
| GET    | `/reception/overview`                | Receptionist | Registered patient count; no clinical records            |
| GET    | `/admin/overview`                    | Admin        | Patient/doctor/receptionist/department counts            |
| GET    | `/admin/departments?page=1&limit=10` | Admin        | Paginated departments                                    |
| POST   | `/admin/departments`                 | Admin        | Creates department; 201                                  |
| GET    | `/admin/staff?page=1&limit=10`       | Admin        | Paginated doctors/receptionists with doctor profiles     |
| POST   | `/admin/staff`                       | Admin        | Creates doctor or receptionist; 201                      |

Pagination: `page` 1–10000, `limit` 1–50. Lists return `{ items, total, page, limit }`.

## Registration

```json
{
  "name": "Sample Patient",
  "email": "sample@example.com",
  "password": "Use-a-long-unique-password",
  "phone": "+94 77 123 4567",
  "dateOfBirth": "2000-06-15",
  "gender": "prefer-not-to-say"
}
```

Email is trimmed/lowercased and database-unique. Passwords must contain at least 10 characters and at most 72 UTF-8 bytes (bcrypt limit). Gender values: `female`, `male`, `other`, `prefer-not-to-say`. Birth date must be a real date between 1900 and today. Phone is optional at registration. Role cannot be supplied; all self-registrations become patients.

Login accepts only `{ "email": "...", "password": "..." }`. Login/register return `{ user: { id, name, email, phone, role, isActive } }` and a Set-Cookie header. Password hashes never appear in responses.

## Profile update

```json
{
  "phone": "+94 77 123 4567",
  "address": "Synthetic address",
  "emergencyContact": {
    "name": "Sample Contact",
    "phone": "0771111111",
    "relationship": "Parent"
  }
}
```

All keys above are required; empty strings are allowed. Extra fields (including role, user ID, allergy records and identity fields) are rejected. Target identity comes from the session, never the body.

## Department and staff creation

Department body: `{ "name": "General Medicine", "description": "General outpatient care" }`. Names are case-insensitively unique; repeated internal spaces are normalised for uniqueness.

Receptionist: `name`, `email`, `password`, optional `phone`, `role: "receptionist"`.

Doctor: same fields with `role: "doctor"`, plus `department` (existing active department ID), `specialization`, optional `qualification`, `consultationFeeMinor` (integer 0–100000000). For example, LKR 2500.50 is `250050`. No public API creates administrators; development seed bootstraps one locally.

## Errors

Errors use `{ "message": "...", "fields": { "email": "..." } }`; `fields` appears on input-validation failures. Nested field names use dot notation, e.g. `emergencyContact.phone`.

- 400: malformed/invalid data
- 401: missing, expired, revoked or invalid session; invalid credentials
- 403: disallowed role or request origin
- 404: unavailable route/profile
- 409: duplicate account/department
- 413: body exceeds 20 KB
- 429: rate limit; observe Retry-After
- 500: generic server error, without internal details

Authentication limits: 20 login/registration requests per IP per 15 minutes; all API routes additionally share 150 requests/minute/IP. Limits use process memory in this single-server prototype. A distributed deployment needs a shared limiter store.

## Scheduling and appointment endpoints

All endpoints below require authentication. List pagination uses the existing `page`/`limit` contract (maximum 50). IDs are MongoDB ObjectId strings. Dates are real `YYYY-MM-DD` calendar dates in **Asia/Colombo**, times are `HH:mm` in the same timezone, and response timestamps are UTC ISO strings.

| Method | Endpoint                                              | Permission                 | Behaviour                                                                         |
| ------ | ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/directory/departments`                              | All roles                  | Active departments, paginated                                                     |
| GET    | `/directory/doctors`                                  | All roles                  | Active doctors; optional `department`, `search`                                   |
| GET    | `/directory/doctors/:id/availability?date=YYYY-MM-DD` | All roles                  | Available future slots only; no other patients' data                              |
| GET    | `/schedules`                                          | Admin/Doctor               | Optional `doctor`, `date`; doctor limited to own; without date, upcoming sessions |
| POST   | `/schedules`                                          | Admin                      | Publish dated session and slots                                                   |
| POST   | `/schedules/:id/close`                                | Admin                      | Close session without deleting history; reject open appointments                  |
| POST   | `/appointments`                                       | Patient/Receptionist/Admin | Reserve slot atomically                                                           |
| GET    | `/appointments`                                       | All roles, scoped          | Optional `date`, `doctor`, `patient`, `status`, `view`                            |
| GET    | `/appointments/:id`                                   | Same scope                 | Details and change history; unrelated users receive 404                           |
| POST   | `/appointments/:id/cancel`                            | Patient/Receptionist/Admin | Role/state-dependent cancellation, releasing slot                                 |
| POST   | `/appointments/:id/reschedule`                        | Receptionist/Admin         | Atomically move Scheduled visit to a new free slot                                |
| POST   | `/appointments/:id/check-in`                          | Receptionist/Admin         | Same-day Scheduled → Waiting; empty body                                          |
| GET    | `/appointments-summary`                               | All roles, scoped          | Today's count, waiting today, future open count, next three visits                |
| GET    | `/reception/patients?search=...`                      | Receptionist/Admin         | Search name/email/phone; 2–100 characters; paginated                              |
| GET    | `/reception/patients/:id`                             | Receptionist/Admin         | Patient intake details                                                            |
| POST   | `/reception/patients`                                 | Receptionist/Admin         | Walk-in registration without changing staff session                               |
| PATCH  | `/reception/patients/:id`                             | Receptionist/Admin         | Update patient-reported intake/identity/contact data                              |
| PATCH  | `/admin/staff/:id`                                    | Admin                      | Edit staff details/active state; no role/email change                             |

`view` is `upcoming`, `history`, or `all` (default). The appointment schema supports `Scheduled`, `Waiting`, `In Consultation`, `Completed`, `Cancelled`; week 4 adds In Consultation and Completed through the clinical endpoints. Patient/doctor scoping cannot be overridden using query parameters. See [state rules](weeks-2-3.md).

Publish a session:

```json
{
  "doctor": "existing-doctor-profile-id",
  "date": "2026-11-10",
  "startTime": "09:00",
  "endTime": "12:00",
  "slotMinutes": 15
}
```

The date must be within the next 180 days, with a future start. Durations are 5–120 integer minutes; the interval must divide evenly and be no longer than 12 hours. Sessions cannot overlap another open session for that doctor. Actual IDs must be valid ObjectIds; placeholder strings above are illustrative only.

Book: `{ "slot": "slot-id", "reason": "Optional reason for visit" }`. Receptionist/admin must additionally pass `patient` (Patient profile ID). Patients must omit it: identity comes from the session. `reason` is optional, at most 500 characters. Response: `{ appointment: { id, reference, patient, doctor, doctorName, departmentName, startsAt, endsAt, consultationFeeMinor, reason, status, history, ... } }`.

Cancel or close a session: `{ "reason": "Required explanation" }` (1–300 characters). Reschedule: `{ "slot": "new-slot-id", "reason": "Required explanation" }`. Check-in: `{}`. Conflicts return 409 and leave prior state intact. Mutation routes do not accept arbitrary status assignments.

Walk-in registration accepts registration fields plus optional `bloodType`, `allergies` (up to 20 strings, 100 characters each), `address` and `emergencyContact`. No session cookie is returned. Intake updates require `name`, `phone`, `dateOfBirth`, `gender`, and accept the same optional intake fields; `email`, `password`, `role` and `user` are forbidden. Optional intake fields default to empty, so submit the full intake form when updating.

Staff update requires `name`, `phone`, `isActive` (boolean). Doctors additionally accept optional `department`, `specialization`, `qualification`, `consultationFeeMinor`; these fields are forbidden for receptionists. Only doctor/receptionist accounts can be targeted. Deactivation is blocked while a doctor has Scheduled, Waiting or In Consultation appointments (including unresolved past visits). Successful deactivation deletes their sessions and hides them from the booking directory.

## Week 4: clinical records

All endpoints require authentication. Mutation bodies are strict; unknown properties are rejected. IDs are validated. Hospital dates use Asia/Colombo.

| Method | Path                                                    | Role            | Behavior                                                                                                                                       |
| ------ | ------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/clinical/queue`                                   | Doctor          | Own waiting/in-consultation queue in check-in order, including unfinished older visits; today's total, completed, pending and cancelled counts |
| GET    | `/api/clinical/appointments/:id`                        | Assigned doctor | Non-cancelled appointment, patient profile and current consultation draft/completed record                                                     |
| GET    | `/api/clinical/history?page=1&limit=10`                 | Patient         | Own completed records, latest prescription and all prescription versions                                                                       |
| GET    | `/api/clinical/history?appointment=:id&page=1&limit=10` | Assigned doctor | Completed history for the patient linked to the doctor's non-cancelled appointment                                                             |
| POST   | `/api/clinical/appointments/:id/start`                  | Assigned doctor | Empty body `{}`; Waiting → In Consultation and creates draft; 201                                                                              |
| POST   | `/api/clinical/appointments/:id/save`                   | Assigned doctor | Saves draft with revision check; 200                                                                                                           |
| POST   | `/api/clinical/appointments/:id/complete`               | Assigned doctor | Validates record, publishes it to patient and marks appointment Completed atomically; 200                                                      |
| POST   | `/api/clinical/appointments/:id/prescription`           | Assigned doctor | Revises completed prescription and appends a version with reason; 200                                                                          |

Save/complete body:

```json
{
  "revision": 0,
  "notes": "Clinician-authored visit notes",
  "diagnosis": "Clinician-authored diagnosis",
  "treatment": "Clinician-authored treatment plan",
  "currentMedications": "Medication history reported at this visit",
  "medications": [],
  "noMedicationReason": "Clinician's reason for not prescribing medication",
  "allergiesReviewed": true,
  "reviewedAllergies": []
}
```

Every medication requires nonempty `name` (max 120), `dosage`, `frequency`, `duration` (max 100 each). Maximum 20 medications. Notes max 5000, diagnosis 1000, treatment/currentMedications 2000, noMedicationReason 500 characters. Completion requires notes, diagnosis, and either medications or a no-medication reason (not both). Drafts may have empty notes/diagnosis or no decision yet. Every write requires explicit allergy review and an exact current allergy-list match; an empty list means unrecorded, not confirmed absent.

Prescription revision accepts only `revision`, `reason` (required, max 500), `medications`, `noMedicationReason`, `allergiesReviewed` and `reviewedAllergies`. Original notes cannot be modified after completion. Mutations return `{ revision, message }` (start returns message only). Conflict/stale revision/allergy review/invalid state return 409; validation errors 400; wrong role 403; missing or unassigned appointment 404.

Only one active consultation per doctor and per patient is permitted. Patients cannot view drafts or select another patient's history. Receptionists/admins cannot access clinical endpoints. Read and mutation events are audited without copying clinical content into audit logs.

## Week 5: billing and payment records

Doctors are denied access to `/api/billing/*`. Patients can read their own bills/payments only; reception/admin can read all bills. No route accepts a client-supplied patient/doctor or total/paid/status value.

| Method | Endpoint                                                     | Permission                        | Behavior                                                                                                          |
| ------ | ------------------------------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GET    | `/billing/bills?page=1&limit=10&status=Pending&search=HMS-…` | Patient / reception / admin       | Paginated scoped list; optional Pending/Paid/Overdue filter and literal reference/appointment/patient-name search |
| GET    | `/billing/bills/:id`                                         | Patient owner / reception / admin | `{bill, payments}` including charge revisions and chronological receipt/reversal history                          |
| POST   | `/billing/bills`                                             | Reception / admin                 | Generate missing bill for a completed appointment; 201 or 409 if already billed                                   |
| PATCH  | `/billing/bills/:id`                                         | Reception / admin                 | Replace extra charges/due date before any payment history exists; preserve original fee and version history       |
| POST   | `/billing/bills/:id/payments`                                | Reception / admin                 | Record received payment; 201 for new receipt, 200 for matching retry                                              |
| POST   | `/billing/bills/:id/payments/:paymentId/reverse`             | Admin                             | Correct a payment entry once, preserving its history and restoring the balance                                    |

Manual generation: `{appointment, additionalItems: [], dueDate: "2026-10-03", reason}`. Unpaid edit: `{revision, additionalItems: [], dueDate, reason}`. Each additional item is `{description, quantity, unitPriceMinor}`; quantity 1–100, price integer 0–100000000, max 19 items. Description max 160 and reason max 500 characters. The original consultation fee is always line 1. Date must be a real YYYY-MM-DD date between 1900 and 2199.

Payment: `{revision, requestKey: "UUID", amountMinor, method: "Cash", externalReference: ""}`. Method is Cash or Bank transfer; transfer reference is required for Bank transfer (max 100 chars). Amount must be a positive integer and cannot exceed the outstanding balance. Repeating the same key on the same bill with identical actor, amount, method and reference returns the same receipt without another write. A different payload under the same key returns 409. Retrying a reversed receipt does not reinstate it.

Reversal: `{revision, reason}`. Reversed entries remain in payment history with `reversedAt`, `reversedBy`, and `reversalReason`. No refund or bank transfer occurs. Bills with any payment history remain locked for editing, including after reversal.

Bill responses include `items`, `totalMinor`, `paidMinor`, `balanceMinor`, `currency: "LKR"`, `dueDate`, `revision`, and derived `status`. Lists omit charge version history; detail includes it. Payment details omit internal request keys. `Paid` means balance zero; otherwise due date before today's Asia/Colombo date means `Overdue`, else `Pending`. Partial bills remain Pending/Overdue with a positive paid amount. No status write endpoint exists.

Completion automatically creates a unique bill in the existing consultation transaction. Automatic due date is the completion date. Payment/bill edits use expected revisions and transactions. Stale revisions, duplicate invoices, already-reversed payments, forbidden state changes and overpayments return 409; validation returns 400; wrong role 403; absent/unowned record 404.

## Week 6: notifications

All authenticated roles can access their own inbox. There is no administrator bypass or client notification-creation endpoint. Workflow events currently target the affected patient; staff inboxes can be empty.

| Method | Endpoint                                    | Behavior                                                                                                                |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| GET    | `/notifications?page=1&limit=10&filter=all` | Own newest-first notifications; filter `all` or `unread`; limit max 50                                                  |
| GET    | `/notifications/unread-count`               | `{unreadCount}` for the authenticated user                                                                              |
| PATCH  | `/notifications/:id`                        | Body `{read: true}` or `{read: false}`; persists read/unread state; unowned or absent ID returns 404                    |
| POST   | `/notifications/read-all`                   | Body `{through: "ISO UTC timestamp"}` from the list's `asOf`; marks own unread entries created at/before that timestamp |

List response: `{records, total, page, limit, asOf, unreadCount}`. Each record exposes `_id`, `type` (appointment/reminder/clinical/billing), `title`, `message`, `path`, `readAt` (null when unread) and `createdAt`. Internal recipient/event-key fields are omitted. Unknown query/body fields and invalid IDs return 400; missing authentication returns 401. Mutating requests retain the app's trusted-Origin requirement.

Notifications are generated transactionally for booking, cancellation, rescheduling, check-in, consultation start/completion, prescription revision, bill generation/revision, received payment and payment reversal. There is no notification for a clinical draft save. Link destinations are server-generated relative routes, with destination authorization enforced separately.

Appointment reminders have no HTTP trigger. The API process runs a bounded check on startup and every 60 seconds. Scheduled appointments with `now < startsAt <= now + 24h` and an undelivered `scheduleRevision` receive one in-app reminder. The notification and `remindedRevision` marker commit together under the existing doctor lock. Rescheduling increments `scheduleRevision`; old reminders remain historical. See [delivery decisions](week-6.md) for restart, batching and downtime semantics.

## Week 7: department guide

`POST /api/recommendations` is patient-only (401 without authentication, 403 for other roles or an untrusted Origin). Body:

```json
{
  "symptoms": "cough",
  "duration": { "value": 2, "unit": "days" },
  "painLevel": 3,
  "comments": "",
  "emergencySigns": "no",
  "acknowledged": true
}
```

Symptoms: trimmed 3–1000 characters. Duration value: integer 1–3650; unit: hours/days/weeks/months. Pain is optional, integer 1–10. Comments default to empty, max 1000. Warning-sign answer is required: yes/no/unsure. Acknowledgement must be true. All schemas are strict; forged patient/age fields and invalid values return 400. Age is resolved from the authenticated patient's stored profile.

Response is `{ruleVersion, disclaimer, emergencyMessage, outcome, explanation, suggestions}`. Outcomes:

- `urgent`: selected or recognised possible warning sign; no routine suggestions.
- `review`: unsure, high reported pain or severe/sudden/worsening wording; speak to a qualified professional, no routine suggestions.
- `staff`: unsupported context/language/age, negation, uncertain/mixed descriptions or no match; contact reception.
- `unavailable`: a rule matched but no corresponding active department exists.
- `matched`: one rule group matched; suggestions contain active matching departments and associated active doctors.

Each suggestion contains `{department: {id, name}, explanation, matchedTerms, doctors, doctorCount}`. Up to six doctors per service are returned in stable ID order. Doctor fields: id, name, specialization, qualification, consultationFeeMinor. They are directory matches, not a quality ranking; no appointment slot is claimed. No diagnosis or numerical medical confidence score is returned. Raw submitted values are not stored; the audit target is the rule version and action records the outcome.

`GET /api/directory/doctors/:id` returns `{doctor}` for an active doctor with an active department, using the same safe fields as doctor search. Invalid IDs return 400; unavailable/missing doctors 404. This supports `/book?doctor=:id`; `/book?department=:id` presets department browsing. The booking workflow validates availability again and requires explicit confirmation. Symptom text never travels in these URLs or into the appointment reason automatically.

See [week 7 decisions and limitations](week-7.md) for the rule catalogue, safety boundaries and source rationale.

## Patient feedback (week 8)

All routes require a current authenticated session. Writes require the configured Origin. Patients cannot supply a patient/doctor identity or server-generated metadata.

| Method | Endpoint                                                         | Access / behavior                                                         |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/feedback/visits?page=1&limit=10&appointment=<optional-id>` | Patient; own completed visits, each with saved feedback or null           |
| POST   | `/api/feedback`                                                  | Patient; submit once for an owned completed visit                         |
| GET    | `/api/admin/feedback?page=1&limit=10&q=<text>&rating=<1-5>`      | Administrator; all submissions, literal search and optional rating filter |

Submission body: `{appointment: "<id>", rating: 1..5, comment?: "up to 2000 characters"}`. Strict schema; rating must be an integer number. Returns 201 `{feedback: {id, rating, comment, createdAt}}`. Unknown/foreign visit returns 404; incomplete visit or duplicate submission returns 409; invalid data returns 400. Duplicate concurrent requests cannot create a second record or audit entry.

Patient list: `{records: [{id, reference, doctorName, departmentName, startsAt, feedback}], total, page, limit}`; feedback uses the safe submission shape. An optional appointment filter still enforces ownership and completion; no match returns an empty list.

Admin list: `{records, total, page, limit}`. Each record includes `_id`, appointment/patient/doctor IDs, snapshot patient/doctor/department names, appointment reference, visitAt, rating, comment and createdAt. `q` is at most 100 characters and searches those names, reference and comment as literal text. Rating is optional 1–5; pagination is bounded to page 1–10,000 and limit 1–50. Neither route includes clinical notes or contact information. There are no feedback update/delete routes.

## Operational reports and audit viewing (week 9)

All endpoints below are administrator-only. They inherit session authentication, no-store headers and rate limits. No source records are changed by a report or audit query.

| Method | Endpoint                                                                                  | Result                                                                    |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET    | `/api/admin/reports`                                                                      | Catalogue of ten report types, explanatory basis, columns and metrics     |
| GET    | `/api/admin/reports/:type?from=YYYY-MM-DD&to=YYYY-MM-DD&page=1&limit=10`                  | Generated report with period, summary metrics, columns and paginated rows |
| GET    | `/api/admin/audit/options`                                                                | Distinct recorded actions and modules for filter dropdowns                |
| GET    | `/api/admin/audit?from=YYYY-MM-DD&to=YYYY-MM-DD&user=&action=&module=&q=&page=1&limit=10` | Read-only audit events with safe actor identity and UTC timestamps        |

Report types: `appointments`, `schedules`, `consultations`, `registrations`, `demographics`, `revenue`, `billing`, `workload`, `departments`, `feedback`. `appointments` requires from=to. See [week 9 definitions](week-9.md) for exact date bases and calculations; invoice balances are current while revenue uses receipt/reversal event dates.

Report response: `{report:{id,title,basis}, period:{from,to,timezone,generatedAt}, columns:[{key,label,format}], summary:[{key,label,format,value}], records, total, page, limit}`. Formats are text, number, datetime, decimal or money. Money values are integer LKR minor units; dates are ISO timestamps where applicable. `total` counts table rows/groups, not necessarily source documents; summary counts cover all matching source activity. Empty feedback average is null. Summary and table data share one snapshot per request; paging/regeneration reads a new snapshot.

Both date filters default to today and include the full calendar dates in Asia/Colombo. Valid range: 1900–2199, from<=to, at most 366 inclusive days. Page 1–10,000, limit 1–50. Unknown fields, invalid dates and unknown report types return 400. Unauthorized roles return 403; unauthenticated requests return 401.

Audit `user` is a case-insensitive literal current-name search, or an exact actor ID when it is a 24-character hex ID. Action/module are exact strings; `q` searches action/module/target as literal substrings. Each filter is limited to 100 characters. Events return `{id,actorId,actorName,actorRole,action,module,target,createdAt}` in descending timestamp/ID order. Missing actors are retained with null or original ID. No audit update/delete routes are available.
