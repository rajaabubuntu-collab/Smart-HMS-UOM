# Dashboard charts, live updates and email/SMS

Implemented 9 October 2026; email content updated 14 October. The user has confirmed receiving a Gmail message. New detailed templates were tested with local previews and mocked SMTP; no live messages were sent during the template update. See [detailed hospital emails](email-notifications.md).

## Try the features locally

Start MongoDB and the app using the README instructions, then open `http://localhost:5173`.

1. Sign in as any role and open **Overview** (`/dashboard`). Appointment charts appear below the summary. Administrators also see net receipts in LKR and the ten busiest departments.
2. Look for **Live updates** in the top bar. This means the authenticated Socket.IO connection and database change stream are available. **Periodic updates** means the browser is using periodic REST refreshes.
3. As a patient, add a Sri Lankan mobile number in **My profile** if you want SMS previews. Open **Email & SMS** (`/messages`), select the channels and save preferences. Both are off for new/existing accounts until the patient opts in.
4. Make a new booking or another action that creates a patient notification. Open **Email & SMS** to see queued jobs processed, normally within five seconds when the worker is free. In `local` mode, jobs become **simulated** and can be expanded for preview; they never leave the application. In SMTP mode, accepted messages are sent to the approved recipient.
5. Administrators can open **Email & SMS** to monitor delivery history. Patients can see only their own history; doctor/receptionist access is denied.

Opting in does not backfill historical notices. Existing booking, rescheduling, cancellation, check-in, consultation, billing and reminder notices enqueue the selected channels in the same database transaction. A duplicate notification event does not enqueue another copy. New emails contain the patient name, event explanation, selected appointment or billing details, and a link to the relevant portal page. Clinical notes, diagnoses, prescription instructions and free-text reasons remain behind sign-in. SMS keeps the generic portal-update link. Emails use an event snapshot so later edits cannot change a queued message; see [template details and privacy](email-notifications.md).

## What the charts mean

- **Recent:** today and the preceding six days. **Upcoming:** today and the next six days. Boundaries use `Asia/Colombo`.
- Appointment charts count visits by scheduled appointment date, including cancellations, and show their current statuses. They do not count the date a booking was created.
- Patients see their own visits; doctors see assigned visits; receptionists and administrators see hospital totals. Patient identity/contact and clinical content are absent from chart responses.
- Administrator net receipts are payments recorded on each day minus reversals recorded on that day, including reversals of earlier receipts. Values are stored as integer LKR minor units. A negative day is possible. This is received money, not invoice revenue or an accounting statement.
- Department activity counts appointment department snapshots in the selected window and shows the top ten. Existing report pages retain their separate date-range tables; this revision does not add a chart to every report.
- Server aggregation covers the complete matching set, not a page of records. Seven days are returned even when empty. Each chart includes a table alternative; empty periods display an explicit notice. Charts load in a separate JavaScript chunk.

## Live update design

Socket.IO uses WebSocket transport at `/socket.io`. Vite proxies this route in development; the production reverse proxy must allow WebSocket upgrades. The connection checks the exact configured Origin and existing HTTP-only session cookie. The server assigns user membership; clients cannot choose users/roles or send application events. Sessions are rechecked before each invalidation and every five seconds, so logout, expiry and deactivation disconnect stale sessions.

MongoDB change streams observe committed writes. Events contain only an invalidation signal; browsers fetch current data through the existing authorised REST endpoints. Dashboard charts/summary, appointment lists, the doctor queue, notifications and delivery history refresh this way. Unsaved clinical forms are not reloaded by the live signal. Reconnection or stream recovery triggers a refresh; there is no promise of durable Socket.IO event replay. A visible tab also refreshes every 30 seconds; the existing queue's 15-second refresh remains.

A replica set and database-scoped change-stream read privileges are required. Stream errors mark live updates unavailable and retry after five seconds. This implementation targets one API process. Shared rate limits, a Socket.IO adapter, distributed capacity and load testing would be needed before claiming a multi-node deployment is supported.

## Configure real providers

Keep secrets in the private root `.env` (production: `.env.production`), never frontend variables or version control. Restart the API after changing settings. Configure only the channel you intend to test; keep the other `local` or `off`.

| Setting                                    | Value / purpose                                                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `EMAIL_TRANSPORT`                          | `local` (preview), `off`, or `smtp`                                                                        |
| `SMS_TRANSPORT`                            | `local` (preview), `off`, or `twilio`                                                                      |
| `ALLOW_LIVE_DELIVERY`                      | Must be `true` for either live transport                                                                   |
| `DELIVERY_ALLOWED_RECIPIENTS`              | Explicit comma-separated approved email addresses and `+947XXXXXXXX` numbers; no wildcard                  |
| `SMTP_HOST`, `SMTP_PORT`                   | Provider host; port 587 by default, or 465 for implicit TLS                                                |
| `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Provider credentials and permitted sender email address                                                    |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`  | Twilio account credentials                                                                                 |
| `TWILIO_FROM`                              | Registered alphanumeric sender, 1–11 letters/digits/spaces with at least one letter                        |
| `TWILIO_MESSAGING_SERVICE_SID`             | Alternatively, a Messaging Service SID containing the approved sender; takes precedence over `TWILIO_FROM` |

