# Account recovery and account lifecycle

Implemented 13 October 2026. Password recovery uses 32 random bytes, stores a SHA-256 token digest and expires after 15 minutes. A purpose-separated AES-256-GCM key derived from the signing secret encrypts the queued token until the delivery worker processes it. The plaintext token is not stored in audit events, public responses or general delivery history. Local security-email previews use a private directory (0700) and files (0600), and are removed after expiry. Production never writes local reset previews.

Requests return the same 202 response for active, unknown, inactive and recently requested accounts. Provider work is asynchronous. A common minimum response delay reduces short lookup timing differences; it is not a formal constant-time guarantee. Existing per-IP authentication rate limits also cover recovery, and a database-enforced one-minute per-account cooldown prevents mail flooding. A new accepted request invalidates the preceding reset link.

Redemption hashes the new password with bcrypt cost 12, consumes the token in a transaction, revokes all sessions and queues a security confirmation. It does not create a new login session. A conditional user update serialises successful login against password changes/deactivation so an old verified password cannot mint a session after the account change commits. Reset and session collections are excluded from local backup/restore.

SMTP recovery emails bypass optional appointment-notification opt-in because the account holder requested recovery, but they still require the configured live transport and an explicitly allowed recipient. Ambiguous provider outcomes are not blindly retried. SMTP acceptance is not proof of inbox delivery. Without configured SMTP this local installation writes a private preview only.

As of 14 October, reset and password-changed messages use the same branded HTML and plain-text frame as [patient emails](email-notifications.md). Token expiry, one-use redemption, private preview permissions and delivery restrictions are unchanged.

Patient deactivation acquires the same patient lock used for bookings, blocks any Scheduled/Waiting/In Consultation visit, changes account state and revokes sessions/reset links in one transaction. The administrator supplies a reason. Records are preserved; reactivation restores access. Departments use a revision check and shared write lock with doctor assignment; deactivation is blocked until all doctors are reassigned. Public profiles default to private.

Login success/failure stores the validated Express request IP. Forwarded headers are honoured only under the configured single trusted proxy deployment. Administrators can see login IPs for 30 days; a worker removes expired IP fields while preserving event identity, action, timestamp and target. The audit viewer has no mutation API. This is an application access guarantee, not a claim that a database superuser cannot alter data.

Reference: [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). CSV export quotes fields and prefixes potentially executable spreadsheet formulas; see [OWASP CSV Injection](https://community.owasp.org/attacks/CSV_Injection). Exported data should remain within the administrator's authorised handling process.
