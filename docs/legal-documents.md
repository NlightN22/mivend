# Legal documents

The `legal-documents` plugin owns the public policy page, the user agreement, the personal data consent, the optional
marketing consent and the log of who accepted what. Nothing of it lives in the storefront or the session code.

## Documents

| Kind | Public page | Asked at sign-in | Blocks sign-in |
| --- | --- | --- | --- |
| `policy` | `/legal/policy` | no | no |
| `agreement` | `/legal/agreement` | yes | yes |
| `personal-data-consent` | `/legal/personal-data-consent` | yes | yes |
| `marketing-consent` | `/legal/marketing-consent` | yes, once | never |

The kinds and their flags are fixed in code (`legal-kinds.ts`): the screen has one checkbox per kind. Texts are
templates in `packages/plugins/legal-documents/src/templates/` with placeholders `{{platformName}}`, `{{operatorName}}`,
`{{operatorStatus}}`, `{{contactEmail}}`, `{{contactAddress}}`, `{{portalUrl}}`, `{{jurisdiction}}`, `{{version}}`,
`{{effectiveDate}}`. Only Russian texts are bundled; another language is served the fallback (`LEGAL_FALLBACK_LOCALE`,
default `ru`) until its templates are added.

## Publishing

At every start the plugin renders the bundled templates with the `LEGAL_*` requisites (`docs/deployment.md`) and inserts
the versions that are not stored yet. With any requisite missing nothing is published and nobody is asked to accept.
A published version is immutable and its text is stored already rendered, so an acceptance always points at the exact text
the user saw. Changing a requisite or a text means a new template version (`version` + 1 in `templates/index.ts`):
`requiresReacceptance: true` asks every customer again, `false` is a minor edit that keeps earlier answers valid.

## Acceptance

- Shop API only: `legalDocument(kind, locale)` is public; `legalDocumentStatus`, `legalAcceptanceHistory` and
  `acceptLegalDocuments` need a signed-in customer and only ever touch that customer's rows. Staff have no rows.
- `legal_acceptance` is append-only: customer, kind, version, accepted, locale, portal (request origin), IP, user agent.
  Giving, declining and withdrawing are each a new row. Submitting the same state twice is a no-op (per-customer advisory
  lock); a stale version, the policy, or declining a required document is rejected.
- The storefront asks after sign-in: the router sends a customer with an unanswered required document to `/legal-consent`
  (sessions are not dropped, an existing session is asked on its next navigation). The marketing consent can be changed in
  the account settings.
- The IP is read like the sign-in throttle reads it (`SIGN_IN_TRUSTED_PROXY_HOPS`).
