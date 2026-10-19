# Local AI department guide

Smart HMS now supports model-based department navigation through local Ollama. It integrates a pretrained model; this project does not train a model or claim clinical validation. The original rule engine remains a labelled fallback and evaluation baseline. This extends the interim report's rule-based v1 requirement (AI-005) without rewriting the original requirement.

## Local setup

Install Ollama using its [Linux instructions](https://docs.ollama.com/linux), start its service, and download the tested instruction model:

```bash
ollama pull qwen3:4b-instruct-2507-q4_K_M
```

Set these entries in the private project `.env`, then restart the API:

```dotenv
RECOMMENDATION_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b-instruct-2507-q4_K_M
OLLAMA_TIMEOUT_MS=45000
```

For the existing local development service, restart with `systemctl --user restart smart-hms-dev.service`. Otherwise restart `npm run dev`. Changing `.env` alone does not reliably restart Node's watch process. Set `RECOMMENDATION_PROVIDER=rules` and restart to use the original guide exclusively. No frontend environment variable or API key is needed.

Sign in as a patient and open **Department guide** (`/recommendations`). The introduction shows **AI-assisted department guide** when configured. A completed model result shows **AI-assisted guidance**, evidence quoted from the description, an authored service explanation, and real doctor booking links. The header indicates configuration, not a successful model health check. Individual results identify their actual source.

Use synthetic descriptions for demonstrations, for example `I have been coughing for two days`. A possible department is a navigation suggestion, not confirmation that booking is safe. Model output and timings vary.

## Request flow and boundaries

1. Authenticate the patient, validate bounded input and calculate age from the stored profile. Apply the existing warning-sign, high-pain, age, pregnancy/child-context, negation, uncertainty and English-only gates before contacting AI. Multiple known rule groups also bypass AI. These gates are deliberately limited and cannot detect every emergency or unsafe input.
2. Read active departments from MongoDB. Offer only the 18 supported adult prototype service groups in `departments.js`; see [the demo catalog](ai-demo-directory.md). Paediatrics and Obstetrics & Gynaecology remain directory-only services for staff-assisted care. The five original keyword groups remain the rule fallback. An unsupported department is never invented or substituted for an unavailable known service.
3. Send symptoms, comments, duration and optional pain level to the local `/api/chat` endpoint. Do not send account identity, date of birth, contact details, records, credentials or doctor profiles. The model receives separate instructions and a structured patient-data message. User text is untrusted input; prompting is not a complete defence against semantic manipulation.
4. Require a JSON schema with `decision`, a directory-constrained `departmentId`, and at most three verbatim evidence excerpts. Validate again on the server, including completed generation (`done_reason: stop`), exact directory membership, evidence presence in the description and cross-field consistency. Reject extra diagnosis/treatment fields, tool calls, malformed, oversized and truncated responses. Schema checks establish shape and grounding, not clinical accuracy.
5. Display server-authored explanations tied to the chosen service, rather than unconstrained model prose. A model decision of `staff` or `review` suppresses suggestions. Disagreement with an existing single rule match also directs to staff. This decision is not replaced by a fallback booking suggestion.
6. Retrieve doctors from current active accounts and recheck department availability after inference. Fees and booking links come from the database. Booking continues to validate availability transactionally. There is no clinical ranking or invented confidence percentage.

An unavailable/busy/timed-out model or invalid output uses the existing rules and an explicit **Rule-based guidance** notice. If those rules have no unambiguous match, the patient is directed to staff. Failed AI output is never described as AI advice. Safety/scope bypasses have their own label.

## Resource and privacy controls

- The adapter permits only HTTP loopback origins, rejects cloud model names and refuses HTTP redirects. There are no external AI API calls or keys. Keep the Ollama API bound to loopback. Do not expose it publicly.
- One inference runs per API process; additional concurrent requests receive the labelled rule fallback. Each patient is limited to five guidance requests per minute. The configured timeout bounds inference; client disconnect cancels its upstream request. These are in-process controls, not a distributed inference queue.
- Context is capped at 4,096 tokens and generated output at 180 tokens, with temperature zero and five-minute model retention. CPU inference can still be slow. A timeout is not evidence that a symptom is unimportant.
- Raw descriptions, model outputs, quoted evidence and input clinical fields are not saved in MongoDB, browser storage, email/SMS or application logs. The browser holds the current result in memory. Audit logs contain actor, outcome and engine/rule version (including model tag for successful AI responses), not symptom text. Operators must also avoid adding prompt logging at the model/proxy level.
- Users can still type personal information into the free-text fields; the UI asks them to omit it, and it is processed locally. This is not automated de-identification. Ollama's local processing behaviour is documented in its [FAQ](https://docs.ollama.com/faq).
- Sinhala/Tamil navigation labels are included, but this feature accepts English clinical descriptions only. Translation review and language-specific clinical evaluation remain outstanding.
- This configuration assumes Express and Ollama run on the same host. Container loopback refers to the container itself. A public/container deployment needs a separately reviewed private inference setup; the loopback restriction should not simply be removed to use a free cloud provider.

## Verification and final-report evidence

Automated unit/API tests use mocked Ollama HTTP responses; ordinary browser tests use isolated MongoDB fixtures and do not depend on AI. They verify software behaviour, not medical accuracy. Explicit real-model browser testing uses synthetic text and a disposable database:

```bash
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npm test
EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npx playwright test tests/e2e/recommendations.spec.js
E2E_LOCAL_AI=true EMAIL_TRANSPORT=local SMS_TRANSPORT=local ALLOW_LIVE_DELIVERY=false DELIVERY_ALLOWED_RECIPIENTS= npx playwright test tests/e2e/recommendations.spec.js --grep 'local Ollama'
npm run lint
npm run build
npm run test:translations
```

The opt-in browser test calls the real configured instruction model via Express, checks AI labelling and evidence, follows the actual doctor booking link, and checks that emergency wording bypasses AI. Screenshots are saved to `.local/screenshots/department-ai-desktop.png` and `department-ai-mobile.png`. It does not create an appointment or contact real message recipients.

Verified locally on 18 October 2026: 155 backend tests passed; three deterministic recommendation browser tests and the separately enabled real-Ollama browser test passed. Lint, production build, translation-key checks and formatting of changed files passed. Desktop/mobile screenshots were inspected. The real-model smoke checks covered a skin-description paraphrase and a general-medicine paraphrase; these are functional examples, not a clinical accuracy evaluation. The build retains its existing bundle-size advisory, and the browser development proxy logged connection-reset messages during navigation without failing the tests.

Before claiming useful clinical performance, build a separate clinician-reviewed, held-out dataset of routine, ambiguous, urgent, irrelevant and adversarial examples. Compare the rule baseline with AI using the same cases. Report department agreement, incorrect routing, appropriate abstention, false reassurance, timeout rate and cold/warm latency separately. Record exact model tag/digest, prompt version (`department-ai-1.2`) and hardware. A handful of synthetic smoke tests does not establish accuracy or safety. The final report should describe pretrained-model integration and this evaluation plan, with clinician review required before real patient use.

Prompt version 1.2 clarifies everyday grammar and multiple symptoms in one stated body area, without treating uncertainty about the cause as automatic uncertainty about the directory scope. It also instructs the model to quote contiguous original wording without correcting or combining words. The server still rejects rewritten evidence, non-directory IDs and unsafe/scope-excluded requests; staff/review responses are not overridden with a forced match. Regression coverage includes the reported phrase `my nose hurt and itchy.`, vague wording and urgent accompanying symptoms.

On 18 October 2026 the live full-directory browser regression returned an AI-labelled ENT suggestion with three demo doctors for that phrase, staff guidance for `itchy`, and the safety response when breathing difficulty was added. It passed in 23 seconds after an initial run hit the existing 45-second model timeout under memory pressure. That timeout remains bounded and falls back explicitly; the prompt change does not remove hardware-related delays or establish general clinical accuracy.

Implementation references: [structured outputs](https://docs.ollama.com/capabilities/structured-outputs), [chat API](https://docs.ollama.com/api/chat), [instruction model](https://ollama.com/library/qwen3:4b-instruct-2507-q4_K_M).

## Optional automatic thinking retry

Set `OLLAMA_THINKING_MODEL=qwen3:4b` and `OLLAMA_THINKING_TIMEOUT_MS=120000` after installing that local model. Leave the model setting unset to disable the retry. Ollama's [`think` API parameter](https://docs.ollama.com/capabilities/thinking) enables reasoning on supported models; `/api/show` can verify capability. A thinking model is not a clinical validator or a guarantee of better routing.

Prompt version `department-ai-1.3` distinguishes a potentially recoverable `unclear` answer from a `staff` scope/refusal and a `review` safety response. The server retries once only for `unclear` or invalid output. It never retries a valid match, safety/scope refusal, provider outage, primary timeout, or cancelled request. Existing deterministic safety gates run before either model, and pelvic/reproductive wording gets an explicit clinician referral rather than guessing the organ or department.

Before the second pass, the server unloads the primary model to avoid holding two models in RAM. The second pass uses `think: true`, a 1,024-token output budget and a 120-second timeout, then unloads. The primary pass is bounded at 45 seconds and the unload request at five seconds. Both passes share one concurrency lock and request cancellation. Only allowlisted department IDs and exact supporting quotes from the final structured answer are accepted. Reasoning traces are never returned to patients, logged or persisted. If the retry fails, the original response/fallback is retained and labelled; no retry loop or automatic cloud request occurs.

The loading UI shows an indeterminate animation, actual elapsed seconds, the possibility of a second check and cancellation. It does not claim a percentage or actual model stage without server evidence. Reduced-motion preferences stop the animations. A completed result says when a second check was attempted.

The primary request uses Ollama's JSON-schema format. The thinking request asks for JSON in its prompt and applies that same strict schema on the server after thinking completes; the untrusted answer is never accepted merely because JSON parsing succeeds. This also avoids relying on model-specific interactions between grammar-constrained decoding and thinking. See the [Ollama structured-thinking issue discussion](https://github.com/ollama/ollama/issues/10929).

Local verification on 18 October 2026: the installed `qwen3:4b` advertises thinking support, and a short direct request returned thinking output and completed. Full-directory second-pass trials repeatedly exceeded 120 seconds on this CPU, including with a shorter prompt and without constrained decoding. Automatic retries were initially enabled locally, but no successful full-directory live thinking recommendation was established. They were subsequently disabled after the reported regression (see below). The bounded failure path preserves the original referral. A `qwen3:1.7b` download was cancelled after repeated slow transfers; it is not installed or selected. To disable the additional delay, remove `OLLAMA_THINKING_MODEL` from `.env` and restart the development service.

Mocked adapter/API tests cover switching, schema/evidence rejection, model attribution, privacy, timeout, cancellation and no override of safety/scope referrals. Browser checks passed for loading, cancellation, reduced motion, fallback labels and mobile layout. These integration checks do not establish clinical accuracy or superiority of the second model.

## Regression rollback — 19 October 2026

After the user reported worse results, the local `.env` thinking-model settings were removed, the development service restarted, and the thinking runner stopped. Version `department-ai-1.4` restores the previously tested v1.2 prompt and three-decision schema for normal single-model mode. Experimental retry instructions and the `unclear` decision are now isolated to explicitly configured retry mode. The loading animation, elapsed timer, cancellation and existing safety/scope checks remain. All 29 targeted adapter/API tests passed, including a check that normal mode makes only one call for invalid output. The cloud-provider comparison is research only; no symptom text has been sent to a cloud API and no cloud provider is connected.

For a hosted alternative, see [Groq setup](groq-ai.md). Select one provider explicitly; Groq failures do not trigger local thinking retries.
