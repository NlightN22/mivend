import { PluginCommonModule, Type, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { DocumentsPlugin } from '@mivend/plugin-documents';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { IntegrationOutboxService } from './integration-outbox.service';
import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import { IntegrationOutboxWorker } from './integration-outbox.worker';
import { IntegrationInboxService } from './integration-inbox.service';
import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import { IntegrationInboxWorker } from './integration-inbox.worker';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaConsumerBootstrapService } from './kafka-consumer-bootstrap.service';
import { CategoryStreamHandler } from './handlers/category.handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { PriceTypeStreamHandler } from './handlers/price-type.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { WarehouseStreamHandler } from './handlers/warehouse.handler';
import { OrganizationStreamHandler } from './handlers/organization.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { KafkaProducerService } from './kafka-producer.service';
import { SchemaRegistryClient } from './schema-registry.client';
import { OrderSubmittedListener } from './order-submitted.listener';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Central-hub-only, per the external-integration-rules skill ("Branches never call the ERP [or Integration
// Service]"). The guard can't live in the providers array itself: @VendurePlugin's decorator body
// runs at module-import time, before `ErpIntegrationPlugin.options` is set by the static `init()`
// call in vendure-config.ts — so `options.instanceType` isn't known yet at that point. Instead
// every service that does real work (worker, listener) checks `instanceType` at its own
// lifecycle-hook runtime, same as plugin-sync's `ProductConsumer.onModuleInit`'s
// `if (this.options.instanceType !== 'branch') return;`. On a branch instance the providers are
// still constructed (cheap, no I/O in their constructors), but never start a Kafka connection,
// never schedule the BullMQ worker, and never subscribe to the order-submitted EventBus stream.
//
// Separately (issue #68), `options.kafkaEnabled` gates the same Kafka-touching services even on
// a central instance — `instanceType === 'central'` says "this instance is allowed to talk to
// Integration Service", not "this specific run should". A plain `make dev` (local contour) must
// never reach a real broker just because it happens to run as central; only a deliberately
// launched staging-integration/production contour sets `kafkaEnabled: true`. See docs/environments.md.
@VendurePlugin({
    imports: [
        PluginCommonModule,
        ErpOrderPlugin,
        CustomerPricingPlugin,
        PriceEntryPlugin,
        AccessControlPlugin,
        DocumentsPlugin,
    ],
    entities: [IntegrationOutboxEntry, IntegrationInboxEvent],
    providers: [
        IntegrationOutboxService,
        IntegrationOutboxProcessorService,
        IntegrationOutboxWorker,
        IntegrationInboxService,
        IntegrationInboxProcessorService,
        IntegrationInboxWorker,
        KafkaConsumerService,
        KafkaConsumerBootstrapService,
        CategoryStreamHandler,
        PriceStreamHandler,
        PriceTypeStreamHandler,
        ProductStreamHandler,
        StockStreamHandler,
        WarehouseStreamHandler,
        OrganizationStreamHandler,
        StorageLocationStreamHandler,
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
