# Hospital settings and public information

Implemented 9 October 2026. Administrators can open **Hospital settings** at `/admin/settings` to manage the information shown on the public homepage. Existing installations start with a demonstration page until an administrator publishes details; no patient, doctor, staff or provider configuration is exposed by the public endpoint.

## Editing and publication

1. Enter the hospital name, address, reception phone and optional description, public email and visitor notes.
2. Choose each day's reception hours in Sri Lanka time: closed, a single same-day interval, or **24 hours**. **Set all days to open 24 hours** supports a 24/7 hospital. These informational hours do not create or change doctor appointments.
3. Keep **Mark this as demonstration information** selected when using synthetic details. Clear it for hospital details approved for publication.
4. **Save draft**, review **Website preview**, then **Publish saved details**. Saving a draft alone leaves the public website unchanged. Publication requires a hospital name, address, reception number and at least one open day.
5. **Unpublish details** withdraws the public snapshot while retaining the saved draft. The public page returns to its demonstration state. Reload an already-open homepage to see publication changes.

Local and international Sri Lankan contact formats normalise to `+94` format. Reception may use a landline; SMS still accepts only mobile numbers. This is format validation, not verification of the number's ownership or allocation. Public email addresses are lowercased. The portal keeps its software brand; the published hospital name appears above the homepage headline and in Hospital information.

Two administrators cannot silently overwrite each other's version. A stale save, publish or unpublish returns a conflict, keeps unsaved form values and offers **Reload latest and discard my edits**. Saving, publishing and unpublishing each create a content-free audit event in the same database transaction. The published snapshot remains separate from subsequent draft edits.

## Sri Lankan defaults and limits

The supported settings are `Asia/Colombo`, `LKR` and English, shown as read-only defaults. They describe the existing scheduling/billing implementation. There is no non-working timezone, currency or language selector. Sinhala/Tamil translation, holiday exceptions, split/overnight reception periods, public doctor/service publication and logo uploads remain separate enhancements. A 24-hour day is explicit; `00:00–00:00` is not treated as an all-day interval.

Patient email/SMS opt-in lives under **Email & SMS**. SMTP and Twilio credentials stay in the private server environment and cannot be saved in hospital settings. A public email address is contact information, not an SMTP sender configuration. Publishing details neither sends messages nor deploys the app to the internet. See [connectivity setup](connectivity.md) for external delivery.

The homepage requests only an explicitly selected published projection and renders text without HTML interpretation. If that request fails, it shows an unavailable message while keeping portal navigation usable. Public responses are not cached. The settings editor does not subscribe to Socket.IO refreshes, so background events cannot replace unsaved edits.

## Details supplied for the local installation

The user supplied and approved the following on 9 October 2026. They were saved and published through the administrator API, with audit records, in the local development database:

| Field        | Published value                                     |
| ------------ | --------------------------------------------------- |
| Hospital     | Smart HMS                                           |
| Address      | Colombo 09                                          |
| Reception    | +94115279429 (supplied as 0115279429)               |
| Public email | smarthms@gmail.com (supplied as smartHMS@gmail.com) |
| Hours        | Open 24 hours, Monday–Sunday                        |

No hospital description, doctor directory or additional address detail was invented. These installation values are stored in the database; fresh checkouts have blank defaults. Public hosting and external delivery remain unconfigured.

## Validation

Server tests cover public/draft separation, administrator permissions, Origin checks, strict fields, phone normalisation, invalid hours, 24/7 publication, audit rollback, concurrent initial saves and stale publication. Browser tests cover draft/publish/unpublish, contact links, plain-text rendering, conflicting tabs, patient denial, public API failure and 320/390px layouts. The 9 October full regression run passed **110 server tests and 27 browser tests**. On 13 October, lint, production build, formatting and whitespace checks were rechecked, services were restarted, and the saved public details were verified again. Mobile settings and public-information screenshots were visually inspected.
