import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Logger, ProcessContext } from '@vendure/core';

import { KafkaConsumerService } from './kafka-consumer.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, KAFKA_ENABLED_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only bootstrap for the Kafka consumer (issue #62 design point 1 / AGENTS.md sync
// rule #6) — mirrors plugin-sync's ProductConsumer.onModuleInit
// (`if (this.options.instanceType !== 'branch') return;`), inverted for this central-only
// direction. A branch instance never starts a Kafka connection to Integration Service.
//
// Also gated on ProcessContext.isWorker (issue #67): both `main.ts` (bootstrap) and `worker.ts`
// (bootstrapWorker) load this plugin, and a Kafka *consumer group* — unlike plugin-sync's
// RabbitMQ competing-consumers queue — cannot tolerate two independent instances joining the
// same group (`mivend-central-hub`): joining triggers a partition rebalance, and the runner for
// reassigned partitions silently never resumed fetching after it, stalling consumption entirely
// with no error logged. Only the worker process starts the consumer, matching this same plugin's
// own IntegrationInboxWorker/IntegrationOutboxWorker (BullMQ workers, worker-process convention).
@Injectable()
export class KafkaConsumerBootstrapService implements OnApplicationBootstrap {
    constructor(
        private readonly kafkaConsumer: KafkaConsumerService,
        private readonly processContext: ProcessContext,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.options.instanceType !== 'central') return;
        if (!(this.options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return;
        if (!this.processContext.isWorker) return;
        try {
            await this.kafkaConsumer.start();
            Logger.info('erp-integration Kafka consumer started', loggerCtx);
        } catch (err) {
            Logger.error(
                `erp-integration Kafka consumer failed to start: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }
}
