# Public hospital assistant

The public website's **Ask Smart HMS** panel helps visitors find published hospital information, doctors and appointment times. It supports English, Sinhala and Tamil, conversational follow-ups, source links, demonstration labels, loading/cancel controls and keyboard access. The existing login and dashboard designs are unchanged.

## Conversation and tools

`POST /api/public/assistant` uses the existing server-side Groq settings (`RECOMMENDATION_PROVIDER=groq`, `GROQ_API_KEY`, `GROQ_MODEL`). No additional API key or paid database service is required. It shares the Groq account quota with department recommendations.

1. The backend loads published hospital settings and active public departments. Groq returns a validated structured plan: answer from these facts, clarify, search doctors, or use a fixed medical/emergency/out-of-scope response.
2. Doctor enquiries run a read-only MongoDB search across the complete published directory, filtering by name, specialty, department or a previously displayed doctor. Four matching doctors are displayed with the total count; larger searches can be narrowed by name or specialty. Private profiles, inactive accounts and unpublished/inactive departments are excluded on each search.
3. The availability tool reads up to three future, active, unreserved slots per displayed doctor from active schedules. Dates and morning/afternoon/evening filters use Asia/Colombo. Dates must be within the booking horizon of 180 days. A missing date means the next available times. Empty results mean no matching published results, not proof that a hospital service does not exist.
4. A second bounded Groq call writes a brief explanation from the retrieved evidence. Provider failure, exhausted budget or invalid output leaves the checked cards available. Doctor identities, fees, slot times, demo labels and navigation links in cards come directly from the backend, not model-generated URLs.

General information normally uses one provider call; a doctor search uses up to two. Natural prose is AI-generated and can be mistaken; source identifiers and output structure are validated, but these checks do not prove every sentence is correct. The assistant is for visit planning, not clinical assessment or diagnosis. Treatment/medical questions receive a fixed response, and detected emergency wording bypasses the provider.

## Booking handoff

Each available-time link carries doctor, local date and slot identifiers into `/book`. The destination survives sign-in and switching between sign-in and registration. The booking page reloads availability before selecting the suggested slot. If it is no longer available, it displays a message and asks for another time. The visitor must review and explicitly confirm; the existing transactional booking endpoint remains authoritative if a slot is taken during confirmation.

The assistant cannot create or cancel appointments, send messages, read patient records or change settings. The public endpoint does not use patient authentication or account data; same-origin browser cookies may accompany the request but are not passed to Groq. Human handover, an editable FAQ knowledge base, authenticated chat actions and conversation analytics remain future work.

## Privacy and conversation context

The panel tells visitors their questions go to Groq and asks them not to share personal or medical details. Common email, phone and credential patterns are rejected before provider calls; this is not comprehensive personal-data detection. ISO appointment dates are allowed. Groq's processing and retention policies apply.

Up to two previous successful questions accompany a follow-up. A signed context token carries the previous public search filters, displayed doctor names/IDs and a short previous reply, allowing references such as “the first doctor tomorrow morning.” It expires after 30 minutes and cannot authorize any operation. Invalid or expired context cannot select an arbitrary doctor by ID. Publication is checked again during retrieval, and old context is not evidence of current facts.

Recent general conversation history is held in memory and in this browser tab's `sessionStorage`, bounded to six turns. It survives public-page navigation, browser Back and refreshes in the same tab. The launcher is available on public pages; the panel starts minimised after navigation or refresh and stays hidden on login, registration and workspace/booking pages. Reopening it restores the conversation and follow-up context. No conversation is saved to the Smart HMS database or account.

Chat interaction renews a 30-minute inactivity timer; navigating or reloading alone does not extend it. Expiry clears history and drafts, including when returning from a background tab. Clear, successful logout, authentication expiry and detection of a different account also erase the conversation. Anonymous-to-signed-in navigation preserves the current visit; returning as the same account preserves an unexpired chat. Replies arriving after a reset cannot restore cleared history.

Questions classified as private, medical or urgent are not written to browser storage. Storage is validated before restoration and malformed/expired snapshots are removed. If storage is blocked or full, navigation still works using in-memory state; full refreshes may lose it. Tab storage normally lasts for that tab, but browser restore/duplicate-tab behaviour can retain or copy it, so the explicit expiry is also checked on restoration. The privacy notice explains temporary tab storage. Existing appointment cards remain snapshots: availability is fetched again on the booking page, and confirmation still enforces slot ownership. API keys stay on the server; provider errors and chat content are not logged by the feature.

## Limits and operational notes

- Eight requests per IP per minute; two concurrent conversations per server process.
- `PUBLIC_ASSISTANT_DAILY_LIMIT=100` attempted provider calls per UTC day by default, counting both planning and synthesis. Set to `0` to disable provider calls while retaining help links.
- A shared provider deadline of at most 20 seconds per conversation and a 60-second cooldown after provider rate limiting. Database queries are separately bounded to five seconds.
- Counters and cooldown are in memory, reset on restart and are not shared across server instances. Multiple-instance production deployments need shared counters.
- Free-plan token limits may be reached before request limits. The live smoke test exercised this: retrieved doctor cards remained available when the second call was rate limited.
- Card timestamps describe a snapshot; displayed times are not held or reserved.
- A larger editable knowledge base and semantic document retrieval are not implemented in this phase; evidence comes from current structured hospital data.

## Verification

- `server/test/public-assistant.test.js`: natural replies with validated sources, privacy/medical boundaries, malformed or oversized provider output, quota/concurrency, publication and endpoint origin/rate controls.
- `server/test/public-assistant-tools.test.js`: a directory larger than 30 doctors, demo labels, no private data, publication changes, date/time filters, booked/inactive/past/closed-session exclusions, signed context tampering/expiry, degraded synthesis, call budgeting and local redirect validation.
- `server/test/public-assistant-session.test.js`: tab persistence, idle expiry, identity boundaries, late-response invalidation, bounded storage, malformed snapshots and blocked-storage fallback.
- `tests/e2e/assistant-continuity.spec.js`: navigation, login detours, browser Back, refresh, public-page/mobile access, logout/account changes, idle expiry and storage-disabled continuity.
- `tests/e2e/hospital-assistant.spec.js`: loading, cancellation/error controls, follow-up context, mobile/language/accessibility checks, doctor cards, real sign-in handoff, stale-slot rejection and explicit booking confirmation. Model replies are substituted in deterministic browser tests.
- Live Groq smoke: fictional public cardiology enquiry and “first doctor tomorrow morning” follow-up. No real appointments or messages were created.

Sinhala/Tamil translation keys and interpolation are checked automatically; language quality still needs native-speaker review.
