# Smart HMS user manual

Updated 14 October 2026. This manual describes the working project interface. Use synthetic data for demonstrations and testing. Approved public contact settings are Smart HMS, Colombo 09, +94 115 279 429, smarthms@gmail.com, open 24 hours every day.

## Opening the system

Open http://localhost:5173 on this computer. The public page provides hospital contact details, visiting guidance and a link to Doctors & services. The directory shows only explicitly published, active profiles. An empty directory means an administrator has not published profiles; it is not an invented list of hospital clinicians.

Choose English, Sinhala or Tamil from the language control at the top. The browser remembers the preference. Sinhala and Tamil interface translations require a fluent reviewer, especially the clinical terminology. Names, clinical notes, prescription instructions, administrator-written descriptions and stored messages remain in their original language. The symptom keyword engine accepts English input; translating its interface does not change that boundary. Use Solid surfaces for opaque panels when preferred.

## Account access and recovery

Patients can select Create patient account, supply their identity/contact details and choose a password of at least 10 characters (maximum 72 UTF-8 bytes). Staff accounts are created by an administrator. Login sends each role to its own workspace; Sign out revokes that device's session.

Forgot your password sends a generic confirmation regardless of account existence. A reset link expires after 15 minutes and can be redeemed once. Requesting another link after the one-minute account cooldown replaces the previous link. Set and confirm a new password, then sign in again on each device. The reset signs out all existing sessions and queues a security confirmation email.

Email delivery depends on server configuration. Gmail SMTP is configured in this installation; only approved recipients receive live messages. In local-preview mode, an operator can inspect the private `.local/reset-mail/` folder on the server. Recovery links are never shown by a public API or the normal delivery-history screen. These files are private and automatically removed after expiry. SMTP must be configured and the recipient approved before a recovery email can leave this computer. Do not send or paste these private preview files into chat.

## Patient workflow

1. Review My profile. Keep phone, address and emergency contact current. Ask reception to correct identity or intake details.
2. Choose Book appointment, filter by department/doctor and select a date/time. A slot is reserved only after Confirm appointment succeeds.
3. Use Appointments to review, cancel or reschedule. The old booking remains intact if the new slot is unavailable. Dates and times use Asia/Colombo.
4. Bring the reference to reception for check-in. Doctor consultations start after check-in.
5. After completion, Medical records shows the completed consultation and prescription history. Read clinician-written instructions as recorded; the app does not provide automated drug-interaction advice.
6. Bills & payments shows itemised LKR charges, payments and outstanding amounts. Staff record payments received outside this app; no card payment is processed here.
7. Submit one rating/comment per completed visit through My feedback. Feedback is private to the patient and administrators and cannot be edited after submission.
8. Notifications stores appointment, consultation and billing updates. Email & SMS controls opt-in and displays masked delivery history with email subjects. New emails explain the event and show appointment times, doctor/department, fee or bill/receipt totals, as appropriate. Clinical notes and medication instructions stay inside the portal. Email buttons return you to the relevant page after sign-in. SMS retains a short sign-in link. Local preview, provider acceptance and confirmed delivery are distinct states. See [email examples and setup](email-notifications.md).

The Department guide is a bounded navigation prototype for English non-emergency adult descriptions. It may miss or misunderstand symptoms and has not been clinically validated. Its warnings and human fallback remain visible. It neither diagnoses nor ranks doctors by clinical quality.

## Reception workflow

Search Patients & walk-ins before registering another account. Verify identity to avoid duplicates. Register a walk-in when necessary and transfer the initial credential privately. Review reported allergies and blood group; those entries require clinical confirmation. Book a doctor slot, confirm arrival, and manage cancellations/rescheduling with a reason. After the consultation, review the generated bill, add justified service charges before any payment, and record only a payment actually received. Bank-transfer entries require a reference. A reversal corrects a record and does not transfer or refund money.

## Doctor workflow

Consultation queue shows waiting and in-consultation visits ordered by check-in time. Unfinished visits persist across dates, with pagination for long queues. Daily timeline shows your own appointments for the selected date in chronological order. Open the assigned patient, review history and allergies, then start the consultation. Save a draft while working. Complete the visit only after reviewing the final notes and prescription: completion publishes the record, locks consultation notes, creates a bill and queues notifications atomically. Later prescription revisions require a reason and preserve prior versions. Doctor schedules creates dated sessions and slots; close a session only after resolving its open appointments.

## Administrator workflow

- Departments: create, edit, publish or deactivate. Reassign all doctors before deactivation. A stale edit is rejected so another administrator's change is not silently overwritten.
- Care team: create/update staff and deactivate accounts after resolving open visits. Publish approved profile makes an active doctor visible only when the department is also active and published. It publishes name, department, qualifications, specialisation and consultation fee; email and phone are private.
- Patient accounts: search active/inactive accounts. Deactivate or reactivate with an administrative reason. Deactivation requires all open appointments to be resolved, revokes sessions and reset links, and preserves medical/billing history.
- Hospital settings: edit a private draft, review it, save, then publish. Set 24-hour reception explicitly; it does not create doctor appointment slots. Publication changes are audited.
- Reports & analytics: choose report and dates, then Generate report. CSV and Print / save PDF export the full selected period, up to 5,000 rows; shorten the period for larger exports. Print opens a separate complete report view and uses the browser's Save as PDF option.
- Audit log: filter actions by actor, date, module and target. Login IPs are restricted to this screen and retained for 30 days; event history remains. Administrative status-change reasons are included. There is no edit/delete control.

## Troubleshooting

If the page is unavailable, check `systemctl --user status smart-hms-dev.service`, `npm run health:check` and Docker/MongoDB status. The project drive must be mounted. Avoid running a second development server alongside the managed service. A lost Socket.IO connection falls back to periodic REST refresh; it does not reserve slots. On a conflict, reload the affected record before retrying. If external messages stay simulated, consult provider configuration rather than assuming they reached a phone or mailbox.

Do not use real patient information for the acceptance scenarios until the hospital has completed its deployment, access, language and clinical reviews.
