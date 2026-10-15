import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    ChannelService,
    CollectionService,
    ConfigService,
    Logger,
    ProcessContext,
    RequestContext,
} from '@vendure/core';

import { KafkaConsumerService } from './kafka-consumer.service';
import { TaxZoneService } from './tax-zone.service';
import {
    ERP_INTEGRATION_PLUGIN_OPTIONS,
    KAFKA_ENABLED_DEFAULT,
    PRICES_INCLUDE_TAX_DEFAULT,
    isEmailOnlyWorker,
    loggerCtx,
} from './types';
import type { ErpIntegrationPluginOptions } from './types';

// ProcessContext.isWorker alone is not enough (worker-email is also isWorker). Branches never connect.
// Only the worker process may start the Kafka consumer: a second group member triggers a rebalance that silently stalls fetching.
@Injectable()
export class KafkaConsumerBootstrapService implements OnApplicationBootstrap {
    constructor(
        private readonly kafkaConsumer: KafkaConsumerService,
        private readonly processContext: ProcessContext,
        private readonly collectionService: CollectionService,
        private readonly channelService: ChannelService,
        private readonly taxZoneService: TaxZoneService,
        private readonly configService: ConfigService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.options.instanceType !== 'central') return;

        // Plain Vendure Channel setting, not a Kafka connection: must apply on every central process
        // regardless of the broker opt-in, so it must not sit behind kafkaEnabled or isWorker.
        await this.ensurePricesIncludeTax();
        await this.taxZoneService.ensureChannelDefaultsForExistingZone(RequestContext.empty());

        if (!(this.options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return;
        if (!this.processContext.isWorker) return;
        if (isEmailOnlyWorker(this.configService.jobQueueOptions?.activeQueues)) return;

        // Per-product recompute floods the job queue at scale; disabled here in favor of the batched task.
        // Do not remove without also removing createCollectionFiltersRecomputeTask: they are one pair.
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

    // ERP always sends gross (tax-inclusive) prices, so this is a property of the integration,
    // not a manual seed step. Idempotent: no-op on every run once the channel matches.
    private async ensurePricesIncludeTax(): Promise<void> {
        const desired = this.options.pricesIncludeTax ?? PRICES_INCLUDE_TAX_DEFAULT;
        const ctx = RequestContext.empty();
        const defaultChannel = await this.channelService.getDefaultChannel(ctx);
        if (defaultChannel.pricesIncludeTax === desired) return;

        await this.channelService.update(ctx, { id: defaultChannel.id, pricesIncludeTax: desired });
        Logger.info(`Set Channel.pricesIncludeTax=${desired}`, loggerCtx);
    }
}
