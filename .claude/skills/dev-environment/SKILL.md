---
name: dev-environment
description: Use before starting, stopping, or restarting any part of the mivend dev stack (server, storefront, manager, plugin watchers, Docker infra) — including when a page shows a network error, an admin/shop-api request fails, or a background task needs to run integration tests. Enforces AGENTS.md's "Dev process management" rules.
---

# Dev environment: Makefile only

This project's dev stack (Vendure server, worker, storefront, manager, the shared
`tsc -b --watch` plugin compiler, and Docker infra) is started, stopped, and restarted
**exclusively through the Makefile** — never through direct `pnpm`/`ts-node-dev`/`vite`
invocations, and never through ad hoc `kill`/`SIGSTOP` on individual processes, except for
the narrow, self-cleaning debugging case described below.

This rule exists because of a real incident in this project: a background task ran
`make test-int`, which starts Docker infra via `make up` and tears it down again
afterward — but a separate, already-running `make dev` stack depended on that same
infra. The teardown silently killed Postgres/Redis/RabbitMQ out from under the live
dev server, which then crashed with `database "mivend_central" does not exist` after a
manual, ad hoc restart attempt that skipped the Makefile's own DB-creation step and env
loading. The fix was entirely mechanical — `make dev` already does the right thing
(kills stale processes, waits for infra, creates the DB if missing, loads the right env
files) — the failure was going around it.

## Rules

1. **Starting the stack**: always `make dev`. Never run `pnpm --filter server dev`,
   `pnpm dev:plugins`, `pnpm --filter @mivend/storefront dev`, or a raw
   `ts-node-dev`/`vite` command directly, except for isolated single-component
   debugging — and even then, kill that process before finishing (see AGENTS.md).

