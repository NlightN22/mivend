# Personal data: what is processed, kept and shared

The bundled policy (`docs/legal-documents.md`) makes promises about retention, advertising and third parties. This page
states what the platform actually does, so the two can be compared. Re-check it when a retention rule, a message sender
or an external service changes.

## Advertising and consent

- Advertising consent is a separate, optional, never pre-ticked document (`marketing-consent`); giving and withdrawing
  are append-only rows in `legal_acceptance` with account, version, text, date, time, IP and user agent. Each row also
  keeps the customer's e-mail, phone and whether the e-mail was confirmed at that moment.
- The platform sends no advertising today. Any future sender must ask `LegalDocumentsService.mayAdvertiseByEmail`
  before every send: it is true only while the newest marketing answer is "yes", was given for the e-mail the customer has
  now, and that e-mail is confirmed. A changed e-mail therefore stops advertising until the customer consents again.
- E-mail confirmation is recorded per address in `email_confirmation` (customer, confirmed address, pending address and link token), not by `User.verified`. The gate and the `emailVerified` snapshot read it: an address counts as confirmed only when it equals the recorded confirmed one. The record is set when the customer verifies the account (set-password link), follows the address-change link, or when an already verified customer is created (ERP import); the migration backfilled it for verified customers. Customers the system creates already verified (staff-created with a password, ERP import passing a password) and the backfill are recorded as confirmed without any proof of mailbox ownership.
- When staff change a customer's e-mail (admin `updateCustomer`), the new address does not take effect: the customer row, the sign-in identifier and mail delivery keep the old address, and the new one is stored as pending in `email_confirmation`. A link is mailed to the pending address (`email-confirmation`, opens the storefront `/confirm-email?token=...` and calls the shop mutation `confirmEmailAddress`), and an in-app notification (`email-confirmation` source) tells the customer to follow it. Following the link applies the address to the customer, the user and the native sign-in in one transaction under the row lock, after re-checking that no other customer or sign-in holds it (a clash, including with a staff or administrator user that has the same identifier, fails closed and the link stays unused; the customer only sees an invalid link), records it as confirmed and resolves the notification. Saving the same pending address again sends nothing; saving the current address again drops the pending one. A customer without a sign-in, or an address core rejects as taken, goes through core unchanged. The previous address is not notified. The link has no expiry; it is stored hashed and replaced by the next change.
- Phone numbers are never confirmed (no SMS channel, no phone verification exists), so no advertising may go to a phone.
  Adding SMS means building phone confirmation and its own gate first.
- Service messages (order status, password, security) are not advertising and do not depend on the consent.

## Retention actually enforced

| Data | Rule in the code or on the server |
| --- | --- |
| Sessions | expire after `SESSION_DURATION` (30 days) and are removed by Vendure |
| Change journal (who changed what) | `change-journal-cleanup` task, 365 days |
| Notifications | `notification-cleanup` task, per-source days (default 90 read/365 unread; portal popups 7/30) |
| Web server access log | rotated daily, 14 files |
| Container logs | json-file, 5 files of 10 MB |
| Inbox/outbox payloads, job records, acting-session tickets | not reviewed for customer contacts; each has its own cleanup task, retention not compared with the policy |
| Acceptance history | kept: it is the proof of consent |
| Database backups | `infrastructure/backup/config/prod.yaml`: 30 daily, 12 weekly, 12 monthly, 2 yearly |
| Orders and documents | kept for the contract and limitation periods; no automatic deletion |

There is no automatic deletion or anonymisation of a closed customer account. It is done on request, see below.

## Third parties that receive technical data

- The mail server is the operator's own; the search service runs on the operator's own host.
- The sign-in challenge widget (after repeated failures) loads a script from the provider set in `CAPTCHA_SCRIPT_URL`;
  the provider sees the visitor's IP address and browser data.
- Map and address providers (`GEO_*`) receive what the visitor types into an address search and the visitor's IP address
  from the browser.
- The policy names the statutes and the law directly; the `LEGAL_JURISDICTION` requisite only fills the agreement and the consent.
- Fonts are served from our own origin; no font host is contacted.

The policy lists their hosts, derived from `CAPTCHA_SCRIPT_URL` and `GEO_PROVIDERS`; a new provider declares its hosts in the geo registry next to its factory. Only the captcha script host is listed; the widget may call other hosts of the same provider, and the map host is the default one (a host override in the browser settings is not reflected).

## Requests from a subject

Within the legal term (check the current statute, 10 working days for access and deletion requests at the time of
writing) the operator answers from the contact e-mail:

1. Access: export the customer, orders, `legal_acceptance` rows and change-journal rows of that customer.
2. Withdrawal of advertising: the customer does it in the profile; staff may append a `marketing-consent` row with
   `accepted = false` on request.
3. Deletion or anonymisation after access ended (a manual procedure, no tool exists yet; the policy promises it): replace name, e-mail, phone and the sign-in identifier of the customer and
   user with neutral values, deactivate the user, delete sessions. Keep orders, documents and acceptance rows for the
   periods in the policy (the row stays linked to the customer id, which is not personal data on its own).
4. Backups age out by the schedule above; the policy states this.

## Obligations outside the code

- Notify the supervisory authority of the processing before it starts, unless an exemption applies, and keep the
  notification in step with the real purposes and the data kept; this is the operator's own filing.
- The sign-in consent boxes use a simple electronic signature as the acceptance (user agreement, section on orders);
  keep the contract wording and the acceptance record consistent.
