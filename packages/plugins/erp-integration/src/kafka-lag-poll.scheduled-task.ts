import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { KafkaLagPollerService } from './kafka-lag-poller.service';
import { KAFKA_ENABLED_DEFAULT, KAFKA_LAG_POLL_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only and kafkaEnabled-gated, mirroring createReconciliationTask/
// createIntegrationOutboxTask exactly — this talks to the same external broker the
// consumer/producer do, so the same "is this contour allowed to reach Integration Service at
// all" gate applies (issue #91).
export function createKafkaLagPollTask(options: ErpIntegrationPluginOptions): ScheduledTask {
    const everyMs = options.kafkaLagPollIntervalMs ?? KAFKA_LAG_POLL_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-kafka-lag-poll',
        description:
            'Polls per-partition Kafka consumer lag for every inbound ERP topic (central hub only).',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            return injector.get(KafkaLagPollerService).pollAll();
        },
    });
}
