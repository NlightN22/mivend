---
name: lint-warnings
description: Use when `make lint` reports warnings of a rule on the checked list, or before a release. Rules for fixing a warning, the exceptions list, and the check script.
---

# Lint warnings

The accepted warnings live in one file: `eslint-rules/lint-exceptions.json` (`checkedRules`, and `exceptions` with rule, file, reason). `checkedRules` is the set of rules that must have zero warnings outside the list; it starts with `locks/no-raw-advisory-lock` and grows when other debt (explicit return types, max-comment-lines) is closed. Other warnings are not gated yet.

## Working a warning

1. Fix the cause first (for the lock rule: `withAggregateLock`, or `tryLockAggregate` for a try-lock that must not wait; `docs/concurrency.md`).
2. Never silence a warning with `eslint-disable`, and never edit the exceptions list on your own. A new exception needs the owner's agreement in the chat: ask, quote the file and the reason, wait for the answer.
3. An agreed exception is one entry with a reason a reader can verify.

## Check

    pnpm exec eslint . --no-inline-config -f json -o lint.json
    node eslint-rules/check-lint-exceptions.mjs lint.json

`--no-inline-config` is required: an `eslint-disable` comment would otherwise hide the warning from the check.

Exit code 0 and the line `lint exceptions: 0 unlisted warning(s) ...` mean every checked-rule warning is on the list. Any other result fails the check. Delete `lint.json` afterwards (do not commit it).
