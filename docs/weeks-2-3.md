# Weeks 2–3: schedules, patients and appointments

This milestone extends the existing week-one application. The development database and accounts are preserved; new collections and indexes are created on application startup.

## Try the workflow

1. Start the project with `npm run db:up` and `npm run dev`. Use the development credentials in `.local/dev-credentials.txt`.
2. Sign in as the administrator. Open **Doctor schedules → Add a session**, select a doctor, and publish a future date/time range. A one-hour session with 15-minute slots creates four bookable slots.
3. Sign in as a patient. Open **Book appointment**, choose a doctor, select the published date and a time, and confirm. A booking reference and confirmation are shown.
4. Open **My appointments** to view upcoming bookings, details and history. Cancel a future scheduled booking with a reason; its future slot becomes available again.
5. Sign in as a receptionist. Use **Patients & walk-ins** to find a patient by name, email or phone, or register a new walk-in. The receptionist remains signed in; registration creates a separate patient account.
6. Book on the selected patient's behalf. Use **Appointments** to filter by date/status, move a scheduled booking to another free slot, or cancel it.
7. On the appointment's Sri Lankan calendar date, select **Check in** and confirm arrival. The status becomes **Waiting**. The assigned doctor sees the same status in their appointment list.
8. Administrators can edit staff names, phones, clinical profile details and active state from **Care team → Edit**. Deactivating a doctor with open appointments is blocked until those visits are moved or cancelled.

Development seeds do not invent a working schedule: the administrator deliberately publishes sessions through the interface. There are no real patient records or clinical diagnoses in the fixtures.

## Scheduling decisions

- Hospital timezone is **Asia/Colombo**. Entered date/time pairs are interpreted at UTC+05:30; appointment/session/slot timestamps are stored in UTC. Date filters use the full Sri Lankan calendar day, including UTC dates that cross midnight.
- Sessions are explicit dated intervals, not recurring templates. Publish separate intervals for morning/afternoon work. A session lasts at most 12 hours, stays within one local calendar day, divides into whole slots, and starts within the next 180 days.
- Administrators publish or close sessions. Doctors can view only their own sessions. Closing replaces deletion so history stays available. To change an unused session, close it and publish a replacement. To change a booked session, move/cancel its appointments first.
- Doctor leave is handled by closing affected sessions, after resolving open bookings. Recurring rosters and bulk leave management are future extensions.
- Only future active slots belonging to an active doctor and department can be booked. Slot listings are advisory; confirmation always revalidates availability server-side.
- Patients cannot book overlapping appointments, including with different doctors.
- A booking retains a snapshot of the doctor name, department and consultation fee. Later staff edits do not rewrite past bookings. A reschedule uses the target doctor's current fee and records the previous/new date and doctor in history.
- Fees are informational in this milestone. No bill or payment is created; billing is week five.

## Appointment permissions and state changes

| Action                               | Patient                                | Receptionist                  | Administrator                 | Doctor        |
| ------------------------------------ | -------------------------------------- | ----------------------------- | ----------------------------- | ------------- |
| Browse active doctors and free slots | Yes                                    | Yes                           | Yes                           | Yes           |
| Book                                 | Own identity from session              | On behalf of selected patient | On behalf of selected patient | No            |
| View appointments/details            | Own only                               | Hospital operations           | Hospital-wide                 | Assigned only |
| Cancel Scheduled                     | Own, before start time                 | Yes, with reason              | Yes, with reason              | No            |
| Cancel Waiting                       | No; contact reception                  | Yes, with reason              | Yes, with reason              | No            |
| Reschedule                           | No; cancel/rebook or contact reception | Scheduled only                | Scheduled only                | No            |
| Check in                             | No                                     | Scheduled, same local date    | Scheduled, same local date    | No            |
| Start/complete consultation          | Not implemented in this milestone      | —                             | —                             | Week four     |

Transitions implemented: **Scheduled → Waiting**, **Scheduled → Cancelled**, **Waiting → Cancelled**. Check-in can occur before or after the slot time, but only on its local date. Repeated check-ins, repeated cancellations and invalid transitions are rejected. Completed/Cancelled are terminal for these endpoints; In Consultation/Completed enum values are reserved for the next clinical workflow.

Upcoming contains future open appointments. History contains past appointments plus cancelled/completed appointments. All appointments includes every status. Today is an explicit local-date filter; past unprocessed Scheduled appointments remain visible instead of silently becoming completed/no-show.

Appointment lists refresh every 30 seconds while the page is visible and no dialog is open, with a manual refresh button. This is appointment visibility, not the full clinical queue/consultation workflow planned for week four.

## Patient intake and staff management

