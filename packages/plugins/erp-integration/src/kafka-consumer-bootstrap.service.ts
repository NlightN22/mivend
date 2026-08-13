import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Logger } from '@vendure/core';

import { KafkaConsumerService } from './kafka-consumer.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only bootstrap for the Kafka consumer (issue #62 design point 1 / AGENTS.md sync
// rule #6) — mirrors plugin-sync's ProductConsumer.onModuleInit
// (`if (this.options.instanceType !== 'branch') return;`), inverted for this central-only
// direction. A branch instance never starts a Kafka connection to Integration Service.
@Injectable()
export class KafkaConsumerBootstrapService implements OnApplicationBootstrap {
    constructor(
        private readonly kafkaConsumer: KafkaConsumerService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.options.instanceType !== 'central') return;
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
