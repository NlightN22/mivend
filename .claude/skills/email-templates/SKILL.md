---
name: email-templates
description: Mandatory before adding or changing any transactional email (EmailPlugin handler, template, subject, header/footer, mail language) in apps/server. Covers template layout, adding a language, how the language is chosen, template variables, viewing a mail locally and the required tests.
---

# Email templates

Hard rule: every email template is created in at least two languages (`ru` and `en`) from the start. A new mail type without both variants is not done; `email-language.test.ts` fails the build when a registered handler lacks one.

## Layout

- `apps/server/static/email/templates/<type>/body.<lang>.hbs`, one file per language; `<type>` is the `EmailEventListener` name.
- `partials/header.hbs` and `partials/footer.hbs` are shared. Start a body with `{{> header title="..." }}` and end it with `{{> footer defaultFooter="..." }}`; the footer shows `EMAIL_FOOTER_TEXT` when set, else `defaultFooter`.
- Handlers: `account-email-handlers.ts` and `password-reset-handler.ts`, all registered in `email-handlers.ts` (`createEmailHandlers`). Do not use Vendure's stock handlers: their subjects are English.

## Language

- Supported languages: `EMAIL_LANGUAGES` in `email-language.ts`; `LanguageTemplateLoader` reads `body.<lang>.hbs` for `templateVars.emailLanguage` and falls back to `en`.
- Chosen by `resolveEmailLanguage(event.ctx, fallback)`: the explicit `languageCode` query of the request, else `SITE_DEFAULT_LANGUAGE` (default `en`, invalid value fails boot). Background mails have no request and use the default.
- Every handler must set `emailLanguage` in `setTemplateVars` and take its subject from `EMAIL_SUBJECTS` by that language.
- Adding a language: add the code to `EMAIL_LANGUAGES`, a subject per mail, and a `body.<lang>.hbs` per type; the guard test lists what is missing.

## Variables

Global (`emailGlobalTemplateVars` in `email-config.ts`): `fromAddress`, `siteName`, `footerText`, `verifyEmailAddressUrl`. `changeEmailAddressUrl` (used by `email-address-change`) is not defined yet: no storefront page and no flow triggers that mail; do not invent a URL. Per-mail variables come from the handler's `setTemplateVars`/`loadData`. Handlebars escapes `{{ }}` output.

## Viewing a mail locally

Start the stack with `make dev` (never by hand) with `EMAIL_DEV_MAILBOX_ENABLED=true`, trigger the mail, open `/mailbox` on the server. To see a language, send `?languageCode=ru` on the triggering API request, or set `SITE_DEFAULT_LANGUAGE=ru`.

## Tests

Follow `test-design`. Unit tests in `apps/server/src/__tests__/unit/email-language.test.ts` render each mail with the real Handlebars/MJML generator in every language (subject, site name, footer, link) and cover language fallbacks. Extend its tables for a new mail or language. Run `make test`; e2e specs find mails by the English subject.

The e2e stack env must not set `SITE_DEFAULT_LANGUAGE=ru`: e2e specs find mails by the English subject.
