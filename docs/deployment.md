# Production deployment

How the stack is laid out and run in production. Contour model and migrations:
`docs/environments.md`. Measured figures: `docs/deployment-sizing.md`. The request text for
administrators: `docs/ops-request.md`.

## Process layout

One compose file (`infrastructure/docker/docker-compose.yml`) deploys either role; the role is the
env file (`INSTANCE_TYPE`/`INSTANCE_ID`), never a different file.

| Service         | Required | Notes                                                                           |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `postgres`      | yes      | Stock `postgres:16-alpine`; ICU locale set at first init via `POSTGRES_INITDB_ARGS`. |
| `rabbitmq`      | yes      | Stock image; hub/branch sync transport, the app declares its own queues.         |
| `garage`        | yes      | S3 storage for product photos; bucket and key created by `make prod-init-storage`. |
| `migrate`       | yes      | One-shot, runs before the rest; never at app boot.                              |
| `server`        | yes      | Shop API, ERP callbacks and the host port; scheduler is NOT here (worker-only). |
| `server-admin`  | yes      | Same image; Admin API for the manager portal and the dashboard (`API_TARGET`).  |
| `worker`        | yes      | Job queue and scheduled tasks (Kafka consumer/outbox on central).               |
| `worker-email`  | yes      | Dedicated email queue, isolated from `worker` via `activeQueues`.               |
| `storefront`    | yes      | Customer portal (nginx, static bundle, proxies `/shop-api`).                    |
| `manager`       | yes      | Manager portal (nginx).                                                         |
| `dashboard`     | optional | Vendure Dashboard for staff; skip with `up -d <services>` if not needed.        |
| `elasticsearch` | optional | Only for `SEARCH_BACKEND=internal` (`COMPOSE_PROFILES=internal-search`).               |

Central vs branch: same images and file. Central additionally sets the `INTEGRATION_*` variables
(the ERP exchange runs only there, `INTEGRATION_KAFKA_ENABLED=true`); a branch leaves them unset
and talks only to central through RabbitMQ sync. Run one compose project per instance.

## Configuration

Time zone: every app container gets `TZ` from `.env` (compose default `UTC`; the release owner sets it, and the host zone, to the business zone). Stored timestamps are zone-independent: the server reads and writes `timestamp` columns as UTC whatever `TZ` is. Only wall-clock scheduling follows `TZ`: the daily session reset and native cron tasks such as `contract-proforma-cleanup`.

Everything is in `infrastructure/docker/.env.production` (copy `.env.production.example`, which
lists every variable as required or optional). `make prod-up` passes it via `--env-file`.
Nothing is configured inside a container by hand.

- **Required** variables use `${NAME:?...}`: compose refuses to start without them. The server
  additionally refuses a `COOKIE_SECRET` starting with `change-me`, the dev-token importer, the
  card stub and every REST/dev surface in production.
