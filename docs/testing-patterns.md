# Testing patterns

Catalog of recurring architectural risks in mivend and how to test each one. Consult the relevant
sections when the `test-design` skill tells you to. See `docs/testing-strategy.md` for level
definitions this catalog refers to.

Each pattern lists: when it applies, what risk it guards, minimum scenarios, preferred level,
required assertions, negative cases, common false-positive tests to avoid, an mivend example, and
exceptions.

## Data and scope isolation

**Applies to**: any operation scoped by counterparty, branch, channel, organization, department,
document, order, invoice, payment, user, or trading point.

**Risk**: an operation reads or mutates data outside its intended scope, especially when an
external id collides across scopes.

**Minimum scenarios**: only target-scope data is selected; neighboring-scope data is unchanged;
foreign records are byte-identical before/after; a global lookup does not silently substitute a
scoped one; a batch does not mix scopes; the same external id in two scopes resolves under the
correct uniqueness boundary; the unique index matches the real business uniqueness boundary.

**Preferred level**: integration (repository/query) for the raw isolation check; unit for scope
predicate logic; E2E only for the one "user sees only their branch" smoke case.

**Required assertions**: foreign-scope record snapshot equal before/after (not just row count).

**Negative case**: `scope-a/external-001` and `scope-b/external-001` both exist; operate on
`scope-a`; assert `scope-b`'s record is untouched.

**Common false positive**: asserting "N rows changed" without checking foreign-scope rows
individually — a batch that touches the wrong scope but the same row count passes silently.

**mivend example**: `counterparty.access-scope.test.ts` (`plugin-counterparty`).

**Exceptions**: genuinely global lookups (e.g. system configuration) — document why scope doesn't
apply, don't just omit the test.

## Idempotency

**Applies to**: any command or inbound event that can be retried or redelivered.

**Risk**: a repeat produces a duplicate side effect or a divergent result.

**Minimum scenarios**: repeat the command; repeat the inbound event; repeat after success; repeat
after partial failure; two different events with the same business key; the same external id in
different valid scopes; concurrent duplicate arrival; DB constraint as the last line of defense.

**Preferred level**: three separate checks at their natural levels — command idempotency (unit or
component), inbound event dedup (component, via the inbox), business-level uniqueness (integration,
via the DB constraint).

**Required assertions**: side effect occurred exactly once; second call/event is a no-op, not an
error unless the domain requires one.

**Common false positive**: only testing the happy-path single call, never actually calling twice.

**mivend example**: `plugin-acquiring`'s `IdempotencyService`/`idempotency.service.test.ts`,
`InboxService`/`inbox.service.test.ts`.

**Exceptions**: none — every async/repeatable flow needs this per rule #12/13 in AGENTS.md.

## Inbox lifecycle

**Applies to**: any consumer of an external, potentially-unreliable inbound event (webhook, ERP
callback, provider notification).

**Risk**: an event is lost, double-processed, or its processing status doesn't reflect reality.

**Minimum scenarios**: accept a valid event; durable write happens before ack; raw payload,
external event id/source/timestamp are captured; `pending → processing → processed` transitions;
processing error → retryable state with attempt count and next-retry time; `failed` after
attempts exhausted; a stuck `processing` row is recovered; two workers cannot claim the same row;
event acceptance is independent of business processing; a sweep repeat is safe; no event loss
after ack.

**Preferred level**: component (the full accept→claim→process→persist chain).

**Required assertions**: inbox row lifecycle state matches expectation at each step; claim locking
prevents double-claim (real concurrent claim, not sequential).

**Common false positive**: testing claim/process/persist in isolation without ever exercising the
actual state machine transitions end to end.

**mivend example**: `plugin-acquiring`'s `IncomingPaymentEvent` + `InboxService` +
`PaymentInboxProcessorService` + `PaymentInboxWorker`, `payment-inbox.int.test.ts`.

**Exceptions**: none — this is the mandatory shape per AGENTS.md rule #12.

## Outbox atomicity

**Applies to**: any write that must reach another instance via `sync_outbox`.

**Risk**: business data and outbox record diverge (one committed without the other).

**Minimum scenarios**: business data + outbox created in the same transaction; rollback leaves
neither; publish only happens for committed outbox rows; a failed publish does not delete the
row; republish is safe; published-state is set only after a confirmed send; concurrent publishers
don't cause uncontrolled duplicate side effects; consumer is protected against redelivery.

**Preferred level**: integration (the transaction itself) plus component (publish→ack chain).

**Required assertions**: business-data-row-exists ⇔ outbox-row-exists, checked as one atomic pair,
never independently.

**Common false positive**: asserting the outbox row exists without ever forcing a rollback to
prove the pair is atomic, not just usually-together.

