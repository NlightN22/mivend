import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ReconciliationService } from './reconciliation.service';
import { KAFKA_ENABLED_DEFAULT, RECONCILIATION_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only and kafkaEnabled-gated, mirroring createIntegrationOutboxTask exactly (issue
// #84's explicit instruction) — reconciliation talks to the same external system (Integration
// Service) the outbox/inbox do, so the same "is this contour allowed to reach it at all" gate
// applies, even though this is a plain REST call rather than Kafka.
export function createReconciliationTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    const everyMs = options.reconciliationIntervalMs ?? RECONCILIATION_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-reconciliation',
        description:
            'Daily comparison of mivend local entity counts against Integration Service (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            return injector.get(ReconciliationService).runComparison({ triggeredBy: 'scheduled' });
        },
    });
}
