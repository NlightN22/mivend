---
name: test-design
description: Mandatory before writing or changing any test, or any code that changes a business flow, CQRS event, inbox/outbox, worker, scope, permission, or external contract. Produces a risk-based test plan and places each scenario at the minimum sufficient test level.
---

# Test design workflow

This is the single canonical source for how mivend tests are designed and placed. It applies to
every AI agent working in this repo (Claude, Codex, or otherwise) — if another agent's tooling
needs its own entry point, add a thin adapter file that points back here rather than duplicating
the procedure.

## When this skill is required

- A new business feature.
- A business-logic change.
- A bug fix.
- A change to a CQRS flow, an added event.
- A change to Inbox or Outbox.
- A new or changed worker.
- A scope change.
- An access-rights change.
- A change to an external contract (RabbitMQ envelope, ERP payload, webhook, GraphQL schema).
- Adding an integration or E2E test.
- Reworking existing tests.
- Investigating insufficient coverage.

## Procedure

1. Read `AGENTS.md`'s "Testing requirements" section.
2. Read `docs/testing-strategy.md` in full.
3. Read the applicable sections of `docs/testing-patterns.md` for the risks this change touches.
4. Study the use case: what behavior actually changes.
5. Identify the business invariants at stake.
6. Identify data ownership and scope (which entity, which branch/counterparty/channel boundary).
7. Identify external boundaries touched (RabbitMQ, ERP, webhook, another Vendure instance).
8. Search for existing close tests before adding new ones — reuse fixtures/factories/helpers that
   already exist rather than creating parallel ones (see "Fixtures, factories, builders" in
   `docs/testing-strategy.md`).
9. Confirm there is no unjustified duplication with what already exists at another level.
10. Produce a test plan (format below).
11. Assign each scenario the minimum sufficient level: unit, integration, component, contract, or
    E2E — see "Level selection rule" in `docs/testing-strategy.md`.
12. Define positive, negative, and edge cases for each scenario.
13. Identify concurrency, idempotency, retry, and isolation risks explicitly — do not assume they
    don't apply without checking against `docs/testing-patterns.md`.
14. Implement the tests.
15. Run targeted tests for the changed package first.
16. Run the required Makefile commands (`make test`, and `make test-int` if integration/component
    tests changed) — see the `final-check` skill.
17. Report which risks are covered.
18. Report which risks are deliberately uncovered, and why.
19. Do not treat green coverage as proof of quality — coverage is a diagnostic signal, not a goal.

## Test plan format

```text
Test plan

- Changed behavior
    - ...

- Business invariants
    - ...

- Data ownership and scope
    - ...

- Failure modes
    - ...

- Applicable patterns
    - ...

- Test placement
    - Unit: ...
    - Integration: ...
    - Component: ...
    - Contract: ...
    - E2E: ...

- Existing coverage reused
    - ...

- Deliberate omissions
    - ...
```

The test plan does not need to be saved as a separate file per use case — it can live in the
agent's report, the task description, or the PR description (see the PR template's "Test plan"
section).

## Forbidden

- Writing tests before analyzing risk.
- Adding an E2E test for every feature.
- Duplicating every unit scenario at the integration level (or any other blanket duplication
  across levels).
- Testing implementation details without a real need.
- Using snapshots for complex business logic instead of targeted assertions.
- Hiding important data inside factory defaults.
- Using `sleep` for worker or eventual-consistency waits — use direct invocation or bounded
  polling instead (see `docs/testing-strategy.md`'s "Worker testing").
- Mocking the entire component under test.
- Treating test count as a quality metric.
- Adding abstractions without real, existing repetition.
- Changing production code only to make it testable, without an architectural reason.
- Creating a parallel set of test helpers instead of using existing conventions
  (`packages/shared/src/testing/`, or the plugin's own existing factories).

## Definition of done

See `docs/testing-strategy.md`'s "Definition of done" — this skill's output (the test plan) is a
prerequisite for that checklist, not a replacement for it.