**mivend example**: `payment-atomicity.int.test.ts` (`plugin-acquiring`).

**Exceptions**: none — mandatory per AGENTS.md sync rule #1.

## Ordering and versions

**Applies to**: any event stream with more than one producer or possible redelivery/reordering.

**Risk**: a stale event overwrites newer state, or delivery order is mistaken for causal order.

**Minimum scenarios**: correct order; reversed order; skipped version; replay of an old version;
concurrent versions; a late event does not clobber newer state; ordering is never inferred from
delivery timestamp; an order replica never uses last-write-wins; independent event streams are
never folded into a shared `order.updated`.

**Preferred level**: unit for the version-comparison/guard logic; component for the full
consumer chain with out-of-order delivery simulated.

**Required assertions**: final state matches the highest-version event's effect, regardless of
arrival order.

**Common false positive**: only ever sending events in the "obvious" order, never reversed or
with a gap.

**mivend example**: `ReplicaOrderInterceptor`/`ReplicaOrderProcess` (`plugin-sync`),
`replica-order.guard.test.ts`.

**Exceptions**: streams with a single producer and no redelivery risk can skip version-conflict
scenarios, but must still document why.

## Concurrency

**Applies to**: any shared resource two actors (workers, requests) can touch simultaneously.

**Risk**: lost update, double side effect, or a race that only manifests under real concurrency.

**Minimum scenarios**: two workers at once; two requests for one business operation; concurrent
creation of the same unique key; concurrent version update; no lost update; optimistic lock
respected; claim locking respected; no double side effect; safe retry after a conflict.

**Preferred level**: integration/component, using real concurrent calls (`Promise.all` racing
against the same DB row), never two sequential calls dressed up as "concurrency."

**Required assertions**: exactly one of the concurrent operations wins the unique/locked
resource; the loser's retry (if any) succeeds safely afterward.

**Common false positive**: `await a(); await b();` labeled a concurrency test — it tests nothing
race-related.

**mivend example**: `reserve-order.concurrency.test.ts` (`plugin-reservation`).

**Exceptions**: none for anything using `SKIP LOCKED`/optimistic locking/unique constraints as a
concurrency guard — the guard needs a real race to prove it works.

## Retry and recovery

**Applies to**: any worker or integration that can fail and must self-heal.

**Risk**: a transient failure becomes a permanent loss, or a retry storm never terminates.

**Minimum scenarios**: transient error; permanent error; backoff behavior; attempt limit; recovery
after worker restart; a stuck job; external system unavailable; no infinite retry; terminal
failure (dead-letter); manual retry path; recovery happens via the normal sweep, not a bespoke
recovery code path.

**Preferred level**: component, invoking sweep/claim/processor directly with controlled time.

**Required assertions**: attempt count and next-retry time update correctly; a row past the
attempt limit reaches `failed`, not an endless retry loop.

**Common false positive**: mocking the retry mechanism itself instead of exercising the real
sweep loop with a failing processor.

**mivend example**: `PaymentInboxWorker` sweep tests (`plugin-acquiring`); mirrors
`ReservationExpiryWorker`/`OutboxWorker`.

**Exceptions**: none for anything matching AGENTS.md rule #12's inbox+worker shape.

## Partial failure

**Applies to**: any multi-step write (inbox write → claim → business mutation → outbox → commit →
ack → external side effect).

**Risk**: a crash between two steps leaves inconsistent state, or a retry re-triggers an
irreversible side effect.

**Minimum scenarios**: failure after inbox write; after claim; after business mutation; after
outbox creation; before commit; after commit but before ack; after an external side effect;
before result is finalized; failure inside part of a batch.

**Preferred level**: component, simulating the failure point explicitly (throw at a specific
step) rather than hoping a real crash reproduces it.

**Required assertions**: re-running after any simulated failure point produces no duplicate, no
data loss, and no unguarded repeat of an irreversible side effect.

**Common false positive**: only testing failure at step 1, never at "after external side effect,
before local commit" — the hardest and most realistic case.

**mivend example**: candidate gap — not yet explicitly covered for `plugin-acquiring`'s payment
inbox; add during the pilot migration.

**Exceptions**: none for flows touching money or ERP state.

## Coverage, overlap and collision

**Applies to**: any date/quantity/range-based business rule (reservations, discounts, pricing
tiers, availability windows).

**Risk**: an off-by-one or boundary condition silently misclassifies a range.

**Minimum scenarios**: no overlap; touching boundaries; partial overlap left/right; full
containment; full coverage; identical ranges; open-ended range; multiple overlaps; a gap; overlap
touching only foreign-scope data; a mix of own and foreign data; a partial batch; reprocessing the
same set.

**Preferred level**: unit for the overlap algorithm itself; integration only if the boundary logic
lives in a SQL query.

