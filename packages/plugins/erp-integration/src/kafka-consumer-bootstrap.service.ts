import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { CollectionService, Logger, ProcessContext } from '@vendure/core';

import { KafkaConsumerService } from './kafka-consumer.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, KAFKA_ENABLED_DEFAULT, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only bootstrap for the Kafka consumer (issue #62 design point 1 / the
// external-integration-rules skill's "Branches never call the ERP or Integration Service"
// rule) — mirrors plugin-sync's ProductConsumer.onModuleInit
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
        private readonly collectionService: CollectionService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.options.instanceType !== 'central') return;
        if (!(this.options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return;
        if (!this.processContext.isWorker) return;

        // Real incident: Vendure's default 50ms-debounced per-ProductEvent recompute enqueued
        // tens of thousands of individual apply-collection-filters jobs (one per product,
        // each recomputing every Collection) once real Kafka product traffic started flowing at
        // scale — the job queue could never drain. Disabled here (worker process only, matching
        // where ProductStreamHandler's Kafka-driven product creates/updates actually happen) and
        // replaced by createCollectionFiltersRecomputeTask's own batched, periodic recompute.
        //
        // DO NOT remove this call without also removing/replacing
        // createCollectionFiltersRecomputeTask (collection-filters-recompute.scheduled-task.ts)
        // — the two exist as one pair, not independently. Confirmed still present and working
        // during a 2026-09-20 incident where it was briefly, mistakenly suspected of having been
        // removed (it was not — see that file's own doc comment for the full account and the
        // *actual* bug found that day).
        // Manual admin/manager-portal product edits are unaffected — those run in the SERVER
        // process, which has its own separate CollectionService instance with this still enabled.
        this.collectionService.setApplyAllFiltersOnProductUpdates(false);

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
