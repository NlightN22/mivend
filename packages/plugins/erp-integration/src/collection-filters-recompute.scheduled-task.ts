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

// Replaces per-product recompute disabled in KafkaConsumerBootstrapService; remove both together.
// Skip enqueue while a prior sweep is unsettled (isSettled: false); sweeps take ~44min.
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
