# Week 6 — in-app notifications and reminders

The system now delivers persistent patient notifications for appointment, consultation, prescription and billing updates. The report's NOT-006 explicitly permits at least one of email, SMS or in-app; this implementation uses in-app delivery. No external messages are sent or gateway credentials required.

## Walkthrough

1. Book an appointment as a patient, or let reception book for a patient. The patient's notification centre receives a confirmation.
2. Open **Notifications** from the sidebar or the bell available throughout authenticated pages. The badge shows unread count; the centre supports All/Unread, pagination, refresh, Mark read/Mark unread and Mark all as read.
3. **View details** marks the notification read and opens its appointment, medical records or bill. Notification text records an event; the linked record always shows the current state.
4. Reception reschedules, cancels or checks in a visit. The patient receives the corresponding update. Consultation start/completion and prescription revisions also create notices; clinical drafts do not.
5. Bill creation/revision, payment recording and admin reversal notify the patient. Retrying the same payment does not duplicate its notification.
6. An appointment in Scheduled status with a start time within the next 24 hours receives a reminder at startup or on the next minute's check. One reminder is recorded per schedule revision, including when rescheduling returns to an earlier time.
7. Read state persists across reloads and logins. Other users cannot see or modify the patient's notifications, including reception/admin.

## Requirements

| SRS requirement | Implementation                                                                     |
| --------------- | ---------------------------------------------------------------------------------- |
| NOT-001         | Booking confirmation, including staff/proxy bookings                               |
| NOT-002         | Persistent reminders within the next 24 hours, with retry and deduplication        |
| NOT-003         | Cancellation and rescheduling notices                                              |
| NOT-004         | Check-in, consultation start and completion updates                                |
| NOT-005         | Completed consultation/prescription record availability and prescription revisions |
| NOT-006         | In-app delivery; SMTP and SMS remain optional future integrations                  |
| NOT-007         | Notification centre accessible from sidebar and header bell on authenticated pages |

## Delivery and concurrency decisions

- Event notifications are written inside the same transaction as their source change. A rollback leaves neither a partial workflow change nor a misleading notification. No historical event notices are backfilled automatically.
- Notifications have unique recipient/event keys. Reminder keys use appointment ID plus schedule revision; a revision increments only when the appointment is rescheduled. Old notices remain as event history rather than being rewritten.
- Reminder eligibility is Scheduled, strictly future and at most 24 hours away. The worker rechecks under the existing doctor lock and updates the durable reminder marker in the same transaction as the notice. Cancellation/rescheduling/check-in are serialised with that check. A notice delivered before a later cancellation stays in history, alongside the new cancellation notice.
- Existing appointments without reminder revision fields default to revision 0 and not-yet-reminded. This makes upcoming legacy appointments eligible without a destructive migration.
- The API starts one check immediately, then once every 60 seconds, with a maximum of 100 appointments per batch. It does not overlap its own runs. Multiple server workers are safe because of database transactions, shared locks and unique event keys. A large backlog drains over successive batches.
- A failed batch logs a generic failure and retries on the next interval. Already committed reminders remain deduplicated. If the server was down, only still-upcoming appointments in the window are caught up; past visits never get late reminders. The server must be running for delivery.
- Shutdown stops the timer and waits for the current batch before disconnecting MongoDB. No separate cron process or public trigger endpoint is needed.
- Browser count/list polling runs every 30 seconds while visible and refreshes when the tab becomes visible. Read operations refresh both centre and badge. Polling is confined to notification components and does not overwrite consultation drafts.
- Mark-all uses the server-provided view timestamp as a cutoff. Later notifications remain unread. The API only accepts read-state changes, not recipient/content/path edits or notification creation from clients.
- Notice text contains references and operational updates, not diagnoses, consultation notes, allergy lists or medication details. Record access is rechecked by the target API.
- In-app read state means acknowledged in this app; it does not assert email/SMS delivery or that a patient acted on the update. Reminders are not a guarantee of attendance.

## Verification

60 API integration tests cover current functionality, including notification ownership, schema validation, persisted read state, mark-all cutoff, transactional workflow notices, duplicate payment alerts, 24-hour boundaries, multiple reminder workers, restart/retry behavior, reschedule revisions, legacy fields, rollback and worker shutdown.

The 13 browser tests include coverage that exercises a reminder produced by the actual worker function, header unread count, centre pagination, read/unread persistence, appointment deep link, mark-all, another role's empty inbox and a 390px mobile layout. Screenshots: `.local/screenshots/notifications-desktop.png` and `notifications-mobile.png`. Test fixtures use synthetic data in a disposable database.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` and `npm run format:check`.

The next module at this baseline was the rule-based department guide, now implemented in [week 7](week-7.md). Feedback, reporting and audit viewing remain later milestones.
