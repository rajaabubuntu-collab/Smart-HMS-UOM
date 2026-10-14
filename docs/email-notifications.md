# Detailed hospital emails

Implemented 14 October 2026. New patient events generate a specific subject, personalised greeting, explanation, relevant details, next step and portal button, in both HTML and plain text. Hospital name, address, reception phone and reply-to email come from **published**, non-demo Hospital settings. Unpublished/demo settings use the Smart HMS name without draft contacts. The actual sending account remains `EMAIL_FROM`.

| Event                                                  | Email details                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Appointment confirmed or reminder                      | Reference, Sri Lanka date/time, doctor, department, consultation fee                                                                              |
| Rescheduled                                            | Previous and new appointment times, previous doctor if changed, new doctor/department/fee                                                         |
| Cancelled or checked in                                | Reference, scheduled time, doctor, department and what happens next                                                                               |
| Consultation started/completed or prescription revised | Visit reference, date/time, doctor and department; instructions to open the appointment or medical record                                         |
| Bill created/updated                                   | Invoice and appointment references, total, paid amount, outstanding balance and due date                                                          |
| Payment recorded/reversed                              | Receipt reference, payment/reversed amount, method and bill totals; a reversal explicitly describes a record correction, not a transfer or refund |
| Password reset or password changed                     | Branded security email; reset link valid for 15 minutes and one use; confirmation explains session revocation                                     |

All amounts use LKR and all appointment/event timestamps use Asia/Colombo. Emails are currently in English; choosing Sinhala or Tamil changes the portal interface, not the email language. The Email & SMS explanation is translated in all three UI catalogues and still needs fluent language review.

## Privacy and event accuracy

Email can contain the patient's name, attending doctor/department and billing totals. It does **not** copy booking/cancellation reasons, consultation notes, diagnoses, allergies, medication instructions, invoice item descriptions or bank reference text. Those remain behind the patient's authenticated portal. SMS retains the short generic portal link. Unknown internal event kinds fall back to a generic message instead of copying arbitrary notification text.

The whitelisted email snapshot is stored in the same transaction as the originating event and notification. Later booking, bill, name or settings changes do not rewrite a queued email. Each email identifies when the update occurred and directs the patient to the portal for the latest state. Legacy queued records without snapshots retain their original generic format. Already-sent messages are not resent and opting in does not backfill old events.

Snapshots are excluded from default database projections. Patients see their own subjects and, for local transport only, plain-text previews. Administrator delivery history exposes delivery metadata and a generic local preview, not patient-specific bodies or subjects. Snapshots remain part of private database backups and should be treated as patient information.

Only the configured application origin and known patient routes appear in notification buttons. Signing in after opening an appointment email returns the patient to that appointment; existing role and ownership checks still apply. HTML escapes variable values, uses inline styles and tables, and loads no external images, fonts or tracking pixels. Every email has a plain-text alternative. Account-security emails do not include an optional-notification unsubscribe link; other emails link to Email & SMS preferences.

## Using the feature

1. Keep the working Gmail SMTP settings in the root `.env`; no new provider is needed. Restart the API after configuration edits. The existing recipient allowlist, account status, verified current destination and opt-in checks still apply. Changing to these templates does not widen delivery permissions.
2. As a patient, keep **Email updates** enabled under **Email & SMS**.
3. A new booking, reschedule, cancellation, clinical completion or payment action queues its matching email. The worker normally handles new jobs on its next five-second pass. Check **Delivery history** for its event-specific subject and status.
4. The email button opens the configured `APP_ORIGIN`. A `localhost` URL works on this development computer; opening it on a phone requires hosting the app at a reachable HTTPS address and configuring that origin.

The user confirmed receiving the previous Gmail email on 14 October. The new templates were validated with local synthetic previews and mocked SMTP; no live email was sent during this implementation. Provider acceptance still does not prove inbox placement. Gmail/Outlook rendering may differ from browser previews. SMS provider delivery remains a separate configuration.

## Reproduce checks and previews

```sh
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npm test
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npm run test:e2e -- tests/e2e/connectivity.spec.js tests/e2e/notifications.spec.js
node scripts/verification/email-previews.mjs
```

The preview script does not read `.env`, connect to MongoDB or send email. It creates 14 fictional examples in `output/email-notifications/` and checks overflow at 960, 390 and 320 pixels in Chromium. The sample reset token cannot reset an account. Server tests cover real workflow event wiring, exact amounts, snapshots, sensitive-field exclusion, HTML escaping, destination restrictions, ownership and mocked multipart sending. Existing tests cover transactional rollback, deduplication, retries, opt-outs and recovery.
