# Week 7 — department and doctor guide

This is a deterministic, versioned department-navigation prototype for adult patients' non-emergency concerns. It does not diagnose, assess clinical urgency, prescribe treatment, use a trained model or claim clinically validated accuracy. The SRS allows a brief explanation instead of a confidence score (AI-004); this implementation shows matched terms and a service explanation, without invented percentages.

## Walkthrough

1. Sign in as a patient and choose **Department guide** in the sidebar or dashboard.
2. Review the non-diagnosis/emergency notice, answer the warning-sign question and enter primary symptoms, duration, optional pain level (1–10) and optional comments. Acknowledge the limitation before submitting.
3. For a synthetic `cough` example with no warning signs, an adult account can receive a General Medicine suggestion if that service is active. Results name the words that matched, explain the service and list up to six active doctors. Additional doctors are accessible through a department-filtered booking link.
4. **View times with [doctor]** opens booking with that doctor selected and their department filter set. Availability and account/department state are rechecked; the patient must still choose a slot and explicitly confirm. Symptom text is never copied into the booking reason automatically.
5. Try `rash and cough`, an unknown description, an unsupported language or a negated description: the guide asks the patient to contact reception rather than guessing between services.
6. Try a warning-sign answer or a description such as `chest pain`: routine suggestions stop and emergency-service information is shown. “Unsure”, high reported pain and words indicating severe/sudden/worsening symptoms produce a professional-review response without booking suggestions.
7. Try `ear pain` when no ENT department exists: the guide reports that the matched service is unavailable and asks the patient to contact reception. It never silently chooses a different department.

## Requirement traceability

| Requirement | Implementation                                                                       |
| ----------- | ------------------------------------------------------------------------------------ |
| AI-001      | Primary symptoms, duration, optional pain level and comments with bounded validation |
| AI-002      | Keyword-based department navigation when exactly one rule group matches              |
| AI-003      | Active doctors associated with the active matching department                        |
| AI-004      | Matched words and plain-language explanation, not a probability                      |
| AI-005      | Versioned local rules in `server/src/recommendations/rules.js`                       |
| AI-006      | Selected doctor/department carried into the existing booking workflow                |
| AI-007      | Receptionist fallback for no clear match, multiple groups or unavailable departments |

## Rule behavior and known limits

Rule version: `department-guide-1.0`.

| Group           | Canonical service          | Example matched terms                            |
| --------------- | -------------------------- | ------------------------------------------------ |
| General         | General Medicine           | cough, fever, headache, tiredness, fatigue       |
| Skin            | Dermatology                | rash, itchy skin, acne, eczema                   |
| Ear/nose/throat | Ear, Nose and Throat / ENT | ear pain, blocked ear, blocked nose, sore throat |
| Eyes            | Ophthalmology              | itchy eyes, dry eyes, watery eyes                |
| Joints          | Orthopaedics / Orthopedics | joint pain, knee pain, shoulder pain, back pain  |

- The source file contains the full alias and keyword lists. An active department must match a configured alias by normalised exact name. No departments, staff accounts or fee values are invented or seeded by this feature. Administrators continue using the existing department/staff screens.
- Input is normalised for case, spacing, apostrophes and hyphens. Fixed keywords use word boundaries; repetition does not increase confidence. These are deliberately limited English mappings, not natural-language understanding.
- Warning-sign answers and a short urgent-word list take precedence over routine matching, including words in comments. The list is not exhaustive and can miss misspellings, unusual wording, context and combinations. Urgent words are deliberately not negated automatically, so `no chest pain` still suppresses routing. The response explains this conservative behavior.
- “Unsure” suppresses booking. Pain of 8–10 and severe/sudden/worsening wording also suppress it. These are conservative application gates, not validated triage thresholds. A lower score or absence of matched warnings never certifies safety.
- Account age comes from the stored date of birth using the Sri Lanka calendar, not a client-supplied age. Under-18 accounts, missing age, and recognised pregnancy/child-context terms go to human help. This does not comprehensively detect all special clinical circumstances.
- Negation/uncertainty words and unsupported non-ASCII language go to reception. Multiple matched groups do not get ranked; no matches produce the same human-help route. A single group's match only describes recognised words and may miss other clinically important information.
- Duration is accepted and validated as required by AI-001 but does not change routing in v1. Pain is used only for the conservative review gate. These inputs are not a clinical severity model.
- Results list doctors in stable ID order, not by quality, clinical suitability or availability. Fees come from current doctor profiles. Appointment times are checked in booking; booking transactions still reject inactive doctors/departments, conflicts and past slots.
- Raw symptoms, comments, pain and duration are processed transiently and not persisted in a recommendation collection, patient record, browser storage or notification. Audit entries contain only actor, outcome and rule version. The browser clears stale results when inputs change.
- This prototype needs clinician-led rule review, language/accessibility evaluation and safety validation before real patient deployment. It is not an emergency detection system and should not be represented as improving triage accuracy based on these software tests.

## Source rationale

The sources below support broad service descriptions and the emergency information. They do **not** validate this application's matching rules, pain threshold, age cutoff or clinical performance. Clinical service rules are illustrative engineering choices for the academic scope.

- [1990 Suwa Seriya FAQ](https://www.1990.lk/faq/): official Sri Lankan emergency ambulance contact.
- [London Ambulance Service: when to call emergency services](https://www.londonambulance.nhs.uk/our-services/emergency-care/calling-999/): examples of potentially life-threatening symptoms. UK contact numbers are not used in the Sri Lankan UI.
- [NHS: heart attack](https://www.nhs.uk/conditions/heart-attack/) and [shortness of breath](https://www.nhs.uk/symptoms/shortness-of-breath/): source rationale for warning language; no treatments from these pages are implemented.
- [NHS: stroke symptoms](https://www.nhs.uk/conditions/stroke/symptoms/): face/speech warning signs.
- [East Lancashire Hospitals: Dermatology](https://elht.nhs.uk/services/dermatology-service): skin service scope.
- [North Tees and Hartlepool: ENT](https://www.nth.nhs.uk/services/ear-nose-throat/): ear, nose and throat service scope.
- [County Durham and Darlington: Ophthalmology](https://www.cddft.nhs.uk/services/ophthalmology): eye service scope.
- [South Tyneside and Sunderland: Trauma and orthopaedics](https://www.stsft.nhs.uk/find-service/trauma-and-orthopaedics): bone/joint service scope.

## Validation and environment repair

The suite now includes 69 API/integration tests and 15 browser tests. New coverage includes safety-response precedence, comments, ambiguity, negation, word boundaries, invalid/forged inputs, age from the profile, non-persistence of raw text, inactive services/doctors, safe directory fields and successful guide-to-booking hand-off. Browser checks cover fallback, emergency output, input-change reset, invalid doctor links and a 390px viewport.

During testing, MongoDB exited with `Too many open files` at the container's inherited 1,024-file limit. Compose now explicitly sets soft/hard `nofile` limits to 64,000 following [MongoDB's guidance](https://www.mongodb.com/docs/manual/reference/ulimit/) using [Compose service ulimits](https://docs.docker.com/reference/compose-file/services/#ulimits). The existing named data volume was retained. No host-wide limits were changed. Interrupted disposable tests were rerun after recovery.

Run `npm test`, `npm run test:e2e`, `npm run lint`, `npm run build` and `npm run format:check`. Screenshots are stored under `.local/screenshots/department-guide-desktop.png` and `department-guide-mobile.png`.

Next planned work: patient feedback, followed by reports and audit viewing.
