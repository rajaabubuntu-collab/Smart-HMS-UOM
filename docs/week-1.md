# Week-one implementation and handoff

Baseline: Smart HMS interim report and Appendix F SRS supplied by the project owner. Scope follows the agreed first-week plan, not the full SRS.

This file preserves the week-one baseline. Scheduling, staff management and appointment work described below as pending has since been implemented in [weeks 2–3](weeks-2-3.md).

## Acceptance checklist

- [x] Root npm workspaces, React/Vite client, Express API and reproducible lockfile.
- [x] Environment template, random local signing secret, isolated MongoDB replica set, health endpoint.
- [x] User, Patient, Doctor, Department, Session and AuditLog models.
- [x] Synthetic development admin and one example account for each other role.
- [x] Patient registration and persistent profile creation.
- [x] Four-role login, protected dashboards and revocable logout.
- [x] API permissions independent of client routing.
- [x] Patient contact and emergency-contact editing.
- [x] Administrator department and doctor/receptionist creation forms.
- [x] Automated verification commands and setup/API/security documentation.
- [ ] Optional repository commit: left uncommitted for owner review; no branch/remote changes.

## SRS traceability

| Requirement | Week-one coverage                                                                              | Evidence                                         |
| ----------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| AUTH-001    | Implemented: patient registration                                                              | API and browser registration workflows           |
| AUTH-002    | Implemented: validation and unique email                                                       | Invalid-field and concurrent-duplicate API tests |
| AUTH-003    | Implemented: four-role login                                                                   | API role matrix and browser tests                |
| AUTH-004    | Implemented with refinement: expiring JWT in cookie                                            | Session API tests; security design               |
| AUTH-005    | Implemented for existing endpoints                                                             | API role matrix and protected browser route      |
| AUTH-006    | Deferred: emailed password recovery                                                            | Planned notification/auth follow-up              |
| AUTH-007    | Implemented: logout and server-side session revocation                                         | Captured-cookie replay test                      |
| AUTH-008    | Implemented: bcrypt, no plaintext/hash exposure                                                | Password-storage and response tests              |
| AUTH-009    | Implemented for protected API; health/login/register intentionally public                      | Unauthenticated-access tests                     |
| AUTH-010    | Creation implemented; editing/deactivation deferred                                            | Admin staff API and browser workflow             |
| PAT-001     | Profile foundation implemented; age derived when needed; clinical editing deferred             | User/Patient models, profile page                |
| PAT-002     | Profile warning implemented; consultation warning deferred                                     | Profile UI; unrecorded-state copy                |
| PAT-003     | Implemented: phone/address/emergency contact                                                   | API and browser persistence tests                |
| PAT-004–008 | Deferred: receptionist registration, clinical history, bills, appointments, account management | Weeks 2 onward                                   |
| AUD-001     | Partial: existing auth/profile/admin events logged                                             | Audit assertions in API tests                    |
| AUD-002     | Implemented: actor/action/UTC time/module                                                      | AuditLog schema                                  |
| AUD-003–005 | Storage and append-only API boundary implemented; admin viewer/search pending                  | No audit mutation routes; later admin viewer     |

## Decisions made

Verification on 3 October 2026: 15 API integration tests and 5 browser workflow tests passed. ESLint and the production client build passed. Login, administrator dashboard and mobile patient-profile screenshots were visually reviewed; mobile viewport width was checked for horizontal overflow. The development API reported a connected database and the frontend returned HTTP 200. `npm audit --omit=dev` reported no known vulnerabilities at verification time; this is not a security certification.

1. One Express backend with separate model/auth/validation boundaries; one React application with role-aware routes.
2. MongoDB 7 in a local Docker replica set. Local port 27018 avoids the user's existing database. Multi-document transactions prevent partially created accounts.
3. Current installed framework versions are recorded in the lockfile; update the report's older version table to match the actual implementation.
4. JWT cookie + database session, 8-hour default. This changes the tentative header-based/24-hour design and provides real logout revocation.
5. Patient self-editing is restricted to contact details. Staff manage clinical/identity details in a later authorised workflow.
6. Initial staff credentials are entered by the admin; account invitation/password-rotation workflow is deferred.
7. No synthetic appointment/revenue figures appear in the application. Future modules are explicitly labelled as upcoming.

## Next implementation milestone

Build doctor schedules and appointments around the existing User → Doctor → Department and User → Patient relationships.

1. Define schedule intervals, slot duration, leave/unavailability and the hospital timezone (Asia/Colombo for display; UTC instants for storage).
2. Agree cancellation permissions, particularly the diagram's Waiting → Cancelled transition.
3. Add schedule/slot models and database-enforced active-slot uniqueness before implementing booking screens.
4. Add patient doctor/department browsing, availability, booking and cancellation.
5. Add receptionist walk-in registration, proxy booking and check-in.
6. Add tests for concurrent bookings, cancelled-slot reuse, role ownership, invalid transitions and local-date boundaries.

Keep audit entries and acceptance evidence alongside each new feature. Do not add clinical diagnosis logic to the recommendation feature.
