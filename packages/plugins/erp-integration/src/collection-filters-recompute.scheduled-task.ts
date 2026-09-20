import {
    CollectionService,
    ConfigService,
    Logger,
    ScheduledTask,
    isInspectableJobQueueStrategy,
} from '@vendure/core';
import { cronEveryMs } from 'shared';

import {
    COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT,
    KAFKA_ENABLED_DEFAULT,
    loggerCtx,
} from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Compensates for KafkaConsumerBootstrapService disabling
// CollectionService.setApplyAllFiltersOnProductUpdates on the worker process (central hub,
// kafkaEnabled only): by default, Vendure debounces ProductEvent/ProductVariantEvent by only
// 50ms before enqueuing an apply-collection-filters job that recomputes every Collection — fine
// for a human editing products one at a time, but a real incident at this codebase's real
// catalog scale (thousands of ProductStreamHandler-driven creates/updates streaming in from
// Kafka) enqueued tens of thousands of individual jobs, each recomputing every Collection, and
// the job queue could never drain. This task is the batched replacement: one recompute per
// interval instead of one per product event.
//
// DO NOT remove/disable this task or KafkaConsumerBootstrapService's
// setApplyAllFiltersOnProductUpdates(false) call without replacing both together — real
// incident, 2026-09-20: mistakenly assumed this flag had been removed (it had not; only found by
// checking `git log -S`, not by grepping the static vendure-config.ts, since it's set
// programmatically here, not as a config literal) while chasing a *different*, real bug this
// same incident surfaced — see the overlap guard below.
//
// Second real incident, same day: this task's own `execute()` only enqueues a job and returns —
// it does not wait for the (potentially very slow, tens of minutes on this project's real
// catalog size) apply-collection-filters job to finish. Vendure's own ScheduledTask/scheduler
// locking only prevents *this function* from running concurrently with itself across worker
// instances; it has no idea the BullMQ job it kicked off is still running. With the default
// 3-minute interval and a full sweep sometimes taking ~44 minutes (516 collections × their
// products), several full sweeps piled up and contended for the same Postgres rows — looked
// exactly like a hung job, wasn't. The `isSettled: false` check below is the actual overlap
// guard: skip enqueueing a new full sweep while a previous one from this same queue hasn't
// finished (succeeded or failed) yet.
export function createCollectionFiltersRecomputeTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs =
        options.collectionFiltersRecomputeIntervalMs ??
        COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-collection-filters-recompute',
        description:
            "Batches Collection filter recomputation for Kafka-driven product changes (central hub only) — see kafka-consumer-bootstrap.service.ts for why per-event recompute is disabled. Skips a tick if the previous full sweep has not finished yet (see this file's own doc comment).",
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector, scheduledContext }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            const strategy = injector.get(ConfigService).jobQueueOptions.jobQueueStrategy;
            if (isInspectableJobQueueStrategy(strategy)) {
                const { totalItems } = await strategy.findMany({
                    filter: {
                        queueName: { eq: 'apply-collection-filters' },
                        isSettled: { eq: false },
                    },
                    take: 1,
                });
                if (totalItems > 0) {
                    Logger.warn(
                        'Skipping this tick — a previous apply-collection-filters sweep has not settled yet',
                        loggerCtx,
                    );
                    return { skipped: true, reason: 'previous sweep still running' };
                }
            }

            await injector.get(CollectionService).triggerApplyFiltersJob(scheduledContext);
            return { triggered: true };
        },
    });
}
