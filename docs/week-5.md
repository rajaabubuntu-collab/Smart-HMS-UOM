# Week 5 — billing and recorded payments

The appointment-to-consultation workflow now continues into itemised billing. No online payment gateway, SMS or email delivery is included. Use synthetic data for demonstrations.

## Try it

1. Complete a consultation as its assigned doctor. Completion now creates one invoice in the same transaction, using the consultation fee captured when the appointment was booked.
2. Sign in as reception or admin and open **Billing**. Search by invoice, appointment reference or patient name, and filter Pending/Paid/Overdue bills.
3. Open a bill and select **Edit charges / due date** to add applicable service charges. Each line has description, quantity and unit price in LKR. A reason is required and previous versions are preserved. The booked consultation fee is fixed.
4. Select **Record payment**, enter the amount actually received, choose Cash or Bank transfer, provide a transfer reference if applicable, and confirm receipt. Partial payments are supported. No money is moved by the app.
5. The patient opens **Bills & payments** to view only their own bills, itemised charges, balances and every payment entry. **Print statement** opens the browser's print dialog (including Save as PDF where supported).
6. If a payment was recorded incorrectly, an administrator can **Reverse record** with a reason. The original receipt stays visible, the balance increases, and an audit event is recorded. This is a bookkeeping correction, not a bank refund.
7. For a completed visit from before week 5, open **Appointments → Billing**. If no bill exists, reception/admin can **Generate missing bill** with itemised charges and a due date. Existing development data is not silently backfilled.

## Scope and decisions

| Requirement | Implementation                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| BIL-001     | Automatic one-per-appointment bill on consultation completion; fee snapshot plus staff-entered applicable service charges |
| BIL-002     | Receptionist/manual bill creation for completed visits without an invoice; itemised extra charges and unpaid revisions    |
| BIL-003     | Immutable patient, doctor and appointment links; reference/name snapshots                                                 |
| BIL-004     | Patient-owned bill list, itemised detail, totals and printable statement                                                  |
| BIL-005     | Pending, Paid and Overdue status, with partial-paid annotation                                                            |
| BIL-006     | Per-bill chronological payment history, receipt references and preserved reversals                                        |
| BIL-007     | Admin access to all bills, unpaid revisions, payment recording and corrections                                            |

- Currency is LKR; all persisted amounts use integer minor units (100 = LKR 1.00). Totals and balances are computed on the server. Quantity is an integer from 1 to 100; extra unit prices are bounded to LKR 1,000,000 and at most 19 extra lines are allowed.
- Automatic bills are due on the completion date. Unpaid invoices can have their due date changed. Pending becomes Overdue after the due date in Asia/Colombo; partial payment does not reset the due date. Paid is derived when balance is zero, including zero-fee visits. No background task is needed to update status.
- Bill edits require a reason and expected revision. Once any payment history exists, including reversed payments, charge/due-date changes are blocked. Credit notes, voiding invoices, refund processing and fee overrides are outside this milestone; existing records are never deleted through the API.
- Cash and Bank transfer describe payments staff have received externally. A transfer reference is required for Bank transfer. No card details are collected and the application does not contact a financial service.
- Payment submissions carry a UUID request key. A retry with the same actor and details returns the original receipt, even if the original HTTP response was lost. Reusing that key with different details is rejected. Bill revisions plus transaction write conflicts prevent overpayment from simultaneous distinct submissions.
- Admin reversals are transactional, once-only corrections; they preserve the original entry and add reversal time, actor and reason. They do not issue a financial refund.
- Doctors cannot use the billing API. Completing their consultation creates the fee bill internally without granting them billing access. Reception/admin cannot retrieve consultation notes through billing endpoints.
- Bill changes and payment events are audited. The week-five baseline exposed new bills in the portal; [week 6](week-6.md) now adds in-app billing notifications.

## Verification

52 API tests cover the current system, including automatic and manual generation, original fee snapshots, rollback on generation failure, duplicate bill prevention, integer totals, ownership/role checks, stale revisions, partial payments, duplicate retries, concurrent overpayment prevention, required references, reversals, audit entries, zero-fee bills and overdue date boundaries.

Browser coverage includes manual generation, service charges, overdue status, partial cash then bank-transfer payment, patient access at 390px, print styling and admin correction. The consultation browser workflow also verifies automatic bill visibility in the patient portal. Screenshots and a synthetic print sample are stored under `.local/screenshots/` and excluded from Git.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` and `npm run format:check`. All integration/browser test databases are disposable and separate from development data.

Next milestone at this baseline was notifications and reminders, now implemented in [week 6](week-6.md).
