# Week 4 — consultations and medical records

Implemented on top of weeks 1–3. This is an academic development system; use synthetic patient data.

## Walkthrough

1. Admin publishes a session; patient or reception books an appointment.
2. Reception checks the patient in on the appointment date.
3. Doctor opens **Consultation queue**. Counts describe today; the waiting list also retains unfinished older visits. Queue refreshes every 15 seconds while visible and is ordered by check-in time.
4. Open the patient, review profile, reported allergies and previous completed records; select **Start consultation**.
5. Record notes, diagnosis, treatment and reported current medications. Add prescription items with name, dosage, frequency and duration, or explain why no medication is prescribed.
6. Review allergies explicitly and **Save draft**. Reloading preserves saved data. Drafts are not visible to patients. Unsaved edits are labelled and closing/reloading the browser warns; save before navigating within the application.
7. Select **Complete visit**, then confirm publication. The appointment moves to Completed and the patient sees it in **Medical records**.
8. Doctor reopens the completed visit through **Appointments → Open clinical record**. Notes are locked; a prescription change requires a reason and fresh allergy review. All previous prescription versions remain visible in medical history.

## Requirement coverage

| SRS requirement | Implementation                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- |
| DOC-001–002     | Assigned doctor waiting queue with arrival order and consultation status                                               |
| DOC-003–004     | Existing chronological appointments plus today's total/completed/pending/cancelled counts                              |
| DOC-005–006     | Direct patient record access from queue and existing own schedule view                                                 |
| MED-001–002     | Patient profile, completed consultation/prescription history and clinician-recorded reported medications at each visit |
| MED-003–004     | Draft persistence and completed notes/diagnosis                                                                        |
| MED-005–006     | Structured medication instructions and append-only prescription version history                                        |
| MED-007         | Own completed records for patients; appointment-scoped records/history for treating doctors                            |
| MED-008         | Prominent allergy warning, explicit review and stale-review rejection                                                  |
| MED-009         | Waiting → In Consultation → Completed with transactional audit/state writes                                            |

## Integrity and access decisions

- Starting is allowed only for Waiting appointments, including unresolved arrivals from prior days. Reception's existing same-day check-in rule is unchanged.
- One active consultation per doctor and per patient is enforced with transaction locks and partial unique indexes. Competing starts cannot create overlapping active consultations.
- Draft saves and prescription changes require the expected revision. Stale edits receive 409, preserving the stored version.
- Completion stores the initial prescription version, locks the notes, publishes the record and completes the appointment in one transaction. Subsequent prescription changes append a version with reason, actor, time and reviewed allergies.
- Doctor access requires a non-cancelled assigned appointment; the doctor may view that patient's completed history and modify only their own appointment's consultation. Operational staff cannot read clinical records. Patients only see their own completed records.
- Reading records/history and all clinical mutations are audited. Clinical note content is not copied into audit entries.
- Reported medication text is a point-in-time history, not a verified live medication list. Durations are clinician-authored text; the app does not infer adherence or automatically stop medication.
- There is no automatic diagnosis, drug interaction or allergy-drug matching. The doctor selects treatment and reviews reported allergies; unrecorded allergies never mean confirmed absent.
- At the week-four baseline completion did not create a bill. [Week 5](week-5.md) now generates one atomically with completion.

## Verification

43 API integration tests cover the existing system plus clinical authorization, queue isolation/order, concurrent starts, active-patient conflicts, draft persistence/privacy, stale revisions, state transitions, allergy changes, immutable completed notes, prescription version preservation and audit records.

The 11 browser tests include the complete doctor-to-patient workflow: start, draft/save/reload, complete, prescription revision, queue removal and patient history on a 390px viewport. Screenshots are written to `.local/screenshots/queue-desktop.png`, `consultation-desktop.png` and `medical-records-mobile.png`.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build`, and `npm run format:check`. The disposable test databases never replace the development database.
