# Week 9 — operational reports and audit viewing

Administrators can generate the ten report types listed in the interim report and inspect recorded audit events. These are authenticated, read-only screens backed by current MongoDB records. No development records are seeded or altered by reporting.

## Walkthrough

1. Sign in as an administrator and choose **Reports & analytics**. Daily appointments initially shows today in Sri Lanka time.
2. Select a report, enter its date range and choose **Generate report**. Daily appointments accepts one date; other reports allow up to 366 inclusive calendar days.
3. Read the report's explanation, applied period and generation time. Cards show totals for the entire range even when the result table spans several pages. Changing the form alone does not relabel old results: an explicit notice asks you to generate again.
4. Switch among revenue, billing and consultation reports. Their date bases differ deliberately; see the definitions below. A valid empty range shows zero counts and no rows; empty feedback has no invented average.
5. Open **Audit log**. Filter by Sri Lanka date range, current user name or exact user ID, action and module. Text search matches action/module/target literally. The event timestamps themselves are UTC, with user ID, action, module and target visible.
6. Apply or reset filters and use the pager. No edit/delete actions exist. Failed sign-ins or missing historical accounts remain visible as **Unlinked actor**.
7. On a phone, filters stack and tables scroll within their own containers. Reports and audit pages are inaccessible to patients, doctors and receptionists.

## Report definitions and traceability

| SRS     | Report / API type                         | Selection and calculation                                                                                                                                                                                                                                                            |
| ------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RPT-001 | Daily appointments / `appointments`       | `Appointment.startsAt` on a single hospital date; includes all current statuses. Names of doctor/department are booking snapshots; patient name is current.                                                                                                                          |
| RPT-002 | Doctor schedules / `schedules`            | Session start dates; includes active/closed sessions and generated/active slot counts. Staff and department names are current. Slot counts are not occupied-slot percentages.                                                                                                        |
| RPT-003 | Consultation statistics / `consultations` | Completed consultation records by `completedAt`, grouped by hospital date. Drafts and legacy completed appointments without a consultation record are excluded.                                                                                                                      |
| RPT-004 | Patient registrations / `registrations`   | `Patient.createdAt` within range, including walk-ins. Only patient ID, current name and registration time are listed.                                                                                                                                                                |
| RPT-005 | Patient demographics / `demographics`     | The same registration cohort, grouped by recorded gender and age band on the selected end date: 0–17, 18–34, 35–49, 50–64, 65+, Unknown. Not the whole hospital population by default.                                                                                               |
| RPT-006 | Revenue summary / `revenue`               | Payment receipt events on `createdAt`, less record reversal events on `reversedAt`, grouped by day and method. A reversal of a prior-period receipt is deducted in the reversal period; a later-period reversal does not rewrite the earlier period's net. Negative net is possible. |
| RPT-007 | Billing statistics / `billing`            | Invoices issued in range (`Bill.createdAt`), grouped by current Paid/Pending/Overdue state. Shows invoice totals, current paid amounts and outstanding balances, including subsequent payments/reversals. Overdue uses generation date; zero-value invoices are Paid.                |
| RPT-008 | Doctor workload / `workload`              | Completed consultation count per doctor by completion date. Includes inactive/missing doctors with retained IDs. Excludes drafts and legacy visits without consultation records.                                                                                                     |
| RPT-009 | Department utilisation / `departments`    | Appointment start dates, grouped by saved booking department name; total, completed, cancelled and non-cancelled counts. Renamed departments may be separate groups. This is activity volume, not a capacity percentage.                                                             |
| RPT-010 | Patient feedback summary / `feedback`     | Feedback submission dates, grouped by rating, with a submission-weighted average. No comments or patient identities are returned.                                                                                                                                                    |

Revenue is a summary of application payment records, not online transactions, profit, earned-revenue accounting or bank reconciliation. Monetary values remain LKR minor units in the API and are formatted for display. Billing cohort balances and period receipt totals answer different questions and need not match.

