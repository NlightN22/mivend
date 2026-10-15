import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { ReconciliationService } from './reconciliation.service';
import { KAFKA_ENABLED_DEFAULT, RECONCILIATION_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Gated like the outbox/inbox: this REST call reaches the same Integration Service, so it
// must honor the same central-hub and kafkaEnabled restriction, even though it is not Kafka.
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
