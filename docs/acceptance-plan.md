# Acceptance and language review

Prepared 13 October 2026. This is an executable checklist for future human evaluation, not a record of participants or a claim of clinical validation. Use synthetic records. Record browser, device, date, participant role, task time, observed errors, outcome and reviewer comments for every scenario. Keep identifying participant information outside the repository.

| Scenario                          | Expected outcome                                                                                      | Human result                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Patient registration and login    | User registers without assistance; identity validation is understandable                              | Not yet conducted                                                                         |
| Find and book a doctor            | Selected doctor/date/time and LKR fee are understood; one booking created                             | Not yet conducted                                                                         |
| Cancel and reschedule             | Cancellation reason is clear; failed reschedule preserves original booking                            | Not yet conducted                                                                         |
| Reception walk-in and arrival     | Existing patient search prevents duplicates; check-in reaches doctor queue                            | Not yet conducted                                                                         |
| Doctor consultation               | Assigned history and allergies are reviewed; completion publishes the correct record and bill         | Clinician review required                                                                 |
| Prescription revision             | User understands immutable notes and retained prescription versions                                   | Clinician review required                                                                 |
| Payment record and reversal       | Staff distinguish recorded receipts from actual money movement                                        | Not yet conducted                                                                         |
| Public publishing                 | Administrator approves only intended hospital/service/doctor information                              | Not yet conducted                                                                         |
| Patient deactivation              | Open-visit conflict is understandable; historical records remain available                            | Not yet conducted                                                                         |
| Account recovery                  | Actual approved mailbox receives link; expiry, reuse and session sign-out work                        | Live SMTP test pending                                                                    |
| Email and SMS                     | Approved recipients receive opted-in updates; provider delivery state is reconciled                   | Gmail receipt confirmed by user 14 Oct; detailed-template inbox rendering and SMS pending |
| Sinhala and Tamil                 | Native readers check all interface text, clinical wording, truncation and screen-reader pronunciation | Language review pending                                                                   |
| Keyboard and assistive technology | Core workflows are usable with keyboard and target screen reader                                      | Manual accessibility review pending                                                       |
| Deployment and recovery           | Real domain HTTPS, monitoring alerts and remote restore succeed                                       | Hosting/storage setup pending                                                             |

Automated checks supplement these reviews. Chrome, Firefox and WebKit tests are engine checks on Linux; they are not proof of Safari on Apple hardware, Microsoft Edge on Windows, or representative user acceptance. Add those actual devices to the release record.

The rule-based department guide only accepts English symptom descriptions. Sinhala/Tamil translations apply to the interface, not free-text clinical interpretation. Ask bilingual reviewers to check the warning copy against the original English. Do not infer clinical accuracy from a passing software test.
