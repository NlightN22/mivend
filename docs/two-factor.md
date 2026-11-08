# Two-factor authentication (TOTP)

Issue #279. Plugin: `packages/plugins/two-factor`. This page is the contract for the frontends.

## Purpose and rules

The goal is to bind a person to a personal device: a login and password handed to someone else must not be enough.
Every fresh sign-in needs a one-time code from the user's own authenticator app (RFC 6238: SHA-1, 6 digits, 30 s).

- Applies to every account type: customers, managers and administrators, the superadmin included. No grace period.
- The obligation is binary and comes from `TWO_FACTOR_REQUIRED` (`true` or `false`, default `false`). Production sets
  `true`; development and integration contours keep it off.
- A user who has an active factor always needs the code, even where the obligation is off.
- With the obligation on, a user without a factor can sign in with the password only into a restricted state: no session
  exists, only the enrolment calls below work. They are forced to enrol before they get a session.
- No trusted devices: the code is asked at every fresh sign-in. Session lifetime is unchanged (`SESSION_DURATION`).
- No recovery codes. A lost device is recovered by an emailed link plus the password.
- Throttling of failed password and code attempts is not part of this issue (#278). The places are marked
  `// #278: throttle ...` in the code. The only built-in limit is five wrong guesses per challenge or recovery link.

## Where the state lives (central / branch)

Factors and tokens are rows in the instance's own database, keyed by the local `User` id. They are not synced:
accounts are mastered on the central instance (docs/architecture.md, "User identity"), and the factor rows are neither
replicated to branches nor part of the sync streams. Consequences:

- Customers and the manager portal sign in on the central instance, so this is complete for them.
- An administrator who signs in on a branch instance enrols there separately; the secret is encrypted with that
  instance's key. Replicating the factor to branches (a central-to-branch stream carrying the ciphertext, which needs
  one shared key) is a follow-up, to be done together with offline branch login if that is ever required.
- `TWO_FACTOR_REQUIRED` is per instance: switch it on a branch only when its administrators can enrol there.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `TWO_FACTOR_REQUIRED` | `false` | `true` makes the second step mandatory for every account. Any other value than `true`, `false` or empty fails boot. |
| `TWO_FACTOR_ENCRYPTION_KEY` | derived | Optional, 64 hex characters (32 bytes). When unset the key is derived with HKDF-SHA-256 from `COOKIE_SECRET`. |

The key is chosen in one place, `resolveEncryptionKey` (`src/secret-key.ts`). Without the dedicated variable, changing
`COOKIE_SECRET` makes every stored secret undecryptable: every user would have to be reset. Set the dedicated key before
the first enrolment on any contour where `COOKIE_SECRET` may ever be rotated.

Recovery links point at `<STOREFRONT_PUBLIC_URL>/two-factor-recovery?token=...` for customers and
`<MANAGER_PUBLIC_URL>/two-factor-recovery?token=...` for staff (chosen by whether the account is an administrator).

## How the second step is enforced

No session is created until password and code have both been checked:

1. The stock `native` authentication strategy is wrapped (same name). A correct password alone for an account that
   needs a second step returns `InvalidCredentialsError` with `authenticationError: "TWO_FACTOR_REQUIRED"`. This closes
   the `login` and `authenticate({ native })` mutations of both APIs, and so the Vendure Dashboard form.
2. `startTwoFactorSignIn(username, password)` checks the password and returns a short-lived challenge, never a session.
   The challenge is a random token stored only as a SHA-256 hash, valid 5 minutes (10 for the enrolment stage), bound to
   one account and one API (shop or admin).
3. The new `twoFactor` strategy takes the challenge and the code: `authenticate(input: { twoFactor: { challenge, code } })`.
   Only this strategy opens a session for such an account, through core's own `authenticate` mutation, so the session
   cookie or bearer token, `rememberMe`, the session cap and `LoginEvent` behave exactly as for a normal sign-in.
4. Core's `verifyCustomerAccount` and `resetPassword` sign the customer in right after setting the password. For an
   account that needs a second step they now end without a session (they return `CurrentUser` and no token). Both are
   replaced by the plugin's resolver for this (docs/vendure-core-divergences.md).