**Required assertions**: no change occurs outside the target range/scope.

**Common false positive**: testing only "clearly inside" and "clearly outside," never the
boundary-touching cases.

**mivend example**: reservation availability calculations (`plugin-reservation`).

**Exceptions**: none — boundary bugs are the single most common class of range-logic defect.

## Source ownership

**Applies to**: any cross-instance fact (order, reservation, payment, ERP status, fiscalization).

**Risk**: a non-owning instance mutates state it doesn't own, silently corrupting the source of
truth.

**Minimum scenarios**: branch does not mutate ERP-owned fields; central does not overwrite a
branch-owned reservation; a replica does not mutate the owning instance's order; payment provider
status is not replaced by ERP status; ERP unreachability does not make a captured payment
"unconfirmed"; fiscalization status does not change payment status; a refund is never a negative
payment; a dispute is never merged into a refund; a reconciliation issue is never auto-resolved by
picking a source; a cross-instance fact travels as its own event stream; an external fact record
carries the source system's own reconciliation reference.

**Preferred level**: integration (guard/interceptor enforcement) plus unit (guard logic itself).

**Required assertions**: an attempted disallowed mutation is rejected, not silently ignored or
downgraded.

**Common false positive**: testing that the guard exists without testing that the disallowed path
is actually blocked at runtime.

**mivend example**: `ReplicaOrderInterceptor`, `PaymentReconciliationIssue` (`plugin-acquiring`).

**Exceptions**: none — this is architecturally non-negotiable per AGENTS.md sync rules #6-#13.

## Eventual consistency

**Applies to**: any read model/projection updated asynchronously from a source event.

**Risk**: a test (or production caller) assumes synchronous consistency and either flakes or
masks a real staleness bug.

**Minimum scenarios**: the originating command finishes before the read model updates; the read
model updates after the event is processed; replaying an event doesn't change the outcome;
rebuilding a projection from its event set gives the same result; a stale event does not roll back
newer projection state; waiting uses controlled polling or a direct processor invocation, never
`sleep`; a timeout gives a diagnosable failure message.

**Preferred level**: component.

**Required assertions**: projection state matches the expected result of its event set, checked
via polling with a bounded timeout or a direct synchronous processor call — never a fixed sleep.

**Common false positive**: a fixed `sleep(2000)` "long enough" wait that's actually a race,
just one that rarely loses.

**mivend example**: `DiscountRegistryEntry` projection (`plugin-price-entry`).

**Exceptions**: none — `sleep` for eventual consistency is forbidden outright (see
AGENTS.md/testing-strategy "Worker testing").

## Authorization and visibility

**Applies to**: any query or mutation gated by role/scope.

**Risk**: a user sees or mutates data outside their permitted scope, especially via an id
collision across scopes.

**Minimum scenarios**: a user sees only permitted data; a scoped role does not see another
branch's data; matching ids across scopes don't leak; list and detail queries apply the same
scope; a mutation re-checks scope (not just the query that found the record); a background worker
runs under the correct system context; an internal operation doesn't bypass ownership rules.

**Preferred level**: integration (resolver+guard) with a small E2E smoke for the top-level "wrong
role, no access" case.

**Required assertions**: an out-of-scope access attempt is rejected with the expected error, not
silently returning empty/null (which can mask a bug as "no data").

**Common false positive**: testing only that in-scope access works, never attempting the
out-of-scope access.

**mivend example**: see `docs/access-control.md` and the `access-control-review` skill.

**Exceptions**: none.

## Contract compatibility

**Applies to**: any external boundary (RabbitMQ envelope, ERP payload, webhook, GraphQL schema).

**Risk**: a producer/consumer change silently breaks the other side, or an old message becomes
unparseable.

**Minimum scenarios**: required fields present; allowed values enforced; unknown extra fields
tolerated (forward compatibility) or rejected (as designed); a still-supported old version parses;
an unsupported version is rejected explicitly; producer and consumer agree on shape; no silent
field removal/rename; optional/nullable semantics match; routing key is stable; id uniqueness
scope is correct.

**Preferred level**: contract (dedicated `contracts/` suite at the boundary owner).

**Required assertions**: a schema/shape check against a fixed fixture per supported version — not
just "the current producer's output parses," which proves nothing about compatibility.

**Common false positive**: round-tripping the current version through the current parser and
calling that a contract test — it never exercises version skew.

**mivend example**: gap — no contract suite exists yet; introduce for `plugin-sync`'s RabbitMQ
envelope and `plugin-erp-import`'s REST DTOs as part of the pilot/CI stages.

**Exceptions**: internal-only interfaces with a single producer and consumer deployed atomically
(same release) can skip version-skew scenarios, but must still check required-field/shape drift.