- **Secrets** are passed only as environment from that git-ignored file (or the deploy
  pipeline's secret store); no image contains one. The app images are built with the registry
  token as a BuildKit secret (`--secret id=npmrc`), which never reaches a layer.
- `INSTANCE_NUMBER_CODE` (exactly 3 digits, unique per instance) is required: the server refuses to boot without it.
- `SEARCH_BACKEND` is required (no default): `internal` needs `COMPOSE_PROFILES=internal-search`, otherwise the workers log a failed Elasticsearch bootstrap; `external` needs `SEARCH_SERVICE_URL` and `SEARCH_SERVICE_API_KEY`. `SEARCH_END_USER_ID_SECRET` (any random string) keys the per-shopper id sent to search-service; without it no id is sent. `SEARCH_MAX_OFFSET` (default 1900) caps the shop `skip` on both backends.
- **Optional** variables have the default shown in the example file.
- Dead variables removed from the example: none were read by code; missing ones added
  (`INSTANCE_ID`, `RABBITMQ_URL`, `S3_*`, `GARAGE_RPC_SECRET`, search, `INTEGRATION_*`).

## Operations

- **Frontends** re-resolve the `server` address every 10 s (nginx `resolver`), so recreating `server` or `server-admin` needs no frontend restart.
- **Health**: `server` is checked on `/health`; postgres, rabbitmq, garage, elasticsearch have
  native checks; others depend on them (`service_healthy`). Every service has
  `restart: unless-stopped`.
- **Limits**: memory limits for server, `server-admin` (`SERVER_ADMIN_MEM_LIMIT`), workers and postgres are variables (`*_MEM_LIMIT`).
- **Logs**: `json-file`, 10 MB x 5 files per service.
- **Kafka TLS**: put the CA file in `KAFKA_TLS_DIR` (mounted at `/run/kafka-tls`) and set `INTEGRATION_KAFKA_CA_PATH=/run/kafka-tls/<file>`.
- **First deploy**: `make prod-up` (starts postgres/rabbitmq/garage, creates the photo bucket and key,
  runs migrations, starts the rest).
- **Upgrade**: set `IMAGE_TAG`, pull, `make prod-up`. A frontend-only release pins just `STOREFRONT_IMAGE_TAG`, `MANAGER_IMAGE_TAG` or `DASHBOARD_IMAGE_TAG` (empty = follows `IMAGE_TAG`); server, `server-admin`, workers and `migrate` always follow `IMAGE_TAG`. It runs `migrate` (plain, forward-only) before
  the new server starts; if it fails the command stops and the old containers keep running. `server` and the workers also `depends_on` the completed `migrate`, so even a plain `up -d` or a host reboot never boots them against an unmigrated schema.
- **Heavy migrations**: stop the workers, run the `migrate` service alone (`docker compose run --rm migrate`)
  before `up -d`. The purge migration `1791537000000` deletes retired-stream inbox rows in batches of 50k and can take
  long on a large inbox. The 16 MiB consumer fetch needs the 2 GB worker limit (about 165 MB idle observed).
  Consumer-group offsets of retired topics are not cleaned automatically: list the groups with
  `kafka-consumer-groups.sh --list` and delete the stale ones with `--delete --group <group>` (or delete the
  retired topics' offsets) on the broker side.
- **Containers run as root** (server images ship Chromium for PDFs; nginx master processes are root as in the
  official image). Accepted for the first deployment; hardening to a non-root user is a follow-up.
- **Search**: `SEARCH_BACKEND` and `COMPOSE_PROFILES` must agree (`internal` needs the `internal-search`
  profile; `external` must not have it). Elasticsearch needs `vm.max_map_count>=262144` on the host.
- **Passwords** go into URLs: use hex or alphanumeric values only (`openssl rand -hex 16`).
- **Backups** (volumes `postgres-data`, `garage-data`, `document-pdfs`, `rabbitmq-data`):
    - postgres: `make prod-backup` nightly (dump into `./backups`, copy it off the host), `make prod-restore-check` loads the latest dump into a scratch database;
    - garage and `document-pdfs`: stop-free file copy of the volume (`docker run --rm -v <vol>:/v -v $PWD:/b alpine tar czf /b/<vol>.tgz -C /v .`);
    - rabbitmq holds only in-flight sync messages; back it up only if a branch is offline.
    - Restore is tested by loading the dump into a scratch postgres before it is trusted.
- **Scheduled off-host backup** (`infrastructure/backup/`, copy it to `<stack dir>/backup`): borgmatic in Docker
  dumps Postgres (read-only role `backup_ro`) and archives the stack directory (compose file, `.env`, Kafka CA)
  into an encrypted Borg repository on a separate server. Setup once: put this host's `/root/.ssh/id_ed25519.pub`
  into the borg account, then run `BORG_HOST=… BORG_ACCOUNT=… APPRISE_URL=… BACKUP_HOSTNAME=… backup/backup.sh`.
  It generates the passphrase into `backup/.env` (copy it to a password manager; it is excluded from the archive),
  creates the repository and runs the first backup. Prove a backup by extracting the dump from the archive and
  running `pg_restore --list` with the image's `pg_restore`. `monitoring/install-host-check.sh` adds an hourly
  disk (>80%) and memory (<500 MB) alert mailed through the same container. Garage objects and `document-pdfs`
  are not in the archive: they are re-created from the ERP events.

## Email

`EMAIL_TRANSPORT` is mandatory in production (`smtp`, or `file` for a contour that sends no mail); unset fails `server` and `worker-email` on boot. With `smtp`, set `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_SECURE` (`starttls` or `tls`), `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`, `EMAIL_FROM_ADDRESS` (all required, no defaults) and `SITE_NAME` (required in production, see below). `EMAIL_FROM_NAME` no longer exists; the sender name is `SITE_NAME`. Copy the mailbox password between env files on the host, never through chat or the repo. Check: restart both services, trigger a password reset to a real mailbox, open its link on `/set-password`.

### Site name and favicon

`SITE_NAME` is the mail sender display name, the logo name (its mark letter is the first character) and the page title of the storefront (`SITE_NAME`) and manager portal (`SITE_NAME manager portal`). The default is `Shop` (one place: this line); it is required in production with `EMAIL_TRANSPORT=smtp` (a missing value fails boot). Forbidden: quotes (`"` and `'`), line breaks and `< > & $ ; \` (`&` stays forbidden because the title is injected as raw HTML). `SITE_FAVICON_URL` is the icon of the storefront, manager portal and Vendure dashboard: an `http(s)://` URL or a `/path` (for example one served from `/assets/...`) without spaces, quotes or `$ ; { } \ < >`; unset keeps the built-in icon. The icon set (`shop-icon.svg`, `favicon.ico`) lives in `infrastructure/brand/`; on a host where the edge nginx serves `/brand/favicon.ico` from a directory, replace that file with `infrastructure/brand/favicon.ico` (clients cache it for a day); to roll back, restore the previous version of that file from git history. The server validates it on boot and fails on a bad value. The dashboard title is set by Vendure's own dashboard code and is not configurable without changing core, so the dashboard takes only the favicon (its whole `<link>` tag is replaced, so any icon type works).

Mechanism: the frontend images are static nginx images; nginx rewrites the built `index.html` with `sub_filter` (title, icon and the `<meta name="site-name">` tag the portals read at runtime through `readSiteName` in the UI kit; no `VITE_*` build value) (in each `nginx.conf.template`) and the stock nginx envsubst fills the values from the container env at start. The only extra piece is `infrastructure/docker/nginx/15-site-identity.envsh`, run by the nginx entrypoint before envsubst: a bad `SITE_NAME` or `SITE_FAVICON_URL` falls back to `Shop` or the built-in icon (with a log line) instead of breaking the generated config. No mounted folder: one published image serves any name and icon; change the env value and recreate the containers. `sub_filter` drops Content-Length/ETag/Last-Modified, so `index.html` is served whole on every request. Set both in the compose env file (`infrastructure/docker/.env.production.example`; quote values with spaces, the Makefile sources that file in a shell); a favicon change may need a hard reload because browsers cache icons. Anchors the substitution depends on are checked by `apps/server/src/__tests__/unit/site-identity-anchors.test.ts` (the dashboard anchor is checked against Vendure's own `index.html`; the built `dist` is not available to `make test`).

### Mail languages, header and footer

Each mail type has one template per language: `apps/server/static/email/templates/<type>/body.<lang>.hbs` (`en`, `ru`), picked by `LanguageTemplateLoader` from the `emailLanguage` template variable, which every handler sets. The plugin's own loader does not look at the language (its `addTemplate` is deprecated), hence the thin loader. Subjects live in `account-email-handlers.ts`. The header shows `SITE_NAME`; the footer shows `EMAIL_FOOTER_TEXT`, or a generic per-language line when it is unset.

Language rule: the explicit `languageCode` query parameter of the Shop/Admin API request that raised the mail (`ru-RU` counts as `ru`), otherwise `SITE_DEFAULT_LANGUAGE` (`en` when unset). Vendure fills `ctx.languageCode` with the channel default when a request names none, so the query is read instead. Limits: mails raised in the background (portal activation, administrator provisioning) have no request and always use `SITE_DEFAULT_LANGUAGE`; a client that does not send `languageCode` (the current storefront and manager portal) gets the default too; there is no per-customer language. Until clients send `languageCode`, Russian mails come only from `SITE_DEFAULT_LANGUAGE=ru`, so do not hunt for an error on the host when a `ru` request still yields the default. Global template variables (`emailGlobalTemplateVars`): `fromAddress`, `siteName`, `footerText`, `verifyEmailAddressUrl`. `changeEmailAddressUrl`, used by `email-address-change`, is deliberately not defined: the storefront has no confirmation page and nothing in the repo triggers `IdentifierChangeRequestEvent` (only Vendure's built-in Shop API mutation `requestUpdateCustomerEmailAddress` could, and no client calls it), so that mail would carry a base-less `?token=` link. Define the variable together with the page before enabling the flow. Developing mails: `.claude/skills/email-templates/SKILL.md`.

Password-reset links depend on the recipient. Vendure's reset event carries only a `User`, which belongs either to an `Administrator` (staff) or to a `Customer`. `password-reset-handler.ts` looks up an `Administrator` for that user: found means staff, link `MANAGER_PUBLIC_URL/set-password`; not found means customer, link `STOREFRONT_PUBLIC_URL/set-password`. In production with `smtp` both URLs are required, otherwise boot fails. The URLs are set by hand on purpose: taking the domain from request headers would let anyone request a reset with a forged `Host` and make the victim's mail link to another site. The account-activation mail (`email-verification`) links to `STOREFRONT_PUBLIC_URL/verify` through the `verifyEmailAddressUrl` global template variable.

## Sign-in protection (#278)

Five layers, none of them a single point of failure.

1. **Proxy caps (nginx).** A coarse limiter for well-behaved clients; the application throttle (layer 2) is the control.
   Two caps per client address: (a) the portals send every sign-in, password-reset and second-step request to
   `/shop-api?auth=1` or `/admin-api?auth=1`, and only marked requests count towards 30 requests a minute (burst 10); the
   mark is chosen by the client, so a script can simply omit it; (b) a blanket cap on all of `/shop-api` and `/admin-api`
   that does not depend on the mark: 30 requests a second, burst 100 (the Dashboard container uses the same numbers on
   `/admin-api`, since it cannot mark requests). Both answer `429`. The numbers are an estimate, not a measurement: a portal
   page load issues a handful to a few dozen API calls, spread over seconds, so normal use stays well below the
   blanket cap; an office sharing one address is the case to watch, so check the `429` count in the access log after a
   rollout. The portal containers take the client address from `X-Real-IP`, which the host proxy sets from its own
   `$remote_addr` (a client-supplied value is overwritten), and only from peers inside `TRUSTED_PROXY_CIDR` (default
   `172.16.0.0/12`, the docker bridge range; set it to the proxy's network if it differs). Without a trusted proxy in front the
   direct address stays. Without this every client shares the bridge gateway's bucket. The range covers the whole bridge, so
   keep every portal `*_BIND_ADDRESS` on `127.0.0.1`: a publicly bound port would let a client send its own `X-Real-IP`.
2. **Per-account throttling (server).** Failures are counted per login and per login plus client address in the
   `sign_in_throttle` table (hashed keys, atomic upserts on the database clock). From the threshold on the account is locked
   for `BASE_LOCK` seconds, doubling with each further failure up to `MAX_LOCK`; there is no permanent lock, and nothing is
   counted while locked. A locked, unknown and existing login get the identical `InvalidCredentialsError`, and a locked login
   is refused even with the right password. A success clears the counters. Covers the password step, the second step, the
   password re-check and recovery requests, on both APIs and the Dashboard. Stale counters are purged hourly.
   The password step tries an advisory lock on the login plus client address inside the request transaction before it checks the
   counters and holds it through the password check and the failure record. It never waits: a concurrent attempt on the same
   login from the same address is refused at once with the same answer as a wrong password and is not counted, so one
   address holds at most one pool connection per login and at most the threshold of its parallel guesses reach the password
   check. The owner on another address is never refused as busy. Residual risk: a distributed source can still occupy the
   login plus address slots from many addresses and refuse the owner now and then; that is bounded by the proxy caps, the
   per-login ceiling and the CAPTCHA demand below, and every lock lapses on its own. (The
   second step, recovery and the password re-check already run under the per-user lock). Trade-off against lockout abuse:
   the hard lock on login plus address is low (5), while the per-login counter over all addresses is only a high ceiling
   (50, same max lock) because anyone can drive it for a victim; below the ceiling it works through the CAPTCHA, which is
   demanded once any counter of that login reaches `SIGN_IN_CAPTCHA_AFTER_FAILURES`. Without CAPTCHA keys the ceiling is the
   only cross-address protection, and a determined attacker can lock a known login for at most the max lock at a time. The
   second-step lock (per account, from the login+address threshold of wrong codes) does not block the e-mail recovery link:
   recovery completion uses its own password re-check counter.
3. **CAPTCHA (adaptive).** After `SIGN_IN_CAPTCHA_AFTER_FAILURES` failures of a login the portals load the widget script and
   show the widget, and send its token in the `X-Captcha-Token` header; `signInCaptchaRequirement(login)` tells them when and
   returns the site key, script URL and widget global name from configuration. The script loads only after that threshold, from
   `CAPTCHA_SCRIPT_URL`, so the provider's host belongs on the consent/cookie and third-party list (#272, #268). A token is
   single use: the portals drop it after every request that carried it. A missing or rejected token counts as a refused attempt;
   an unreachable verify endpoint never blocks (warning in the log). Off when `CAPTCHA_PROVIDER` is empty. The Dashboard
   cannot show the widget: a Dashboard sign-in for a login past the failure count is refused until the counter expires. Another
   provider implements `CaptchaProvider` in `packages/plugins/sign-in-protection`.
4. **fail2ban (host).** Example files in `infrastructure/fail2ban/`: a filter matching `429` on the Shop/Admin API in the
   access log, and a jail with escalating bans. Complement only; copy and enable them by hand on the host whose log holds the
   real client address.
5. **Breached passwords.** With `PASSWORD_BREACH_CHECK_ENABLED=true` a new password (registration, change, reset, administrator
   create) is checked against a k-anonymity range service at `PASSWORD_BREACH_API_URL` (`GET <url>/range/<prefix>`); only the first 5 characters of the SHA-1 leave the server. A
   confirmed hit is rejected with `PASSWORD_BREACHED`. At a successful sign-in the password in hand is checked once; a hit sets
   `User.customFields.passwordChangeRequired` and the portals send the user to the password change (cleared by any new
   password). The forced change is a UI redirect and a notice only, not an API gate: the session works until the user changes
   the password. The sign-in lookup is one call per successful password step with no cache, so it adds up to
   `PASSWORD_BREACH_TIMEOUT_MS` to a sign-in when the service is slow. A failed lookup is skipped with a warning and retried at the next
   sign-in or change; a sign-in waits for the lookup for at most `PASSWORD_BREACH_TIMEOUT_MS`.

| Variable | Required | Default | Meaning |
| --- | --- | --- | --- |
| `SIGN_IN_THROTTLE_ENABLED` | no | `false` (set `true` in `.env.production.example`) | Layer 2 on or off. |
| `SIGN_IN_THROTTLE_LOGIN_IP_THRESHOLD` | no | `5` | Failures of one login from one address before the lock. |
| `SIGN_IN_THROTTLE_LOGIN_THRESHOLD` | no | `50` | Ceiling of failures of one login from any address before the lock. |
| `SIGN_IN_THROTTLE_BASE_LOCK_SECONDS` | no | `30` | First lock; doubles per further failure. |
| `SIGN_IN_THROTTLE_MAX_LOCK_SECONDS` | no | `900` | Longest lock. |
| `SIGN_IN_THROTTLE_RESET_AFTER_SECONDS` | no | `3600` | A counter without a failure for this long restarts; must be at least the max lock. |
| `SIGN_IN_TRUSTED_PROXY_HOPS` | no | `2` | Proxies in front of the server (counted from the right of `X-Forwarded-For`). |
| `SIGN_IN_CAPTCHA_AFTER_FAILURES` | no | `3` | Failures before the widget is required. |
| `CAPTCHA_PROVIDER` | no | empty | `widget` enables the CAPTCHA; then the five variables below are required (wrong or partial values fail boot). |
| `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET_KEY` | with provider | empty | Public key rendered into the widget; secret sent only to the verify endpoint. |
| `CAPTCHA_SCRIPT_URL`, `CAPTCHA_VERIFY_URL` | with provider | empty | Widget script loaded by the portals; verify endpoint called by the server. |
| `CAPTCHA_WIDGET_GLOBAL` | with provider | empty | Name of the global object the script defines (`render`/`remove`). |
| `PASSWORD_BREACH_CHECK_ENABLED` | no | `false` (set `true` in `.env.production.example`) | Layer 5 on or off. |
| `PASSWORD_BREACH_API_URL` | when the check is on | empty | Base URL of the range service. |
| `PASSWORD_BREACH_TIMEOUT_MS` | no | `3000` | Lookup timeout. |

A wrong value fails boot. Local, branch and staging-integration contours keep both switches `false` so tests and e2e can sign
in repeatedly and never call the network; the throttle itself is covered against a throwaway server by the access suite.

## First boot and duplicate superadmin (#285)

Vendure creates the superadmin in every process that bootstraps (`server`, `worker`, `worker-email`) with a
non-atomic check-then-create, and `user.identifier` is deliberately not unique (a person can be both a customer and
staff, and soft-deleted users keep their identifier). Three layers prevent two superadmins:

- `worker` and `worker-email` start only after `server` is healthy, so on an empty database the server creates the account alone.
- `server`, `server-admin` and both workers wrap their bootstrap in `withBootstrapLock` (`apps/server/src/bootstrap-lock.ts`): a Postgres advisory lock held until the process finished booting, so processes boot one after the other and roles and defaults are never written twice at once. A waiting process logs "Waiting for another process to finish bootstrap" and fails after `BOOTSTRAP_LOCK_TIMEOUT_MS` (default 300000, below the roughly 390 s after which a server is reported unhealthy). The workers also wait for both servers to be healthy. If the lock connection drops mid-boot the process exits. Measured on a throwaway full stack with the 0.0.50 images and an empty database: both servers healthy about 20 s after start, one waiting on the lock for the other (a shop-originated notification reached a subscription on `server-admin` through LISTEN/NOTIFY). A production-sized database boots slower, so `start_period` stays 240s until a real prod boot is recorded.
- `server-admin` runs the same image on the same database; the manager portal and dashboard point `API_TARGET` at it, the storefront and ERP callbacks stay on `server`. Live notifications cross the two through Postgres `LISTEN/NOTIFY` (`PgPubSub`, channel `mivend_notification`), not process memory; a payload must stay under 8000 bytes. The push is best-effort: it is sent before the caller's transaction commits (a subscriber can briefly see a notification for a row that is not visible yet, or one that gets rolled back), it is lost while a listener reconnects (about a second), and a failed push is logged without failing the caller; clients refetch the list.
- The `notification-cleanup` scheduled task (worker, daily 03:00) deletes read and resolved notifications after `NOTIFICATION_RETENTION_READ_DAYS` (default 90) and unread ones after `NOTIFICATION_RETENTION_UNREAD_DAYS` (default 365), in batches of 1000.
- Process-local caches (access scope, branch assignment, facets and similar) are per process: an admin change made through `server-admin` reaches the shop process when its cache entry expires, not instantly. Vendure's session cache (24 h) behaves the same way, so deactivating a customer ends their session in the shop process only after that TTL.
- Connections: each of `server`, `server-admin`, `worker` and `worker-email` holds a pool of `DB_POOL_SIZE` (default 10) plus one `LISTEN` connection, so about 44 at most (plus one short-lived lock connection per booting process) against Postgres's default limit of 100. Any process that publishes a notification keeps its `LISTEN` connection, workers included.
- Scheduled tasks (`DefaultSchedulerPlugin`) and the Kafka consumer run only in the workers; the RabbitMQ sync consumer runs in both servers and deduplicates by `SyncProcessedEvent`.
- Migration `1791535000000-administrator-email-unique` adds a partial unique index on `administrator."emailAddress"` (active rows only). It refuses to run and lists the ids if an active duplicate already exists.

If the migration reports a duplicate (or two identical superadmins exist), keep the lowest ids and delete the extra
account in this order, in one transaction (`:uid` and `:aid` are the extra user id and administrator id; find them with
`SELECT a.id, a."userId", a."emailAddress" FROM administrator a WHERE a."deletedAt" IS NULL ORDER BY a."emailAddress", a.id`):

```sql
BEGIN;
DELETE FROM session WHERE "userId" = :uid;
DELETE FROM user_roles_role WHERE "userId" = :uid;
DELETE FROM authentication_method WHERE "userId" = :uid;
DELETE FROM administrator WHERE id = :aid;
DELETE FROM "user" WHERE id = :uid;
COMMIT;
```

Delete `history_entry` rows with `"administratorId" = :aid` first if the delete reports a foreign key violation.

## Release step: filter-mode discount documents (#296)

Before the release, count what is off. These discount documents are stored inactive and never applied until the step below:

```sql
SELECT count(*) FROM discount_setup WHERE "inactiveReason" = 'product-filter';
SELECT count(*) FROM retro_bonus_rule WHERE "inactiveReason" IN ('product-filter', 'counterparty-filter');
```

On first start after the release the server reclassifies these rows once (migration `1791539000000` creates the term
tables). Retro-bonus rules are fixed in place. A discount document cannot be rebuilt (its recipients were never stored while
it was inactive), so an evaluable one becomes `awaiting-redelivery` and **stays off until the ERP resends it**. Resend them
through Integration Service replay, 200 ids per call (`REPLAY_MAX_IDS`):

```sql
SELECT "erpId" FROM discount_setup WHERE "inactiveReason" = 'awaiting-redelivery';
```

```bash
curl -X POST "$INTEGRATION_SERVICE_BASE_URL/api/resync/v1/replay" \
  -H "X-Api-Key: $INTEGRATION_SERVICE_API_KEY" -H 'Content-Type: application/json' \
  -d '{"aggregateType":"discountSetup","sourceSystem":"'"$INTEGRATION_RESYNC_SOURCE_SYSTEM"'","entityIds":["<erpId>", "..."]}'
```

A replayed event gets a new event id, so the inbox stores it as a new row (the inbox dedupes on stream plus event id only) and
the handler runs again. The stored version is reset to `0`, so any delivered version applies and the row turns active.
This path is covered by `setup-documents-inbox.int.test.ts`; that Integration Service issues a new event id for a replay is
documented behaviour, not asserted by mivend tests. Verify afterwards that the first query returns 0 and that no row is left
in `awaiting-redelivery`; rows that stay there were not resent or were rejected for another reason (`inactiveReason`).

Rows stored inactive for a reason mivend later stopped enforcing (e.g. `quality`) need the same resend: first reset them with
`UPDATE discount_setup SET "sourceVersion" = '0', "contentHash" = '' WHERE "inactiveReason" = '<reason>'`, then replay their ids.
Afterwards `count(*)` for that reason must be 0.

## Release step: price entries keyed by product ERP id (#297)

Migration `1791540000000` re-keys `product_variant_price_entry` from the variant id to the product ERP id. Before the
release, record the counts:

```sql
SELECT count(*) FROM product_variant_price_entry;
-- rows the migration will delete: variant gone, or its product has no ERP id
SELECT count(*) FROM product_variant_price_entry e
  LEFT JOIN product_variant pv ON pv.id::varchar = e."variantId"
  LEFT JOIN product p ON p.id = pv."productId"
 WHERE p."customFieldsExternalid" IS NULL;
-- failed price events waiting for replay
SELECT count(*) FROM integration_inbox_event WHERE stream = 'price' AND status = 'failed';
```

Order: **migrate first, then replay the failed price events** in batches (the new code stores a price without its
product, so the replay no longer fails on a missing product):

1. Deploy and let the migration run. Where two variants of one product both had an entry for a price type, the migration
   keeps the row with the newest `updatedAt` (higher id on a tie). Check that the new entry count equals the old count
   minus the deleted rows minus the duplicates.
2. Re-queue the failed `price` inbox rows from their stored payloads through the existing replay path, in batches (a few
   thousand rows at a time), waiting for the inbox to drain between batches. Price-type events must already be processed;
   a row whose price type has not arrived retries on its own.
3. A remainder that stays `failed` after a full pass is not a missing product any more: read its `last_error`; usually the
   price type is unknown (resend the price-type stream) or the payload is malformed. Do not re-queue it in a loop.
4. Verify: failed price rows are 0 (or explained), and the entry count is about products-with-prices x price types.
   Orphan entries (a price for a product the ERP never sends) stay and are counted; that is intended.

`down` is lossy: it restores `variantId` from the lowest variant id of each product, so all but the lowest variant of a
multi-variant product lose their entry. The ERP models one variant per product, so this is normally a no-op.

## Release step: schema drift realignment (#302)

Migration `1791544000000` is mostly metadata-only (index and FK renames, a redundant index drop). Two statements are heavy
on the `order` table and take an exclusive lock for their duration; run the release outside peak hours:

- four string custom-field columns narrowed from `varchar` to `varchar(255)` (a table rewrite; fails loudly if a value is longer);
- the partial unique index on `customFieldsErporderid` replaced by a full unique constraint (one index build; NULLs stay unlimited).

Both are reversible by `down`. Stop the workers before the migration (the usual heavy-migration step). Before the release run `SELECT max(length(col))` over the four columns of `"order"` and check that `customFieldsErporderid` has no duplicate non-NULL values; the migration fails loudly otherwise. Check the time on a copy of the production data first when `order` has more than a few hundred thousand rows.
