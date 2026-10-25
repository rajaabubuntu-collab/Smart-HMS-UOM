# Public hospital assistant

The homepage has an **Ask Smart HMS** button in its bottom-right corner. Visitors can ask about booking, reception hours, contact details, published departments and doctors. The panel supports English, Sinhala and Tamil, suggested questions, loading/cancel controls and follow-up questions.

## How answers work

`POST /api/public/assistant` uses the existing server-side Groq configuration (`RECOMMENDATION_PROVIDER=groq`, `GROQ_API_KEY` and `GROQ_MODEL`). No additional API key is needed. These requests share the Groq account's quota with department recommendations.

Groq selects up to three relevant fact identifiers from the published hospital information. The server validates those identifiers and returns the corresponding approved facts. It does not display arbitrary model-generated answers. Published hospital settings and active, public directory entries are loaded for each request; draft settings and private staff information are excluded. The assistant includes up to 30 departments and 30 doctors, with links to the complete directory when the requested information is absent.

Booking, records and notification answers explain the existing workflows and link to the relevant pages. The assistant cannot make bookings, send messages or access patient records. Medical questions receive a fixed response directing the visitor to appropriate help; emergency wording receives an emergency-care message. This feature is hospital navigation help, not clinical assessment.

## Privacy and availability

The panel explains before submission that questions are sent to Groq and asks visitors not to include personal or medical details. Common email, phone-number and credential patterns are rejected before calling Groq; this is not a comprehensive personal-data detector. Up to two previous successful information questions accompany a follow-up. Conversations remain in component memory, are not written to the Smart HMS database or browser storage, and disappear when cleared, reloaded or leaving the homepage. Groq's own processing and retention policies still apply.

Controls protect the shared API quota:

- Eight requests per IP address per minute.
- Two concurrent Groq calls per server process.
- `PUBLIC_ASSISTANT_DAILY_LIMIT=100` attempted Groq calls per UTC day by default; set it to `0` to disable AI calls while keeping help links available.
- A provider timeout of at most 20 seconds and a 60-second cooldown after a Groq rate-limit response.

The daily counter, concurrency control and cooldown are in memory. They reset on server restart and are not shared between multiple server instances. A production deployment with multiple instances needs shared counters. Groq may impose lower request or token limits. Provider failures and exhausted limits show published contact/booking links rather than raw provider errors.

## Verification

`server/test/public-assistant.test.js` covers approved-fact selection, input privacy patterns, medical boundaries, provider failures, quota controls, publication filters and endpoint protections. `tests/e2e/hospital-assistant.spec.js` covers the panel, follow-ups, loading/errors, keyboard use, mobile sizes, three languages and accessibility checks.