2. **`make dev` is not idempotent for the same contour.** Running it twice for the
   _same_ contour (same env file — e.g. local dev twice) creates duplicate `tsc --watch`
   processes fighting over the same ports/DB. Before calling it, check
   `pgrep -f "ts-node-dev|tsc -b|tsc --watch|vite" | wc -l` — but a non-zero count by
   itself does **not** mean "don't start local dev": it can just as well mean a
   _different_ contour is already running (e.g. `make dev-staging-integration` on its
   own ports/env, per `docs/environments.md`'s contour model). Identify what's actually
   running before deciding:
    - Inspect the matched processes (`pgrep -af ...`) and check each one's env
      (`tr '\0' '\n' < /proc/<pid>/environ | grep -E '^PORT=|^INSTANCE'`) or the ports
      they're listening on (`ss -ltnp`) to tell which contour(s) they belong to.
    - **Two or more running instances of the _same_ contour** (e.g. local dev already
      up and you're about to run `make dev` again, or `make dev-staging-integration`
      already up and about to run it again) — do not start another; that's the
      idempotency violation this rule exists to prevent.
    - **A different contour already running** (e.g. staging-integration up, you need
      local dev, or vice versa) is fine to start alongside it — they run on separate
      ports/env/DBs by design and don't collide. Starting it is a normal, safe action,
      not one that additionally requires asking the user first (asking is still fine
      when genuinely unsure which case applies).
      Direct `pnpm`/`ts-node-dev`/`vite` invocations bypassing the Makefile remain
      forbidden regardless of how many contours are running — that's rule 1, a separate
      concern from this idempotency check.

3. **`make up`** (Docker infra only: postgres, rabbitmq, elasticsearch — no Redis since
   issue #128 moved the job queue off BullMQ) is safe to call repeatedly — it does not
   restart already-running containers.

4. **`make down` is NOT contour-scoped — it is one `docker compose down` against the
   single shared `infrastructure/docker/docker-compose.dev.yml`, which every contour
   (local, branch, staging-integration) uses at once.** There is no
   `make down-staging-integration` or equivalent. Concretely: `postgres-central`,
   `rabbitmq`, and `elasticsearch` are each ONE container shared by every
   contour — staging-integration doesn't get its own Postgres container, it's just a
   separate _database_ (`mivend_central_staging_integration`) inside the same
   `postgres-central` container local dev's `mivend_central` database also lives in.
   So `make down` unconditionally kills every contour's infra in one shot, including
   ones you didn't start and aren't currently working on — this is a real, live
   incident this project has already hit (a session ran `make down` to stop its own
   local contour and took out an already-running staging-integration stack with it;
   `make up` + `make dev-staging-integration` recovered it, data survived because
   `down` doesn't pass `-v`, but the staging-integration server/worker still crashed
   and had to be manually restarted). Following that incident, `make down` and
   `make dev-reset` (the `-v` variant) now **self-guard**: each refuses to run (exit 1,
   prints the offending processes) if any `ts-node-dev|tsc -b|tsc --watch|vite`
   process is still running anywhere, requiring an explicit `make down FORCE=1` /
   `make dev-reset FORCE=1` to proceed anyway. This is a safety net, not a replacement
   for judgment — **never reach for `FORCE=1` just to get past the refusal**; it exists
   for the rare case you've already confirmed (via `pgrep -af` + checking each
   process's env/port, same as rule 2's contour-identification steps) that what's
   running is stale or genuinely yours to tear down. Given all that, **never call
   `make down` without first checking whether a `make dev` stack is currently relying
   on that infra** even though the guard exists — it catches processes, not intent.
   If dev processes are running that you did not start yourself in this exact task,
   assume they belong to the user (or another task) and treat the Docker infra as
   **shared and off-limits to tear down** — even transiently. This applies in
   particular to:
    - Running `make test-int` — it calls `make up` automatically, but do **not** let it
      (or any script) end with `make down` if a pre-existing dev stack is still up.
      If `make test-int`'s own tooling tears infra down as part of its normal flow,
      that is a real conflict to flag and avoid, not something to run anyway — prefer
      running the narrower `pnpm vitest` invocation for just the integration file you
      need, or coordinate explicitly, rather than triggering a full `make down`.
    - Any cleanup step at the end of a background task/fork. Verify the pre-task state
      first (was infra already up before you touched it?) and only tear down what you
      yourself brought up.

5. **If you need to simulate a real backend outage** for testing (e.g. verifying a
   client doesn't force-logout on a network blip), prefer `kill -STOP <pid>` /
   `kill -CONT <pid>` on the specific `apps/server` worker process over killing or
   restarting anything — it's fully reversible and doesn't touch Docker infra or other
   processes. Only do this with the user's explicit go-ahead, since it's a live,
   user-visible interruption.

6. **If the stack is already broken when you arrive** (e.g. the user reports a 500
   error or a blank "Reconnecting..." banner that never resolves): diagnose the real
   cause first — check `docker ps` for missing/exited containers before assuming a code
   bug. A crashed dev server after infra loss looks identical, in the browser, to a
   real application bug. Restore via `make up` (if infra is down) then `make dev` (if
   the node processes need a clean restart) — do not hand-roll a partial restart
   (e.g. `pnpm dev` from `apps/server/` directly), since that skips the Makefile's
   `mivend_central` database-creation check and its env-file loading, producing a
   _different_, more confusing failure (`database "mivend" does not exist` — note the
   wrong DB name — instead of the real error).

7. **After any `make dev`/`make down`/`dev-fresh` cycle that recreates Docker
   volumes**, seeded data is gone. Manager-portal roles self-provision at server boot
   (issue #134, RoleProvisioningService) — no manual step needed for those. Re-run the
   rest of the seed sequence in order: `make seed` → `make seed-approvals` (the latter
   depends on administrators/`cnt-001` already existing).

## Quick reference

| Situation                                 | Command                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Start everything                          | `make dev` (only if nothing is already running)                                                                               |
| Docker infra only, safe to repeat         | `make up`                                                                                                                     |
| Stop everything                           | `make down` — only if you're sure nothing else depends on it                                                                  |
| Integration tests                         | `make test-int` — be aware it calls `make up`; do not let it (or you) call `make down` if a separate `make dev` stack is live |
| Re-seed after a volume reset              | `make seed && make seed-approvals` (roles self-provision at server boot)                                                      |
| Simulate an outage without touching infra | `kill -STOP <server-pid>` / `kill -CONT <server-pid>`, with explicit user go-ahead                                            |
