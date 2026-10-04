# Smart HMS API (weeks 1–5)

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
