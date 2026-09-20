---
name: vendure-workers
description: Mandatory before adding, splitting, or reconfiguring any Vendure worker process (worker.ts, worker-email.ts, or any future dedicated worker), touching jobQueueOptions/activeQueues, or adding a new JobQueueService.createQueue() call. Covers how Vendure's BullMQ job queue actually behaves across multiple worker processes, why activeQueues alone does NOT give real isolation, and the real incident this project already hit getting it wrong twice in one day.
---

# Vendure workers: job queues, activeQueues, and process splitting

This project runs more than one `bootstrapWorker()` process per contour (`worker.ts` +
`worker-email.ts`, both against the same `apps/server/src/vendure-config.ts`). Read this before
touching either file, adding a third worker, or adding any new `JobQueueService.createQueue()`
call in a plugin.

**Planned, not yet done: issue #128 — migrate off `BullMQJobQueuePlugin` to Vendure's default
polling (DB-backed) `JobQueueStrategy`.** No specific load requirement drove the original BullMQ
choice; it was picked as "more forward-looking" at the time. The polling strategy implements
`activeQueues` as a real SQL `WHERE queueName = ...` filter (verified in
`polling-job-queue-strategy.js`), which would make the `worker.ts`/`worker-email.ts` split already
written in this skill actually work as originally intended, with no further code changes to
either file. Everything below describing BullMQ's specific limitations is accurate for the
strategy in use as of this writing — re-verify it against #128 once that migration lands, and
trim the now-historical BullMQ-specific warnings if they no longer apply.

## The one fact that matters most

**`@vendure/job-queue-plugin`'s BullMQ integration stores every Vendure queue's jobs in a single
underlying BullMQ queue (`vendure-job-queue`), keyed by a `data.name` field per job, not one real
BullMQ queue per Vendure `queueName`.** Every worker process connects to that same one queue, and
**the single underlying BullMQ `Worker` in each process pulls jobs off that queue indiscriminately
— `activeQueues` does not stop a process from dequeuing a job type it doesn't own,** even when
every running worker declares an explicit, non-overlapping list. `JobQueueOptions.activeQueues` is
checked by `JobQueueService.shouldStartQueue()` only when a queue is being registered/started in
this process (gating whether a _processor_ gets attached) — it is not consulted by the BullMQ
consumer's own pull loop, which has no concept of "leave this one for someone else."

**Confirmed empirically twice in this project, same day (2026-09-20):**

1. First attempt: a dedicated worker with `activeQueues: ['send-email']` run _alongside_
   `worker.ts` left on Vendure's documented default (empty/unset = "process every queue") — the
   new worker immediately dequeued and permanently failed four real `apply-collection-filters`
   jobs it had no processor for (logged as `[BullMQJobQueuePlugin] Job <id>
[apply-collection-filters] failed (attempt 1 of 1)` — not a crash, an instant failure).
2. **Second attempt, after "fixing" `worker.ts` to declare an explicit, non-overlapping
   `activeQueues` list covering every other known queue** (the seemingly-obvious fix, and what
   Vendure's own docs example implies is the correct pattern) — **the dedicated `send-email`
   worker still dequeued and failed `apply-collection-filters` jobs anyway.** Verified via a
   standalone `preBootstrapConfig()` call that the merged config genuinely had
   `jobQueueOptions.activeQueues === ['send-email']` at bootstrap time — the option was applied
   correctly, and it still didn't prevent the failure. This is the actual limitation: **with
   `BullMQJobQueueStrategy` specifically, `activeQueues` cannot give real per-process isolation no
   matter how you configure it**, because every process's BullMQ `Worker` shares the exact same
   underlying queue and blindly pulls from it.

**Do not trust `activeQueues` alone for isolation with this strategy — not even with a fully
non-overlapping, "textbook-correct" configuration on every worker.** This directly matches
Vendure's own community-documented caveat: _"all Vendure job types are stored in a single BullMQ
queue, and any worker can process any job type... for strict per-queue concurrency isolation, you
would need to create separate BullMQ queues per Vendure queue, though this requires custom
implementation."_

## The real fix: genuinely separate BullMQ queues, not `activeQueues`

To actually isolate one queue (e.g. `send-email`) from contention by everything else, the queue
itself must be a **different underlying BullMQ queue**, not just a different Vendure-level
`activeQueues` allowlist on top of the same one. This means a custom `JobQueueStrategy` (or a
thin wrapper around `BullMQJobQueueStrategy`) that routes specific `queueName`s to their own,
separately-named BullMQ `Queue`/`Worker` pair — see `worker-email.ts`'s own implementation and
comments for how this project does it, and update this section if that implementation changes
shape.

**Do not fall back to `JobQueueOptions.prefix`** as a shortcut — that option namespaces an entire
_deployment's_ queues from another deployment sharing the same Redis (e.g. staging vs. prod), not
individual queue types within one deployment; giving one worker a different `prefix` just makes it
stop seeing jobs published under the default prefix entirely, it doesn't create a routing split.

## `apply-collection-filters` has no idempotency of its own — a known, open, upstream Vendure gap

Confirmed via research (not a code fix on our side): **`vendurehq/vendure#5280`** —
`CollectionService.applyCollectionFiltersInternal()` swallows a duplicate-key error from the
Collection↔ProductVariant junction-table write when two sweeps for the same collection overlap,
and still reports the job `COMPLETED` — silently dropping some memberships rather than erroring
loudly. Vendure's `ScheduledTask.preventOverlap` (default `true`) does **not** help here: it only
guards a task's own `execute()` function against running concurrently with itself — it has no
visibility into the async BullMQ job that `execute()` merely enqueues and returns from
immediately, so nothing stops a second scheduled tick from enqueueing another full sweep while the
first one (which can take tens of minutes on a real catalog) is still running.

**This project's own fix** (`collection-filters-recompute.scheduled-task.ts`,
`createCollectionFiltersRecomputeTask`): before enqueueing, query the job queue's
`InspectableJobQueueStrategy.findMany({ filter: { queueName: { eq: 'apply-collection-filters' },
isSettled: { eq: false } } })` and skip the tick if one is still unsettled. This is the
community-confirmed workaround for this exact upstream gap — do not attempt to patch
`@vendure/core` itself (`AGENTS.md`: never modify Vendure core) or invent a different mechanism;
mirror this pattern for any other Vendure-core job type that turns out to have the same
overlap-safety gap.

