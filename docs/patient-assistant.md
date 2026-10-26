# Patient care assistant

The patient workspace includes a floating **My care assistant**. The public hospital assistant uses the same messenger styling but remains a separate public-information service. No private conversation is copied into the public chat store.

## Available account searches

- Appointments: reference, department, doctor, time, status and consultation fee; links open existing appointment details.
- Bills: individual charges, total, payments applied and outstanding balance; totals cover all matching bills, including results beyond the current page.
- Payments: recorded payments on the patient's own bills; reversed entries are labelled and excluded from the recorded-payment total.
- Completed consultation records and prescriptions: exactly recorded diagnosis, treatment and medication instructions. Draft notes and internal notes are excluded. These searches create the existing medical-history access audit event.
- Notifications and the patient's profile.
- Department guidance: the existing symptom guide inside the conversation, retaining age, emergency, language and cloud-consent checks. It does not diagnose or recommend medication changes.

The assistant performs no account mutations. Booking, rescheduling, cancellations, edits and payments use their existing screens and permissions. It does not search arbitrary database collections, attachments, other patients or staff records.

## AI and privacy

`POST /api/patient/assistant` requires an active authenticated patient session and the application's normal request-origin checks. A strict input schema rejects caller-supplied patient IDs, user IDs and database query objects.

Groq converts the patient's message into a validated search plan. Only the current message, previous structured search, language and current hospital date are sent. The app does not send retrieved account records, database identifiers or previous record answers to Groq. Anything a patient manually includes in a consented message is still part of that message; credential-shaped input is screened before sending.

The server derives ownership from the authenticated user for every search. Payment searches join to an owned bill. Completed records exclude drafts. Search terms are escaped literals. Results use explicit field projections, five items per page and bounded database execution. Search results are returned directly; a second model does not paraphrase clinical records or invent balances.

Account shortcuts and pagination do not call Groq or require cloud consent. Free-text account understanding requires an explicit checkbox. The symptom guide retains its separate consent for sending a symptom description. Provider errors leave shortcuts available.

The patient conversation lives only in component memory: up to six turns, retained across workspace navigation, cleared on refresh, leaving the workspace, signing out or 30 minutes without interaction. It is never placed in localStorage/sessionStorage. Public chat retains its existing separate temporary-session policy.

## Operational limits

The planner uses the existing Groq recommendation configuration (`GROQ_API_KEY`, model and timeout). It allows two simultaneous provider calls per application process, at most 20 seconds per call, and uses `PUBLIC_ASSISTANT_DAILY_LIMIT` as the configured cap for a separate patient-planner counter (default 100 calls per UTC day per process). Public assistant and symptom-guide calls have their own accounting; this is not an organisation-wide Groq quota. A 429 response starts a 60-second cooldown. The patient endpoint also permits eight requests per patient per minute. Scaling to multiple API instances requires shared quota accounting.

English, Sinhala and Tamil interface labels are provided. Natural-language account search is delegated to the model; the existing symptom guide remains limited to English descriptions. Translation completeness is automated; linguistic review is still manual.

## Scheduling and email questions reviewed alongside this change

Routine notification preferences control routine email/SMS delivery. Password-reset/security mail uses the separate recovery workflow and does not depend on routine notification opt-in; transport configuration and allowed-recipient policy still apply.

Currently administrators create and close doctor schedules, and doctors can view their schedules. Receptionists can manage appointment booking/check-in but do not publish availability. Only the assigned doctor starts a clinical consultation.

Closing a schedule with unfinished appointments is rejected. A future emergency-pause workflow should stop new bookings, retain the queue and consultation draft, record a reason and expected return, notify affected patients according to their preferences, and allow explicit rescheduling or cancellation. Emergency pause and receptionist schedule permissions were discussed, not implemented in this change.

## Verification

- Six new API/database tests cover role and ownership boundaries, explicit projections, draft exclusion, payment ownership, reversed-payment totals, date intersections, escaped search terms, pagination, consent, malformed plans and provider failure.
- Full backend suite: 207 passed.
- Real Groq smoke check used two fictional questions and an isolated synthetic patient database: unpaid balance and next appointment both returned the expected search plans (approximately 0.7–1.1 seconds).
- Browser suite: 12 passed. Tests cover public chat continuity/booking and private shortcuts, navigation, logout, idle expiry, consent, loading, embedded guidance and narrow translated layouts. Accessibility checks target serious/critical violations in the assistant panels.