Consultation statistics and workload require a real completed consultation record. Consequently they can differ from appointments marked Completed in legacy data. Appointment reports show current scheduling/status state, not a reconstruction of historical state at the selected period end.

## Audit traceability

| SRS     | Implementation                                                                                                                                                                                                                                                                   |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUD-001 | Existing authentication, appointment, profile, clinical and billing workflows create audit events; the new viewer exposes them without changing their meaning. Initial prescription is included in `consultation_complete`; subsequent versions use `consultation_prescription`. |
| AUD-002 | Stored actor ID, action, module, target and UTC `createdAt` displayed through a safe response projection.                                                                                                                                                                        |
| AUD-003 | Administrator-only API and route guards; other roles cannot list events or filter options.                                                                                                                                                                                       |
| AUD-004 | Combined actor name/ID, exact action, exact module, inclusive hospital date range, and literal action/module/target search.                                                                                                                                                      |
| AUD-005 | No application edit/delete APIs or UI actions for audit records. Existing events remain intact; reads do not append recursive viewing events.                                                                                                                                    |

Actor names/roles reflect the current user record rather than a historical snapshot. A failed login has no linked actor ID; a missing account can retain an actor ID. This remains visible instead of dropping events during lookup. “Immutable” here is the application permission boundary, not tamper-proof storage: a database operator can still modify raw MongoDB data. Production database least-privilege roles, retention and external archival remain deployment work.

## Query integrity and limits

- Both dates are inclusive in Asia/Colombo. Queries use a UTC half-open interval from local midnight through the midnight after the end date, including millisecond boundary cases.
- Real calendar dates are required, limited to 1900–2199, with at most 366 inclusive days. Unknown query fields are rejected. Lists accept page 1–10,000 and limit 1–50; each report defaults to today and ten rows per page. Audit UI initially uses the last seven days.
- Reports use server-side aggregation and pagination. Rows, totals and summary metrics are read in a snapshot transaction for each response. A later page or regeneration is a new snapshot, so newly written records can change subsequent pages/totals. Generated results are not saved as historical report artifacts.
- Date indexes support source collections; audit module/action indexes complement its existing actor/date indexes. Aggregations have a 10-second execution limit. This is not a production load/performance certification.
- Result projections omit passwords, emails, phone numbers, appointment reasons, diagnoses, clinical notes, prescription content and feedback comments. Demographic and feedback reports are aggregates; appointment/registration reports intentionally contain the minimum identifying details needed by the admin.
- Search treats regex characters as ordinary text. Audit query text is limited to 100 characters per filter; action/module dropdowns use existing recorded values.
- No CSV, spreadsheet or PDF export, saved report scheduling, chart forecasting or production deployment is included in this milestone. The SRS's ten report-generation requirements do not specify file exports.

## Verification

Validated on 6 October 2026: all 88 API tests and 20 browser tests passed, along with lint, the production build, formatting and whitespace checks. Desktop and 390px mobile report/audit screenshots were visually reviewed.

Eleven reporting/audit API tests cover every report, role/authentication boundaries, malformed dates/filters, Sri Lanka midnight edges, pagination-independent totals, inactive staff, birthday boundaries, invalid birth-date fallback, zero-value invoices, partial balances, cross-period reversals, weighted feedback averages, safe projections, empty results, literal audit search and audit mutation rejection.

Three browser tests cover all ten report selections, applied-period labels, empty ranges, failed-request retry, overlong ranges, admin audit filters, UTC timestamps, mobile layouts and all non-admin role guards. These use isolated test databases and do not alter development patient records.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` and `npm run format:check`. Screenshots: `.local/screenshots/reports-desktop.png`, `reports-mobile.png`, `audit-desktop.png` and `audit-mobile.png`.

Deployment preparation and backup/restore rehearsal are implemented in [week 10](week-10.md). Actual hosting and final evaluation remain next.