Sri Lankan mobile inputs such as `0771234567` normalise to `+94771234567`; landlines are not SMS destinations. Twilio's Sri Lanka guidance requires registered alphanumeric senders on several networks and restricts traffic on Mobitel. Confirm sender registration, permitted message type and Sri Lanka destination permissions in the provider account before testing. The app validates sender syntax, not regulatory approval. See [Twilio Sri Lanka guidance](https://www.twilio.com/en-us/guidelines/lk/sms) and [alphanumeric registration](https://www.twilio.com/docs/trust-hub/registrations/alphanumeric-sender-id).

Use an approved test recipient you control, enable that patient's preferences and trigger one fresh notification. Check both application history and the provider console/receiving device. The user confirmed Gmail receipt on 14 October; Twilio receipt and live rendering of the new email templates remain unverified. SMTP acceptance alone is not evidence that email reached an inbox. The live recipient allowlist is deliberately enforced for this project; it is not an unrestricted bulk messaging service.

## Delivery states and recovery

| State        | Meaning                                                                   |
| ------------ | ------------------------------------------------------------------------- |
| `queued`     | Stored and waiting for the worker, or a bounded retry                     |
| `processing` | Atomically claimed by a worker                                            |
| `simulated`  | Local preview; no external message sent                                   |
| `accepted`   | Provider accepted the request; receipt not confirmed                      |
| `delivered`  | Twilio reported delivery; does not prove the person read it               |
| `failed`     | Explicit provider rejection or exhausted safe retries                     |
| `skipped`    | Preference, account, destination, transport or recipient approval changed |
| `unknown`    | Outcome uncertain; check provider records before any manual action        |

The worker processes up to 20 queued jobs per batch and runs at startup and every five seconds without overlapping its own batches. Atomic claims prevent simultaneous workers sending the same job. It rechecks active account, opt-in, captured destination, transport and approved recipients immediately before sending. Delivery history masks recipient addresses; provider IDs and credentials are not exposed through the UI.

Explicit temporary SMTP rejections and Twilio rate limits retry at most three attempts with backoff. Timeouts, ambiguous provider failures and interrupted processing are marked `unknown` rather than automatically resent. Processing older than two minutes is considered interrupted. SMS acceptance is checked through authenticated Twilio API polling, at most once a minute per job; after 24 hours without confirmation it becomes `unknown`. SMTP remains `accepted`: bounce/read webhooks are not implemented.

Stop all writers, including reminder and delivery workers, before backups. A restored archive may contain queued messages that were sent after the backup. Start restored environments with both transports `local` or `off`, reconcile delivery records with the provider, and only then consider enabling live transports. Database deduplication cannot guarantee exactly-once external delivery across a crash or restored backup. There is no automatic resend button for uncertain jobs.

## Verification and boundaries

Server integration tests cover role-scoped aggregates, Sri Lanka date boundaries, reversal arithmetic, socket origin/session/recipient isolation, committed versus rolled-back notifications, logout revocation, outbox deduplication, concurrent claims, changed preferences, interrupted jobs and mocked provider adapters. Browser tests exercise charts for all four roles, mobile layout, opt-in previews and a notification arriving before the periodic refresh interval.

Recorded 9 October: **102 server tests and 24 browser tests passed**, including the two new connectivity browser scenarios. Lint, production build, formatting, whitespace checks and the production dependency audit passed (zero reported vulnerabilities). Desktop and 390px mobile screenshots were inspected; local API health and frontend startup were verified.

Twilio delivery and hosted load testing remain pending. Gmail receipt was subsequently confirmed by the user on 14 October. The 13 October completion pass adds password recovery, patient account deactivation, doctor timeline and report exports. Targeted Firefox/WebKit checks and a local API benchmark are recorded in [verification](verification.md); these do not establish full device coverage or production load behaviour. Hospital settings were added in the [subsequent settings phase](hospital-settings.md). The original interim PDF is unchanged.

Implementation references: [Socket.IO middleware](https://socket.io/docs/v4/middlewares/), [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/), [MongoDB change streams](https://www.mongodb.com/docs/manual/changestreams/), [Recharts](https://recharts.github.io/en-US/api/), [Nodemailer local transport](https://nodemailer.com/transports/stream), [Twilio Message API](https://www.twilio.com/docs/messaging/api/message-resource).
