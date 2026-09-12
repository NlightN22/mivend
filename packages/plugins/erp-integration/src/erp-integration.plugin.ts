import { PluginCommonModule, RuntimeVendureConfig, Type, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { DocumentsPlugin } from '@mivend/plugin-documents';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';
import { ProductTaxCodeFlag } from './entities/product-tax-code-flag.entity';
import { ProductTaxCodeFlagService } from './product-tax-code-flag.service';
import { ProductTaxCodeFlagResolver } from './product-tax-code-flag.resolver';
import { IntegrationOutboxService } from './integration-outbox.service';
import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import { createIntegrationOutboxTask } from './integration-outbox.scheduled-task';
import { IntegrationInboxService } from './integration-inbox.service';
import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import { createIntegrationInboxTask } from './integration-inbox.scheduled-task';
import { createCollectionFiltersRecomputeTask } from './collection-filters-recompute.scheduled-task';
import { IntegrationInboxEventResolver } from './integration-inbox-event.resolver';
import { KafkaConsumerService } from './kafka-consumer.service';
import { KafkaConsumerBootstrapService } from './kafka-consumer-bootstrap.service';
import { KafkaStatusController } from './kafka-status.controller';
import { CategoryStreamHandler } from './handlers/category.handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { PriceTypeStreamHandler } from './handlers/price-type.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { WarehouseStreamHandler } from './handlers/warehouse.handler';
import { OrganizationStreamHandler } from './handlers/organization.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { OrderRegistrationResultHandler } from './handlers/order-registration-result.handler';
import { KafkaProducerService } from './kafka-producer.service';
import { SchemaRegistryClient } from './schema-registry.client';
import { OrderSubmittedListener } from './order-submitted.listener';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';
import { adminApiExtensions } from './api/admin.schema';

// Central-hub-only, per the external-integration-rules skill ("Branches never call the ERP [or Integration
// Service]"). The guard can't live in the providers array itself: @VendurePlugin's decorator body
// runs at module-import time, before `ErpIntegrationPlugin.options` is set by the static `init()`
// call in vendure-config.ts — so `options.instanceType` isn't known yet at that point. Instead
// every service/task that does real work (ScheduledTask, listener) checks `instanceType` at its
// own runtime, same as plugin-sync's `ProductConsumer.onModuleInit`'s
// `if (this.options.instanceType !== 'branch') return;`. On a branch instance the providers are
// still constructed (cheap, no I/O in their constructors), but never start a Kafka connection,
// the ScheduledTasks skip their own work, and it never subscribes to the order-submitted
// EventBus stream.
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
        ReservationPlugin,
    ],
    entities: [
        IntegrationOutboxEntry,
        IntegrationInboxEvent,
        KafkaConsumerStatus,
        ProductTaxCodeFlag,
    ],
    controllers: [KafkaStatusController],
    providers: [
        IntegrationOutboxService,
        IntegrationOutboxProcessorService,
        IntegrationInboxService,
        IntegrationInboxProcessorService,
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
        OrderRegistrationResultHandler,
        KafkaProducerService,
        SchemaRegistryClient,
        OrderSubmittedListener,
        ProductTaxCodeFlagService,
        {
            provide: ERP_INTEGRATION_PLUGIN_OPTIONS,
            useFactory: (): ErpIntegrationPluginOptions => ErpIntegrationPlugin.options,
        },
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [IntegrationInboxEventResolver, ProductTaxCodeFlagResolver],
    },
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createIntegrationInboxTask(ErpIntegrationPlugin.options),
            createIntegrationOutboxTask(ErpIntegrationPlugin.options),
            createCollectionFiltersRecomputeTask(ErpIntegrationPlugin.options),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class ErpIntegrationPlugin {
    static options: ErpIntegrationPluginOptions;

    static init(options: ErpIntegrationPluginOptions): Type<ErpIntegrationPlugin> {
        this.options = options;
        return ErpIntegrationPlugin;
    }
}
