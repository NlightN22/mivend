---
name: final-check
description: Run final validation checks after code changes in this repository.
---

# Final check workflow

Use this skill before reporting completion after changing code, tests, package files, build config, lint config, TypeScript config, CI config, or project scripts.

## Required final checks

Run these commands from the repository root:

    make lint
    make test

After changing any plugin code, also verify TypeScript compilation:

    pnpm --filter './packages/plugins/**' build

`make lint` and `make test` do NOT check TypeScript types in plugins — ESLint runs without type-checking, and Vitest uses transpile-only mode. Only `tsc` catches type errors. If a plugin fails to build, fix the errors before reporting completion.

If integration/component tests were added or changed (per AGENTS.md's testing requirements), also run:

    make test-int

**Never invoke `vitest`/`pnpm --filter <plugin> test:integration` directly, bypassing `make test`/`make test-int`.** This machine's `docker-postgres-central-1` (the test DB) is mapped to host port 5434, not Postgres's default 5432 — port 5432 here is already occupied by an unrelated project's own Postgres container. The `TEST_DB_PORT=5434` override needed to reach the right database lives in the gitignored, machine-specific `.env.local` and is only exported because the Makefile does `-include .env.local` + `export` before running its `test`/`test-int` targets — running vitest directly in a subshell silently skips that export. The resulting `password authentication failed for user "postgres"` looks exactly like a corrupted/recreated Postgres volume, but is actually just tests connecting to the wrong container. If you ever need to run a single test file directly for faster iteration, prefix it with `TEST_DB_PORT=5434` explicitly instead of assuming the default port is correct.

## When checks may be skipped

Skip final checks only when the change is clearly documentation-only and does not affect:

- commands
- package names
- paths
- generated examples
- config examples
- CI behavior

If checks are skipped, explicitly report the reason.

## If checks fail

If any check fails:

- do not hide the failure
- summarize the failed command
- show the relevant error
- fix the issue if it is related to the current task
- rerun the failed check after fixing

## Final report

Before finishing, report:

- changed files
- checks run
- checks passed
- checks failed
- checks skipped with reason
