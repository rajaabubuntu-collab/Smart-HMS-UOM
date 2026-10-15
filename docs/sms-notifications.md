# Detailed hospital SMS notifications

Implemented 15 October 2026 after the user confirmed receipt through Notify.lk. New SMS messages explain the event using selected operational details and a clear next step. The existing Gmail and Notify.lk configuration is sufficient; no new credentials are needed for this change.

| Event                          | Details included, in priority order                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Confirmation/reminder          | Appointment reference, Sri Lanka date/time, doctor, consultation fee                                                          |
| Rescheduled                    | Reference, new Sri Lanka date/time, previous date/time, doctor                                                                |
| Cancelled                      | Reference, cancelled appointment time, doctor; instruction to book again                                                      |
| Checked in                     | Reference, doctor; instruction to wait for the care team                                                                      |
| Consultation started/completed | Reference, doctor; visit status or instructions to view the record                                                            |
| Prescription updated           | Reference, doctor; instruction to review the latest prescription in the portal                                                |
| Bill created/updated           | Invoice reference, total, outstanding balance, due date                                                                       |
| Payment received               | Receipt reference, amount, outstanding balance, invoice reference                                                             |
| Payment reversed               | Receipt reference, reversed amount, outstanding balance; mandatory explanation that this is a record correction, not a refund |

Published hospital contact settings supply the brand and optional reception number. No draft contact details are used. Short GSM-7-compatible brand/doctor names are retained in full; unsupported or overlong doctor names are omitted. An unsupported/overlong hospital name falls back to Smart HMS. Messages are currently in English, independently of the portal language selection.

## Message length and credits

Each new SMS snapshot is limited to **160 GSM-7 units**. Extension characters such as `^`, braces and `€` count as two units. The renderer reserves the event title and next-step sentence, then adds whole detail fields in priority order while space remains. It never cuts an amount, reference, date or refund disclaimer in half. The transport also rejects oversized or non-GSM-7 snapshots before contacting the provider.

This targets one standard SMS segment; it is not a guarantee of a particular provider credit charge. See [Twilio's SMS encoding explanation](https://www.twilio.com/docs/glossary/what-sms-character-limit). Provider-added text or account billing rules can affect the cost. Check Notify.lk's dashboard for actual usage. Multiple hospital events still generate separate messages, including a completed consultation and its new bill.

No long URL, tracking link, emoji or clinical text is appended. The next-step sentence refers to the existing patient portal, leaving room for the actual event details. Reception's number is included only when the remaining budget allows. Full details remain in email and the authenticated portal.

## Example with fictional data

This confirmation uses 158 GSM-7 units:

```text
Smart HMS: Appointment confirmed.
Ref HMS-1234567890.
20 Oct 2026, 09:00 (Sri Lanka).
Doctor: Dr Demo Perera.
Fee LKR 2,500.00.
Manage in your patient portal.
```

This rescheduling notice uses 144 units:

```text
Smart HMS: Appointment rescheduled.
Ref HMS-1234567890.
New: 20 Oct 2026, 09:00 (Sri Lanka).
Was: 19 Oct 2026, 09:00.
Check your patient portal.
```

## Privacy, snapshots and delivery

Patient names, diagnoses, medication instructions, allergies, visit/cancellation reasons, invoice line-item descriptions and bank references are excluded. Doctor names, visit dates, references and financial totals are operational patient information and still need private handling. Unknown event types use a fixed generic message instead of copying arbitrary notification text.

The final SMS text is saved atomically with the originating action and notification. Later record edits do not change queued text. The existing deduplication, recipient allowlist, account status, destination, opt-in and retry checks remain active. Previously queued records without an SMS snapshot retain their old generic format; historical messages are not resent.

Only patients can see their own detailed local previews; administrator history keeps its generic preview and masked destination. SMS snapshots are excluded from default database queries and raw API responses. They remain part of private database backups. The Email & SMS opt-in explanation now describes operational details in both channels; English, Sinhala and Tamil interface catalogues have been updated.

No live SMS was sent during this implementation. Automated provider calls use dummy credentials and mocked HTTP. The new format will appear on the next eligible event with SMS enabled. To preserve trial credits, use local previews during development and enable live SMS only for deliberate demonstrations. Follow [Notify.lk setup](notifylk-setup.md).
