import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import { KAFKA_ENABLED_DEFAULT, OUTBOX_POLL_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only, unlike plugin-sync's OutboxWorker (which drains on every instance) — a
// branch never publishes directly to Integration Service, per the external-integration-rules
// skill. Also gated on kafkaEnabled (issue #68) — a plain `make dev` (local contour) must never
// publish to a real Integration Service broker.
//
// Issue #80: standard for recurring/periodic plugin work is Vendure's own ScheduledTask
// (DefaultSchedulerPlugin, registered in apps/server/src/vendure-config.ts) — worker-process-only
// and DB-locked out of the box, plus enable/disable + run-now via the admin API, replacing the
// previous raw BullMQ Queue+Worker (integration-outbox.worker.ts).
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
