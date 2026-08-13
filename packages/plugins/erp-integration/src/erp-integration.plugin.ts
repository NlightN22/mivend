import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationOutboxService } from './integration-outbox.service';
import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import { IntegrationOutboxWorker } from './integration-outbox.worker';
import { KafkaProducerService } from './kafka-producer.service';
import { SchemaRegistryClient } from './schema-registry.client';
import { OrderSubmittedListener } from './order-submitted.listener';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only, per AGENTS.md sync rule #6 ("Branches never call the ERP [or Integration
// Service]"). The guard can't live in the providers array itself: @VendurePlugin's decorator body
// runs at module-import time, before `ErpIntegrationPlugin.options` is set by the static `init()`
// call in vendure-config.ts — so `options.instanceType` isn't known yet at that point. Instead
// every service that does real work (worker, listener) checks `instanceType` at its own
// lifecycle-hook runtime, same as plugin-sync's `ProductConsumer.onModuleInit`'s
// `if (this.options.instanceType !== 'branch') return;`. On a branch instance the providers are
// still constructed (cheap, no I/O in their constructors), but never start a Kafka connection,
// never schedule the BullMQ worker, and never subscribe to the order-submitted EventBus stream.
@VendurePlugin({
    imports: [PluginCommonModule, ErpOrderPlugin],
    entities: [IntegrationOutboxEntry],
    providers: [
        IntegrationOutboxService,
        IntegrationOutboxProcessorService,
        IntegrationOutboxWorker,
        KafkaProducerService,
        SchemaRegistryClient,
        OrderSubmittedListener,
        {
            provide: ERP_INTEGRATION_PLUGIN_OPTIONS,
            useFactory: (): ErpIntegrationPluginOptions => ErpIntegrationPlugin.options,
        },
    ],
    compatibility: '>0.0.0',
})
export class ErpIntegrationPlugin {
    static options: ErpIntegrationPluginOptions;

    static init(options: ErpIntegrationPluginOptions): Type<ErpIntegrationPlugin> {
        this.options = options;
        return ErpIntegrationPlugin;
    }
}
