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

2. **`make dev` is not idempotent.** Before calling it, check
   `pgrep -f "ts-node-dev|tsc -b|tsc --watch|vite" | wc -l`. If non-zero, something is
   already running — do not call `make dev` again on top of it. Investigate first
   (is it healthy? is it yours or the user's?).

3. **`make up`** (Docker infra only: postgres, redis, rabbitmq, elasticsearch) is safe
   to call repeatedly — it does not restart already-running containers.

4. **Never call `make down` (or `docker compose down`, or kill Docker containers
   directly) without first checking whether a `make dev` stack is currently relying on
   that infra.** Check `pgrep -f "ts-node-dev|tsc -b|tsc --watch|vite"` first. If dev
   processes are running that you did not start yourself in this exact task, assume
   they belong to the user (or another task) and treat the Docker infra as **shared and
   off-limits to tear down** — even transiently. This applies in particular to:
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
   volumes**, seeded data is gone. Re-run the full seed sequence in order:
   `make seed-access-roles` → `make seed` → `make seed-approvals` (the last one
   depends on roles/administrators/`cnt-001` already existing).

## Quick reference

| Situation                                 | Command                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Start everything                          | `make dev` (only if nothing is already running)                                                                               |
| Docker infra only, safe to repeat         | `make up`                                                                                                                     |
| Stop everything                           | `make down` — only if you're sure nothing else depends on it                                                                  |
| Integration tests                         | `make test-int` — be aware it calls `make up`; do not let it (or you) call `make down` if a separate `make dev` stack is live |
| Re-seed after a volume reset              | `make seed-access-roles && make seed && make seed-approvals`                                                                  |
| Simulate an outage without touching infra | `kill -STOP <server-pid>` / `kill -CONT <server-pid>`, with explicit user go-ahead                                            |
