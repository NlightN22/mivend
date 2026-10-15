import { ScheduledTask } from '@vendure/core';
import { cronEveryMs } from 'shared';

import { KafkaLagPollerService } from './kafka-lag-poller.service';
import { KAFKA_ENABLED_DEFAULT, KAFKA_LAG_POLL_INTERVAL_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Same gate as createReconciliationTask/createIntegrationOutboxTask: this task also reaches
// the external broker used by consumer/producer, so it must be central-hub and kafkaEnabled.
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
