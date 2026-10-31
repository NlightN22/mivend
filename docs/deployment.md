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
| `server`        | yes      | API, scheduler is NOT here (worker-only).                                       |
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
- `SEARCH_BACKEND` is required (no default): `internal` needs `COMPOSE_PROFILES=internal-search`, otherwise the workers log a failed Elasticsearch bootstrap; `external` needs `SEARCH_SERVICE_URL` and `SEARCH_SERVICE_API_KEY`.
- **Optional** variables have the default shown in the example file.
- Dead variables removed from the example: none were read by code; missing ones added
  (`INSTANCE_ID`, `RABBITMQ_URL`, `S3_*`, `GARAGE_RPC_SECRET`, search, `INTEGRATION_*`).

## Operations

- **Frontends** re-resolve the `server` address every 10 s (nginx `resolver`), so recreating `server` needs no frontend restart.
- **Health**: `server` is checked on `/health`; postgres, rabbitmq, garage, elasticsearch have
  native checks; others depend on them (`service_healthy`). Every service has
  `restart: unless-stopped`.
- **Limits**: memory limits for server, workers and postgres are variables (`*_MEM_LIMIT`).
- **Logs**: `json-file`, 10 MB x 5 files per service.
- **Kafka TLS**: put the CA file in `KAFKA_TLS_DIR` (mounted at `/run/kafka-tls`) and set `INTEGRATION_KAFKA_CA_PATH=/run/kafka-tls/<file>`.
- **First deploy**: `make prod-up` (starts postgres/rabbitmq/garage, creates the photo bucket and key,
  runs migrations, starts the rest).
- **Upgrade**: set `IMAGE_TAG`, pull, `make prod-up`. It runs `migrate` (plain, forward-only) before
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

`SITE_NAME` is the mail sender display name, the logo name (its mark letter is the first character) and the page title of the storefront (`SITE_NAME`) and manager portal (`SITE_NAME manager portal`). The default is `Shop` (one place: this line); it is required in production with `EMAIL_TRANSPORT=smtp` (a missing value fails boot). Forbidden: quotes (`"` and `'`), line breaks and `< > & $ ; \` (`&` stays forbidden because the title is injected as raw HTML). `SITE_FAVICON_URL` is the icon of the storefront, manager portal and Vendure dashboard: an `http(s)://` URL or a `/path` (for example one served from `/assets/...`) without spaces, quotes or `$ ; { } \ < >`; unset keeps the built-in icon. The server validates it on boot and fails on a bad value. The dashboard title is set by Vendure's own dashboard code and is not configurable without changing core, so the dashboard takes only the favicon (its whole `<link>` tag is replaced, so any icon type works).

Mechanism: the frontend images are static nginx images; nginx rewrites the built `index.html` with `sub_filter` (title, icon and the `<meta name="site-name">` tag the portals read at runtime through `readSiteName` in the UI kit; no `VITE_*` build value) (in each `nginx.conf.template`) and the stock nginx envsubst fills the values from the container env at start. The only extra piece is `infrastructure/docker/nginx/15-site-identity.envsh`, run by the nginx entrypoint before envsubst: a bad `SITE_NAME` or `SITE_FAVICON_URL` falls back to `Shop` or the built-in icon (with a log line) instead of breaking the generated config. No mounted folder: one published image serves any name and icon; change the env value and recreate the containers. `sub_filter` drops Content-Length/ETag/Last-Modified, so `index.html` is served whole on every request. Set both in the compose env file (`infrastructure/docker/.env.production.example`; quote values with spaces, the Makefile sources that file in a shell); a favicon change may need a hard reload because browsers cache icons. Anchors the substitution depends on are checked by `apps/server/src/__tests__/unit/site-identity-anchors.test.ts` (the dashboard anchor is checked against Vendure's own `index.html`; the built `dist` is not available to `make test`).

### Mail languages, header and footer

Each mail type has one template per language: `apps/server/static/email/templates/<type>/body.<lang>.hbs` (`en`, `ru`), picked by `LanguageTemplateLoader` from the `emailLanguage` template variable, which every handler sets. The plugin's own loader does not look at the language (its `addTemplate` is deprecated), hence the thin loader. Subjects live in `account-email-handlers.ts`. The header shows `SITE_NAME`; the footer shows `EMAIL_FOOTER_TEXT`, or a generic per-language line when it is unset.

Language rule: the explicit `languageCode` query parameter of the Shop/Admin API request that raised the mail (`ru-RU` counts as `ru`), otherwise `SITE_DEFAULT_LANGUAGE` (`en` when unset). Vendure fills `ctx.languageCode` with the channel default when a request names none, so the query is read instead. Limits: mails raised in the background (portal activation, administrator provisioning) have no request and always use `SITE_DEFAULT_LANGUAGE`; a client that does not send `languageCode` (the current storefront and manager portal) gets the default too; there is no per-customer language. Until clients send `languageCode`, Russian mails come only from `SITE_DEFAULT_LANGUAGE=ru`, so do not hunt for an error on the host when a `ru` request still yields the default. Global template variables (`emailGlobalTemplateVars`): `fromAddress`, `siteName`, `footerText`, `verifyEmailAddressUrl`. `changeEmailAddressUrl`, used by `email-address-change`, is deliberately not defined: the storefront has no confirmation page and nothing in the repo triggers `IdentifierChangeRequestEvent` (only Vendure's built-in Shop API mutation `requestUpdateCustomerEmailAddress` could, and no client calls it), so that mail would carry a base-less `?token=` link. Define the variable together with the page before enabling the flow. Developing mails: `.claude/skills/email-templates/SKILL.md`.

Password-reset links depend on the recipient. Vendure's reset event carries only a `User`, which belongs either to an `Administrator` (staff) or to a `Customer`. `password-reset-handler.ts` looks up an `Administrator` for that user: found means staff, link `MANAGER_PUBLIC_URL/set-password`; not found means customer, link `STOREFRONT_PUBLIC_URL/set-password`. In production with `smtp` both URLs are required, otherwise boot fails. The URLs are set by hand on purpose: taking the domain from request headers would let anyone request a reset with a forged `Host` and make the victim's mail link to another site. The account-activation mail (`email-verification`) links to `STOREFRONT_PUBLIC_URL/verify` through the `verifyEmailAddressUrl` global template variable.

## First boot and duplicate superadmin (#285)

Vendure creates the superadmin in every process that bootstraps (`server`, `worker`, `worker-email`) with a
non-atomic check-then-create, and `user.identifier` is deliberately not unique (a person can be both a customer and
staff, and soft-deleted users keep their identifier). Three layers prevent two superadmins:

- `worker` and `worker-email` start only after `server` is healthy, so on an empty database the server creates the account alone.
- Each process wraps its bootstrap in `withSuperadminBootstrapLock` (`apps/server/src/superadmin-bootstrap-lock.ts`): while no active superadmin administrator exists it holds a Postgres advisory lock for the whole bootstrap; boots after the account exists skip it. This also covers dev/e2e stacks that start several processes at once.
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
