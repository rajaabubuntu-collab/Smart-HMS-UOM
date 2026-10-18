# Public website and reception enquiries

The first public-website phase adds the following routes to the existing MERN application:

| Page              | Route              | Behaviour                                                                     |
| ----------------- | ------------------ | ----------------------------------------------------------------------------- |
| Home              | `/`                | Hospital contacts, photos, visitor guide and patient service shortcuts        |
| About us          | `/about`           | Published hospital description and visit notes, with patient journey guidance |
| Doctors           | `/doctors`         | Name/speciality search, department filter and paginated results               |
| Doctor profile    | `/doctors/:id`     | Published qualifications, speciality, consultation fee and booking link       |
| Departments       | `/departments`     | Paginated published departments                                               |
| Department        | `/departments/:id` | Published description and associated doctors                                  |
| Contact us        | `/contact`         | Published contacts, address search and general enquiry form                   |
| Website enquiries | `/enquiries`       | Receptionist/admin inbox with status filtering and updates                    |

## Managing content

Use **Hospital settings** to edit and publish approved hospital details, description and visitor notes. Existing reception hours show a single 24/7 summary when all days are open all day. Stock photographs remain credited and labelled as illustrative.

Use **Departments** to edit service descriptions and publish each department. Use **Staff** to publish individual doctor profiles. A doctor is visible publicly only when their account is active, their profile is published, and their department is both active and published. Do not publish synthetic doctors or claim services that have not been approved.

A visitor selecting **Check availability** is sent to `/book?doctor=…`. If sign-in is needed, the selected doctor survives login and switching between login and registration. Available sessions still come from the existing scheduling system; opening a profile does not reserve a slot.

## Enquiry workflow

1. A visitor opens Contact us and submits their name, email, optional Sri Lankan phone number, topic and message, with consent to reception/admin access.
2. The server stores the enquiry and returns an `ENQ-…` reference. Retrying the identical submission does not create another record.
3. Receptionists and administrators open **Website enquiries** in their workspace. They can filter enquiries, refresh the list and mark an item New, In progress or Resolved.
4. Staff follow up using their established contact process and update the status. Status changes are audited, and stale updates are rejected with a refresh prompt.

This form is for general questions, not emergencies or medical reports. Submission does not book an appointment. This phase does not automatically send email/SMS or provide an email reply composer; existing appointment notifications remain separate.

Public submission is limited to five attempts per IP per 15 minutes when rate limits are enabled, with strict input validation, same-origin checks and a hidden bot field. Visitor details are readable only by receptionists and administrators. There is no public enquiry lookup endpoint.

## Verification

- Backend coverage: `server/test/public-website.test.js` covers publication restrictions, search, whitelisted profile fields, validation, duplicate retries, access control, status conflicts, audit events and rate limiting.
- Browser coverage: `tests/e2e/public-site.spec.js` covers search/profile navigation, selected-doctor sign-in, enquiry submission through staff resolution, accessibility checks and narrow layouts in English, Sinhala and Tamil.
- Run tests with local transports and live delivery disabled. Tests create isolated databases, never publish test doctors to the development database, and never need real email/SMS credentials.
- Sinhala and Tamil interface text is included; native-speaker linguistic review is still needed. Hospital descriptions and names remain the exact content entered by administrators.

Facilities galleries, news, health packages, online lab reports and public queue displays are separate future work.

## Public-page motion

Public pages use short, one-time entrance animations for headings, photographs and information cards. Hover-capable devices also show small card lifts, clipped photo zooms and directional link feedback; FAQ answers have a brief opening transition. There are no looping decorative animations or automatic carousels.

The system/browser `prefers-reduced-motion` preference disables this motion, including when changed while a page is open. Content remains visible without IntersectionObserver, keyboard focus settles an active reveal immediately, and print output is still. Motion observers and event listeners are removed when leaving a public page. No animation package is required.
