---
name: vendure-workers
description: Mandatory before adding, splitting, or reconfiguring any Vendure worker process (worker.ts, worker-email.ts, or any future dedicated worker), touching jobQueueOptions/activeQueues, or adding a new JobQueueService.createQueue() call. Covers how Vendure's BullMQ job queue actually behaves across multiple worker processes and the real incident this project already hit getting it wrong.
---

# Vendure workers: job queues, activeQueues, and process splitting

This project runs more than one `bootstrapWorker()` process per contour (`worker.ts` +
`worker-email.ts`, both against the same `apps/server/src/vendure-config.ts`). Read this before
touching either file, adding a third worker, or adding any new `JobQueueService.createQueue()`
call in a plugin.

## The one fact that matters most

**`@vendure/job-queue-plugin`'s BullMQ integration stores every Vendure queue's jobs in a single
underlying BullMQ queue (`vendure-job-queue`), keyed by a `data.name` field per job, not one real
BullMQ queue per Vendure `queueName`.** Every worker process connects to that same one queue.

This has two consequences that aren't obvious from the option's own doc comment:

1. **Any worker can dequeue any job, regardless of `activeQueues`.** `JobQueueOptions.activeQueues`
   is _not_ a Redis-level filter that stops a non-owning worker from ever pulling a job of that
   type — it's checked by Vendure's own code only _after_ the job is already dequeued from the
   shared list. If the job's `name` isn't in this worker's `activeQueues`, Vendure has no
   registered processor for it here.
2. **A dequeued-but-unowned job is not gracefully released back to the queue for the right worker
   — it is marked `failed`.** Real incident, this project, 2026-09-20: a dedicated worker started
   with `activeQueues: ['send-email']`, run _alongside_ the existing `worker.ts` which had no
   `activeQueues` set (Vendure's documented default: empty/unset = "process every queue"), raced
   that worker for jobs of _every_ type. Within seconds it pulled and permanently failed four
   real `apply-collection-filters` jobs it had no processor for. The failure showed up in the new
   worker's own log as `[BullMQJobQueuePlugin] Job <id> [apply-collection-filters] failed (attempt
1 of 1)` — not a crash, not a timeout, just an immediate, silent-unless-you're-watching-logs
   failure.

## The only safe pattern: every concurrently-running worker gets an explicit, non-overlapping `activeQueues`

Never pair a worker with a restricted `activeQueues` list against a worker left on the
default ("all queues"). Both/all workers running against the same Redis instance at the same time
must each declare an explicit list, and the union of every worker's list must cover every real
queue name in the codebase with **no queue name missing from every list** (a queue nobody declares
never gets processed by anyone) and ideally no overlap (overlap isn't unsafe by itself — two
workers both allowed to process `send-email` just race harmlessly for whichever grabs it first —
but a _partial_ worker without a fully-thought-out counterpart is what causes the fail-mode above).

See `apps/server/src/worker.ts` (declares every known queue except `send-email`) and
`apps/server/src/worker-email.ts` (declares only `send-email`) for the current, correct pairing —
mirror this exact shape for any new dedicated worker, don't invent a different one.

**Before adding a new dedicated worker or changing either file's `activeQueues` list**, enumerate
every real `JobQueueService.createQueue()` call across the codebase and confirm the union of all
running workers' lists still covers every one of them:

```bash
grep -rn "createQueue({" packages/plugins/*/src --include=*.ts
grep -rn "name: '" apps/server/node_modules/@vendure/core/dist/service/services/{session,collection}.service.js \
  apps/server/node_modules/@vendure/core/dist/plugin/default-search-plugin/indexer/search-index.service.js
```

Known queue names as of this writing (keep this list in sync when a new one appears):

| Queue name                 | Source                                                       | Owner worker      |
| -------------------------- | ------------------------------------------------------------ | ----------------- |
| `apply-collection-filters` | Vendure core (`CollectionService`)                           | `worker.ts`       |
| `clean-sessions`           | Vendure core (`SessionService`)                              | `worker.ts`       |
| `update-search-index`      | Vendure core (`DefaultSearchPlugin`, unused by this project) | `worker.ts`       |
| `generate-document`        | `plugin-documents` (`PdfGeneratorService`)                   | `worker.ts`       |
| `send-email`               | `@vendure/email-plugin`                                      | `worker-email.ts` |

## `apply-collection-filters` specifically: don't assume "stuck" means "crashed"

A genuinely long-running `apply-collection-filters` job is not automatically a bug. Vendure's own
job payload carries `collectionIds: []` for a **full recompute across every collection** (vs. a
real array for a point recompute of specific collections) — a full sweep over hundreds of
collections × their product sets is legitimately slow (this project measured ~5-6 sec/collection,
~44 minutes for a full 516-collection sweep that completed successfully). Before assuming a stuck
job is hung/crashed:

1. Check the job's Redis lock (`bull:vendure-job-queue:<id>:lock`) — if its TTL is actively
   refreshing, the worker genuinely still holds and is working the job, not an orphan from a dead
   process.
2. Check `data.collectionIds` — empty array means full sweep, expect it to take a while.
3. Check whether **multiple** full-sweep jobs are running concurrently — several `collectionIds: []`
   jobs racing each other for the same underlying Postgres rows (516 collections × products) is a
   real, separately-worth-investigating lock-contention problem, distinct from "one job hung."
   If this project's own high-volume ERP streams (product/price/offer via `erp-integration`)
   trigger a full recompute per event with no batching/debounce, that's the actual thing to fix —
   not the job queue split covered by this skill.

## Restarting a worker process

Per the `dev-environment` skill, use the Makefile / respawn (`ts-node-dev --respawn`) in dev —
never manually `kill -9` a worker mid-job without checking what it's holding first (see the
`apply-collection-filters` section above: a job with a live, refreshing Redis lock means the
worker is doing real, uninterrupted work, and abruptly killing it just orphans that job instead of
letting it finish or fail cleanly). On a contour connected to a real external broker
(staging-integration), be extra careful — see `AGENTS.md`'s Dev process management section and
this session's own experience: an in-app permission classifier will refuse a `kill -9` against a
live worker process on that contour ("Interfere With Workloads") — that block is a real safety
signal, not an obstacle to route around; surface it to the user rather than trying to force it.

## Before shipping any change here

- `pnpm --filter server exec tsc --noEmit -p .` — real exit code, not piped through `tail`
  (see `backend-plugin-rules` skill's own gotcha about that).
- Test locally first (`make dev`, both `worker`/`worker-email` processes up) before ever trying a
  new worker-topology change against `staging-integration` — that contour has real external state
  (Kafka backlog, real job history) a bad topology change can damage in seconds, as this session's
  own incident demonstrated.
- Update the queue-name table above if you added, renamed, or removed a `createQueue()` call
  anywhere in the codebase.
