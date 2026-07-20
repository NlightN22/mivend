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
