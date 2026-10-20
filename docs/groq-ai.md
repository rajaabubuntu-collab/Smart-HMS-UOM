# Groq department guidance

Smart HMS supports Groq as a hosted alternative to Ollama. The default model is
`openai/gpt-oss-120b`. This is department navigation for a final-year prototype,
not diagnosis, treatment or a clinically validated triage system. Existing adult,
English-language and safety/scope limits remain in place.

## Setup

1. Create a key at [Groq API keys](https://console.groq.com/keys).
2. Add these values to the **root `.env`**, keeping the key private:

   ```dotenv
   GROQ_API_KEY=your_private_key
   GROQ_MODEL=openai/gpt-oss-120b
   GROQ_TIMEOUT_MS=20000
   ```

   Do not use a `VITE_` variable, commit the key or put it in chat. `.env` is ignored
   by Git. Keep the current `RECOMMENDATION_PROVIDER` while checking the key.

3. In Groq Console, review Settings → Data Controls and enable Zero Data Retention
   if available for your account. Groq documents retention exceptions unless ZDR
   is enabled; Smart HMS cannot inspect that setting. Use fictional examples for
   project testing. See [Groq data handling](https://console.groq.com/docs/your-data).
4. From the project root run `npm run test:groq`. This makes **up to two live API
   requests**, using fictional descriptions and the prototype department directory.
   It never reads patient records or sends notifications. Both scenarios should
   report `passed: true`; this small check does not establish clinical accuracy.
5. Change the existing provider line to `RECOMMENDATION_PROVIDER=groq` and restart
   the backend. On the development machine:

   ```bash
   systemctl --user restart smart-hms-dev.service
   ```

   For a manually started `npm run dev`, stop it and start it again.

6. Refresh the patient department guide. It should show the Groq disclosure and a
   separate consent checkbox. Try the fictional demo descriptions. A successful
   cloud answer shows **Groq AI guidance**. A safety referral or rule fallback has
   its own label; neither is presented as a Groq answer.

To switch back, set `RECOMMENDATION_PROVIDER=ollama` (local AI) or `rules` (no AI),
then restart. No automatic local-model retry happens after a Groq failure.

## Request handling

- Only the backend holds the key. Requests go to a fixed Groq HTTPS endpoint;
  redirects are refused.
- The patient must explicitly consent before any description is sent to Groq.
  Server-side checks enforce this even if someone bypasses the browser checkbox.
- The payload contains department names/scopes, temporary choice IDs, and the
  submitted symptoms and optional comments. The simplified form does not ask for
  duration or a pain score. Older API clients may still supply these optional fields. It does not
  attach patient IDs, names, emails, dates of birth, medical records or doctors.
  Identifying information typed into the free-text fields would still be sent;
  the UI therefore asks users to leave it out.
- Groq receives one bounded request using low reasoning effort and strict JSON
  output. Smart HMS checks the result against active department IDs and requires
  supporting excerpts from the submitted text. Doctors and available appointments
  come from the current database, never from generated text.
- A 20-second default timeout, cancellation, a one-request concurrency guard and
  the existing five-requests-per-patient-per-minute limit bound usage. A Groq 429
  starts a shared cooldown (default 60 seconds, maximum five minutes per backend
  process). No automatic retry consumes extra credits.
- Invalid/unavailable AI responses use explicitly labelled basic rules. A valid
  AI referral to staff or a clinician is retained, not converted into a booking.
- Smart HMS does not log or persist description text, provider response bodies or
  reasoning traces. Its audit records contain outcome and model/version only.
  Groq's own data handling is governed by its account settings and terms.

The free plan has quotas; it is not unlimited. Check your account's Limits page
and [current rate-limit documentation](https://console.groq.com/docs/rate-limits).
There is no automatic paid-plan upgrade in this integration. Costs still depend
on the plan configured in the Groq account.

## Verification

Offline regression checks (fake provider, no external AI requests):

```bash
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= node --test server/test/recommendation-ai.test.js server/test/recommendation-groq.test.js server/test/recommendations.test.js
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npx playwright test tests/e2e/recommendations.spec.js
npm run lint
npm run test:translations
npm run build
```

The browser suite uses an isolated test database and mocked Groq responses. The
optional Ollama cases remain skipped unless explicitly enabled. Only
`npm run test:groq` exercises the real hosted API.

API implementation references:
[Chat API](https://console.groq.com/docs/api-reference) and
[strict structured outputs](https://console.groq.com/docs/structured-outputs).
