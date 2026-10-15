import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import { KAFKA_ENABLED_DEFAULT, OUTBOX_POLL_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central hub only; branches never publish to Integration Service directly.
// Also gated on kafkaEnabled so a plain make dev never publishes to a real broker.
export function createIntegrationOutboxTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    const everyMs = options.outboxPollIntervalMs ?? OUTBOX_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-outbox',
        description:
            'Publishes pending outbound records to Integration Service (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            return injector.get(IntegrationOutboxProcessorService).processPendingBatch();
        },
    });
}
