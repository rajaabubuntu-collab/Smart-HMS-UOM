# Notify.lk SMS setup for Smart HMS

Added 15 October 2026. Notify.lk is supported alongside Twilio and local previews. The integration uses the existing transactional outbox, patient opt-in, Sri Lankan mobile normalisation, approved recipients and masked delivery history. No live SMS is sent by the automated tests.

## 1. Get your account settings

Sign in to Notify.lk and open [Settings → API Keys](https://app.notify.lk/settings/api-keys). Copy the **User ID** and **API key** privately into the project root `.env`. Use the same sender ID that worked in your dashboard test. Notify.lk documents the case-sensitive `NotifyDEMO` sender for testing. See the [official API guide](https://developer.notify.lk/api-endpoints/).

```dotenv
NOTIFYLK_USER_ID=your_numeric_user_id
NOTIFYLK_API_KEY=your_api_key
NOTIFYLK_SENDER_ID=NotifyDEMO
```

These are server-side secrets. Do not put them in frontend/VITE variables or commit `.env`. The repository examples contain placeholders only.

## 2. Enable Notify.lk when ready to spend a credit

Change the existing SMS setting in `.env` rather than adding duplicate keys:

```dotenv
SMS_TRANSPORT=notifylk
ALLOW_LIVE_DELIVERY=true
```

Add your mobile in `+947XXXXXXXX` format to the **existing** `DELIVERY_ALLOWED_RECIPIENTS` value, separated by a comma. Keep the approved email address already there so Gmail keeps working. For example, an account whose existing approved email is `patient@example.com` and test phone is `+94771234567` would use:

```dotenv
DELIVERY_ALLOWED_RECIPIENTS=patient@example.com,+94771234567
```

Replace these example contacts with your own. Keep the current `EMAIL_TRANSPORT`, SMTP settings and Gmail App Password unchanged. For development with no real SMS, keep `SMS_TRANSPORT=local` instead; live email can remain enabled independently.

Restart this computer's managed app from the project directory:

```sh
systemctl --user restart smart-hms-dev.service
npm run health:check
```

For an installation started manually, stop `npm run dev` with Ctrl+C and start it again. Do not start a second server alongside the managed service.

## 3. Try one booking

1. Sign in to the patient account whose phone you approved.
2. In **My profile**, save that mobile number (`07XXXXXXXX` or `+947XXXXXXXX`).
3. Open **Email & SMS**, enable **SMS updates**, and save preferences.
4. Make one new appointment **more than 24 hours ahead**. This keeps the immediate test outside the reminder window.
5. Open **Email & SMS → Delivery history**. The worker normally processes it on its next five-second pass. A successful provider response shows **Accepted by provider**, with transport `notifylk`.
6. Check the phone and Notify.lk dashboard for actual receipt and credit usage. Acceptance alone does not confirm handset delivery.
7. Turn **SMS updates** off after the test to preserve credits for your viva. Use local mode for further development.

New SMS messages contain the hospital name, event-specific appointment or billing details and a next step. They omit diagnoses, medication instructions, patient names and free-text reasons. Messages target one standard SMS segment; detail fields are included only when they fit. See [SMS templates and examples](sms-notifications.md).

## Credit use and troubleshooting

Every eligible opted-in event can enqueue an SMS, including booking changes, check-in, consultation updates, billing and reminders. Completing a consultation can create both a consultation notice and a bill notice. Opt-in does not backfill old events. Changing providers skips queued jobs captured for another transport. There is no automatic resend of historical or uncertain messages.

The application does not track your provider balance or promise that one event always costs one credit; the provider determines billing and segmentation. The new templates enforce a 160-unit GSM-7 budget; check the provider dashboard for actual credit usage. No balance API call is needed to send a notification.

| History status/error              | Meaning and next step                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Local preview / `local`           | No SMS sent. Change to `notifylk` and restart only when ready.                                                                  |
| `recipient_not_approved`          | Add the exact `+94` phone to the existing allowed-recipient list and restart before a new event.                                |
| `recipient_or_preference_changed` | The account, phone or SMS preference changed before sending.                                                                    |
| `transport_changed`               | The job was queued under a different SMS provider/mode.                                                                         |
| `provider_rejected`               | Check your API credentials, sender approval, balance and provider dashboard; provider response text is deliberately not stored. |
| `provider_rate_limit`             | An explicit HTTP 429 response receives bounded backoff, up to three total attempts.                                             |
| Delivery uncertain                | The request may have succeeded. Inspect Notify.lk before triggering another message.                                            |

Notify.lk's documented send endpoint returns acceptance without a message ID or delivery-receipt endpoint. These jobs remain `accepted`; the app does not invent a `delivered` status or poll Twilio for them. Timeouts, server failures and unrecognised responses are not automatically retried. API keys are sent in the HTTPS POST body, not URL query strings. Redirects are refused and requests have a 15-second timeout.

## Verification

```sh
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= node --test --test-concurrency=1 server/test/notifylk.test.js server/test/connectivity.test.js server/test/email-content.test.js server/test/notifications.test.js
```

The Notify.lk tests use dummy credentials, mocked HTTP and a disposable database. They cover form encoding, destination conversion, response handling, transaction rollback, duplicate prevention, opt-out, changed phone/provider, allowlists, retry bounds and uncertain outcomes. They do not consume credits or verify your account's credentials.
