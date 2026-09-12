import { CollectionService, ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT, KAFKA_ENABLED_DEFAULT } from './types';
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
export function createCollectionFiltersRecomputeTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs =
        options.collectionFiltersRecomputeIntervalMs ??
        COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-collection-filters-recompute',
        description:
            'Batches Collection filter recomputation for Kafka-driven product changes (central hub only) — see kafka-consumer-bootstrap.service.ts for why per-event recompute is disabled.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector, scheduledContext }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            await injector.get(CollectionService).triggerApplyFiltersJob(scheduledContext);
            return { triggered: true };
        },
    });
}