**Don't confuse a genuinely slow full sweep with a hung one.** Vendure's own job payload carries
`collectionIds: []` for a full recompute across every collection (vs. a real array for a point
recompute) — a full sweep over hundreds of collections × their product sets is legitimately slow
(this project measured ~5-6 sec/collection, ~44 minutes for a full 516-collection sweep that
completed successfully on its own, pre-fix). Before assuming a stuck job is hung/crashed:

1. Check the job's Redis lock (`bull:vendure-job-queue:<id>:lock`) — if its TTL is actively
   refreshing, the worker genuinely still holds and is working the job, not an orphan from a dead
   process.
2. Check `data.collectionIds` — empty array means full sweep, expect it to take a while.
3. Check whether **multiple** full-sweep jobs are running concurrently — that's the overlap gap
   above, now guarded against; if it recurs, the guard itself is the thing to debug first.

## `setApplyAllFiltersOnProductUpdates(false)` — do not remove without checking `git log -S` first

`KafkaConsumerBootstrapService` disables Vendure's default per-`ProductEvent`/`ProductVariantEvent`
recompute (which only debounces 50ms — fine for a human editing products one at a time, not for
thousands of Kafka-driven product changes) via a **programmatic call**, not a `vendure-config.ts`
literal. Real incident, 2026-09-20: this was briefly, wrongly suspected of having been silently
removed, purely because grepping the static `vendure-config.ts` for the flag name found nothing —
the actual call lives in `kafka-consumer-bootstrap.service.ts`, paired with
`createCollectionFiltersRecomputeTask`'s periodic replacement in
`collection-filters-recompute.scheduled-task.ts`. **Before concluding a Vendure-behavior-altering
call like this was removed, `git log -S"<the exact call>"` across the whole repo, not just a grep
of the config file** — plenty of Vendure config in this codebase is applied programmatically in a
plugin/service rather than as a `VendureConfig` literal.

## Restarting a worker process

Per the `dev-environment` skill, use the Makefile / respawn (`ts-node-dev --respawn`) in dev —
never manually `kill -9` a worker mid-job without checking what it's holding first (a job with a
live, refreshing Redis lock means the worker is doing real, uninterrupted work; abruptly killing it
just orphans that job instead of letting it finish or fail cleanly). On a contour connected to a
real external broker (staging-integration), be extra careful — see `AGENTS.md`'s Dev process
management section and this session's own experience: an in-app permission classifier will refuse
a `kill -9` against a live worker process on that contour ("Interfere With Workloads") — that block
is a real safety signal, not an obstacle to route around; surface it to the user rather than trying
to force it.

## Before shipping any change here

- `pnpm --filter server exec tsc --noEmit -p .` — real exit code, not piped through `tail` (see
  `backend-plugin-rules` skill's own gotcha about that).
- Test locally first (`make dev`) before ever trying a new worker-topology change against
  `staging-integration` — that contour has real external state (Kafka backlog, real job history) a
  bad topology change can damage in seconds, as this session's own incident demonstrated twice.
- Update the queue-name enumeration (`grep -rn "createQueue({" packages/plugins/*/src --include=*.ts`
  plus Vendure core's own built-ins — see `worker-email.ts`'s routing table) if you add, rename, or
  remove a `createQueue()` call anywhere in the codebase.
