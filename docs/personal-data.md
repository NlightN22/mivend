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
- The gate trusts the account's `verified` flag, which is weaker than the policy's "confirmed by the user": ERP-imported accounts are verified at creation and a staff e-mail change keeps the flag. Before the first sender exists, e-mail confirmation must be tied to the address (confirm on change, reset on edit) or the policy reworded.
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

Each of these must be named in the policy as a processor or a recipient of technical data, or be switched off, before the
documents are enabled.

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