5. Not affected, by design: acting-as-customer sessions (the ticket is issued by an already verified manager session),
   and Vendure API keys (machine credentials, not a person's sign-in).

`packages/plugins/two-factor/src/__tests__/unit/core-assumptions.test.ts` fails if a Vendure upgrade adds another place
that opens a session. The access tests (`apps/server/src/__tests__/access/two-factor`) prove the invariant end to end.

## GraphQL contract

The same schema exists on `shop-api` and `admin-api`.

```graphql
enum TwoFactorStage { NONE VERIFY ENROL }
enum TwoFactorFailure {
  INVALID_CREDENTIALS CHALLENGE_INVALID INVALID_CODE PASSWORD_INVALID CODE_REQUIRED
  NOT_ENROLLED ENROLMENT_EXPIRED RECOVERY_LINK_INVALID
}
type TwoFactorError implements ErrorResult { errorCode: ErrorCode! message: String! failure: TwoFactorFailure! }
type TwoFactorChallenge { stage: TwoFactorStage! challenge: String expiresAt: DateTime }
type TwoFactorEnrolment { otpauthUri: String! secret: String! expiresAt: DateTime! }
type TwoFactorStatus { required: Boolean! enrolled: Boolean! method: String activatedAt: DateTime pendingEnrolment: Boolean! }

extend type Query {
  twoFactorRequired: Boolean!          # public: should the set-password and sign-in pages expect the second step
  twoFactorStatus: TwoFactorStatus!    # signed-in user: own state
}
extend type Mutation {
  startTwoFactorSignIn(username: String!, password: String!): StartTwoFactorSignInResult!
  startTwoFactorEnrolment(challenge: String, password: String, currentCode: String): StartTwoFactorEnrolmentResult!
  confirmTwoFactorEnrolment(code: String!): ConfirmTwoFactorEnrolmentResult!
  requestTwoFactorRecovery(emailAddress: String!): Success!
  completeTwoFactorRecovery(token: String!, password: String!): CompleteTwoFactorRecoveryResult!
}
# every *Result is a union of the success type and TwoFactorError
```

`TwoFactorError.message` equals `failure`. Failures: `INVALID_CREDENTIALS` (wrong password, unknown user, or a user
who may not use this API), `CHALLENGE_INVALID` (unknown, expired, used, attempts exhausted, wrong API or wrong stage),
`INVALID_CODE`, `PASSWORD_INVALID`, `CODE_REQUIRED` (changing the device needs the current code), `ENROLMENT_EXPIRED`
(no pending secret, or it expired), `RECOVERY_LINK_INVALID` (unknown, expired, used, attempts exhausted).

The second step itself is core's `authenticate` mutation. Its error is `InvalidCredentialsError.authenticationError`:

| Value | Meaning |
| --- | --- |
| `TWO_FACTOR_REQUIRED` | the password was right but the account needs the second step (from `login` / `authenticate({ native })`) |
| `TWO_FACTOR_CHALLENGE_INVALID` | challenge unknown, expired, used, exhausted or for the other API |
| `TWO_FACTOR_INVALID_CODE` | wrong or already used code (a failed try counts against the challenge) |
| `TWO_FACTOR_ENROLMENT_EXPIRED` | enrolment stage: no pending secret or it expired; start enrolment again |
| empty string | wrong password (nothing is revealed about the second step) |

### Sign-in

1. `startTwoFactorSignIn(username, password)`.
   - `stage: VERIFY` with `challenge`: ask for the code.
   - `stage: ENROL` with `challenge`: the account has no factor and the obligation is on; go to enrolment.
   - `stage: NONE`, no challenge: no second step applies (obligation off, no factor); call the normal `login`.
   - `TwoFactorError(INVALID_CREDENTIALS)`: wrong credentials.
2. `authenticate(input: { twoFactor: { challenge, code } }, rememberMe)` returns `CurrentUser` (session created, token
   in the `vendure-auth-token` header or the cookie, as for `login`) or `InvalidCredentialsError`.
   After `TWO_FACTOR_INVALID_CODE` the same challenge can be retried (five wrong tries in total), then the password
   must be entered again. A challenge works once. Spaces inside the code are ignored.

### Enrolment (first device)

1. Sign in as above; the challenge has `stage: ENROL`.
2. `startTwoFactorEnrolment(challenge: <challenge>)` returns `{ otpauthUri, secret, expiresAt }`. Show the QR code of
   `otpauthUri`, the `secret` as the manual key, and links to a few well-known authenticator apps for Android and iOS
   (one data file in the frontend). Calling it again replaces the pending secret; there is one pending secret per account
   and it expires after 10 minutes. The secret is returned only here; it is never readable afterwards.
3. `authenticate(input: { twoFactor: { challenge, code } })` with the code from the app. A valid code activates the
   factor and signs the user in in one step (and sends the "enabled" email).

A user who already has a session (the obligation was switched on while they were signed in; existing sessions are not
interrupted) enrols from the settings page: `startTwoFactorEnrolment(password: <re-entered password>)`, then
`confirmTwoFactorEnrolment(code)` which returns the new `TwoFactorStatus`. `twoFactorStatus.required && !enrolled` is the
signal to prompt them.

### Change device

Signed in: `startTwoFactorEnrolment(password, currentCode)` (both needed; `CODE_REQUIRED` / `PASSWORD_INVALID` /
`INVALID_CODE` otherwise), then `confirmTwoFactorEnrolment(code)` with a code from the new device. The old factor keeps
working until the new one is confirmed, then it is replaced ("changed" email). A challenge from the sign-in page cannot
start a replacement: it works only for an account without a factor.

### Lost device (recovery)

1. On the second-step page: `requestTwoFactorRecovery(emailAddress)`. Always answers `success: true` and sends a mail
   only if the account has a factor. The link is single use, valid 30 minutes (a newer link replaces the older), and is
   stored hashed.
2. The link opens `/two-factor-recovery?token=...` on the portal of that account type, which asks for the password and calls
   `completeTwoFactorRecovery(token, password)`. A wrong password keeps the link alive (five wrong tries). On success:
   the old factor is removed, every session of the account is closed, the owner gets the "recovery completed" email,
   and the result is a challenge with `stage: ENROL`: continue with the enrolment steps above, which also signs the
   user in.
3. There is no cooling-off delay. The extension point is the marked comment in `two-factor-recovery.service.ts`.

### Set-password pages

For an account that needs a second step, `verifyCustomerAccount` and `resetPassword` set the password and return
`CurrentUser` with an empty `channels` list and no token: do not treat that as signed in. The page should show "password
set" and send the user to the sign-in page. `twoFactorRequired` tells the page in advance. Staff passwords are set through
the existing manager set-password call, which never signed anyone in.

### Dashboard

The Dashboard form has one password field and calls `login`. For administrators, `login` on the admin API also accepts
`"<password> <code>"` (a single space before the six digits), checks both together and opens a session only when both are
right; a wrong code gives `TWO_FACTOR_INVALID_CODE`, the Dashboard shows its generic invalid-credentials message. This
works only for administrators who already have a factor and only on the admin API. An administrator without a factor
must first enrol through the manager portal (or any client built on this contract). A purpose-built second step in the
Dashboard login page is possible with a `defineDashboardExtension({ login: { beforeForm } })` component that runs the
flow above and stores the returned bearer token; it is not built. Until it is, the inline form is the supported path.

## Storage, encryption, audit

- `two_factor_factor`: one row per factor (`uuid`, `userId`, `method`, `status` pending or active, encrypted secret,
  `lastUsedStep`, timestamps). A partial unique index allows one active and one pending row per account.
- `two_factor_token`: sign-in challenges and recovery links (`uuid`, SHA-256 `tokenHash`, purpose, stage, API, expiry,
  `usedAt`, `attempts`). Expired rows are deleted by the hourly `two-factor-cleanup` task.
- Secrets: 160-bit random, base32. Stored AES-256-GCM (`v1.<iv>.<tag>.<ciphertext>`), the factor `uuid` is authenticated
  data so a ciphertext cannot be moved to another row.
- Codes: window of one step either side; compared in constant time; a step at or below the last accepted one is a replay.
  The step is claimed by one atomic `UPDATE`, so two parallel submissions of one code cannot both pass.
- Every state change of one account (enrol, confirm, sign-in step, recovery) runs under a per-user advisory lock
  (`two-factor:<userId>`), per docs/concurrency.md.
- Audit: enrolment, change, recovery requested, recovery completed and operational reset are recorded with the
  versioning plugin as entity `TwoFactor`, `entityId` = user id, action and a comment such as `two-factor enrolled`.
  Staff with a global counterparty scope can read them through `entityVersions`.
- Emails (ru and en, language chosen like the other account mails): `two-factor-enabled`, `two-factor-changed`,
  `two-factor-recovery`, `two-factor-recovery-completed`.

## Second-factor methods

`SecondFactorMethod` (`src/totp/second-factor-method.ts`) is the pluggable seam: secret creation, enrolment URI and code
verification returning an accepted counter. TOTP is the only method. An SMS method needs a delivery step before the code
is asked (a "send challenge" call) and a delivery plugin; it registers in `SecondFactorMethodRegistry` and is a follow-up.

## Operational reset

For a locked-out account nobody can recover by mail (for example the superadmin):

```bash
infrastructure/scripts/two-factor-reset.sh <account email> "<reason>"      # production, from the repository root
pnpm --filter server two-factor:reset <account email> <reason>            # development, with the server env loaded
```

It deletes the account's factor, tokens and sessions under the same advisory lock and writes the audit row. No email is
sent. The server's in-process session cache may accept a deleted token for up to `sessionCacheTTL` (300 s). The account
enrols again at its next sign-in. When the obligation is switched on, have every administrator, the superadmin first,
enrol from their existing session before the old sessions expire.

## Tests

- Unit: `packages/plugins/two-factor/src/__tests__/unit` (RFC 6238 vectors, window, replay, encryption, key derivation,
  the wrapped strategy, the set-password flows, the core tripwire).
- Integration (real Postgres): `packages/plugins/two-factor/src/__tests__/integration` (challenge lifecycle, replay,
  parallel code and challenge use, recovery, parallel confirmation and recovery, device change) and
  `apps/server/src/__tests__/integration/two-factor-reset.int.test.ts`.
- Access: `apps/server/src/__tests__/access/two-factor` boots a second server with `TWO_FACTOR_REQUIRED=true` and a mail
  worker, and proves that no route yields a session without the second step.