- Receptionists/admins may register walk-ins and correct identity/contact details, emergency contacts, and **patient-reported** blood group/allergies. An empty allergy record is not interpreted as no allergies. Clinical confirmation and medication history remain week-four work.
- Walk-ins require a unique email and an initial password for the portal, consistent with the current account model. Anonymous/no-email registration and invitation/reset flows are not implemented.
- Patients retain contact-only self-editing. Doctors cannot browse the intake directory. The assigned doctor may see reported allergies in their non-cancelled appointment detail; cancelled bookings no longer grant that detail access.
- Staff role/email cannot be changed through the editor. There is no administrator creation API. Deactivation revokes all sessions; inactive doctors disappear from booking directories. Their session records remain stored and become usable again on reactivation if still future/open.
- Patient record deletion/deactivation remains deferred; records and linked appointments are not hard-deleted.

## Data integrity

Collections added: `DoctorSchedule`, `AppointmentSlot`, `Appointment`.

- A partial unique index permits **one active slot per doctor/start time**. Closed-session slots remain as historical records.
- A partial unique index permits **one slot-holding appointment per slot**. Cancellation releases the claim without deleting the appointment.
- Booking, rescheduling, cancellation, check-in, staff updates and session changes run in transactions with audit entries.
- Shared doctor-document writes serialise competing session/booking/staff operations; patient-document writes serialise overlapping bookings across doctors. Doctor locks are taken in ID order before the patient lock. This prevents the write-skew that a check-then-insert alone would allow.
- Rescheduling updates the existing appointment and its history atomically. A conflict leaves the original booking untouched.
- The application does not issue diagnoses, prescriptions, notifications or payments during these operations.

Implementation references: [MongoDB partial unique indexes](https://www.mongodb.com/docs/manual/core/index-partial/) and [Mongoose transactions](https://mongoosejs.com/docs/transactions.html). Transaction database operations are sequential within a session.

## SRS traceability

| Requirement      | Result                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| PAT-001, PAT-002 | Patient intake includes demographics, reported allergies, blood group and emergency contacts; clinical confirmation pending |
| PAT-003          | Existing patient contact self-service retained                                                                              |
| PAT-004          | Receptionist walk-in registration implemented                                                                               |
| PAT-007          | Patient appointment history implemented                                                                                     |
| AUTH-010         | Staff creation, profile editing, activation/deactivation and session revocation implemented                                 |
| APT-001          | Active doctor directory, department and name/specialisation filters                                                         |
| APT-002          | Date-specific free-slot availability                                                                                        |
| APT-003          | Patient booking with confirmation reference                                                                                 |
| APT-004          | Database constraint + transactional concurrent-booking protection                                                           |
| APT-005, APT-006 | Future self-cancellation and slot release                                                                                   |
| APT-007          | Status display and administrative transitions; clinical transitions deferred to week four                                   |
| APT-008          | Receptionist proxy booking, rescheduling and cancellation                                                                   |
| APT-009          | Same-day receptionist check-in to Waiting                                                                                   |
| APT-010          | Administrator hospital-wide appointment view and operational actions                                                        |
| APT-011, APT-012 | Upcoming dashboard cards and complete appointment list/history                                                              |
| DOC-003, DOC-006 | Assigned appointment list and own session view                                                                              |
| AUD-001, AUD-002 | New operations record actor/action/module/record/UTC timestamp                                                              |

## Verification and remaining scope

Verified on **3 October 2026**: **37 API tests and 10 browser workflow tests passed**, together with ESLint, the production client build, formatting checks and whitespace checks. Desktop booking/schedule/appointment screens and mobile booking/appointment/profile layouts were visually reviewed. Browser assertions confirmed no horizontal overflow on the tested 390-pixel mobile viewport. The dependency install reported zero known vulnerabilities at that time; no production-readiness claim is implied.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` and `npm run format:check`. Tests use disposable databases, not the development database. API tests exercise real concurrent requests and stored indexes. Browser tests use a test-only API with rate limiting disabled because all simulated users share one loopback IP; the separate API suite verifies the real authentication rate limiter.

Test coverage includes local-day boundaries, overlapping sessions, competing slot claims, overlapping patient bookings, cancelled-slot reuse, unauthorised access, atomic rescheduling, session-closure protection, check-in rules, walk-in identity, staff deactivation and retained booking snapshots. Browser coverage exercises publication → booking → rescheduling → cancellation, walk-in registration/booking, patient intake editing, doctor visibility and mobile layouts, alongside the original week-one flows.

Next: implement Waiting → In Consultation → Completed, the doctor's live queue, consultation notes, diagnoses, prescriptions and authorised medical-history access. Notification delivery, recurring schedules, billing, patient account management and full reporting are later milestones.
