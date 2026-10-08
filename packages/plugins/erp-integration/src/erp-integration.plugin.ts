import { PluginCommonModule, RuntimeVendureConfig, Type, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { RetroBonusPlugin } from '@mivend/plugin-retro-bonus';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { DocumentsPlugin } from '@mivend/plugin-documents';
import { NotificationPlugin } from '@mivend/plugin-notification';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { IntegrationOutboxEntry } from './entities/integration-outbox-entry.entity';
import { IntegrationInboxEvent } from './entities/integration-inbox-event.entity';
import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';
import { KafkaConsumerLagEntry } from './entities/kafka-consumer-lag.entity';
import { ProductTaxCodeFlag } from './entities/product-tax-code-flag.entity';
import { ProductCategoryFlag } from './entities/product-category-flag.entity';
import { Manufacturer } from './entities/manufacturer.entity';
import { ProductPhoto } from './entities/product-photo.entity';
import { ProductPhotoStreamHandler } from './handlers/product-photo.handler';
import { ProductPhotoSyncService } from './product-photo-sync.service';
import { ProductPhotoRecoveryService } from './product-photo-recovery.service';
import { createProductPhotoRecoveryTask } from './product-photo-recovery.scheduled-task';
import { ProductPhotoResolver } from './product-photo.resolver';
import { ResyncReplayClient } from './resync-replay.client';
import { ProductVariantBarcode } from './entities/product-variant-barcode.entity';
import { ProductCharacteristic } from './entities/product-characteristic.entity';
import { ProductManufacturerCode } from './entities/product-manufacturer-code.entity';
import { ErpReconciliationIssue } from './entities/erp-reconciliation-issue.entity';
import { ProductTaxCodeFlagService } from './product-tax-code-flag.service';
import { ProductCategoryFlagService } from './product-category-flag.service';
import { CharacteristicFacetService } from './characteristic-facet.service';
import { ManufacturerFacetService } from './manufacturer-facet.service';
import { ManufacturerService } from './manufacturer.service';
import { ProductAncillaryDataService } from './product-ancillary-data.service';
import { ProductTaxCodeFlagResolver } from './product-tax-code-flag.resolver';
import { IntegrationOutboxService } from './integration-outbox.service';
import { IntegrationOutboxProcessorService } from './integration-outbox-processor.service';
import { createIntegrationOutboxTask } from './integration-outbox.scheduled-task';
import { IntegrationInboxHealthService } from './integration-inbox-health.service';
import { IntegrationInboxService } from './integration-inbox.service';
import { IntegrationInboxProcessorService } from './integration-inbox-processor.service';
import {
    createIntegrationInboxBulkTask,
    createIntegrationInboxCriticalTask,
    createIntegrationInboxReplaySweepTask,
    createIntegrationInboxRetentionTask,
    createIntegrationInboxUserTask,
} from './integration-inbox.scheduled-task';
import { createCreditLimitRecomputeTask } from './credit-limit-recompute.scheduled-task';
import { createCategoryTreeRecomputeTask } from './category-tree-recompute.scheduled-task';
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
import { DepartmentStreamHandler } from './handlers/department.handler';
import { PositionStreamHandler } from './handlers/position.handler';
import { CounterpartyStreamHandler } from './handlers/counterparty.handler';
import { CounterpartyCreditBalanceStreamHandler } from './handlers/counterparty-credit-balance.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { StorageLocationAssignment } from './entities/storage-location-assignment.entity';
import { UserStreamHandler } from './handlers/user.handler';
import { OrderRegistrationResultHandler } from './handlers/order-registration-result.handler';
import { OrderChangedStreamHandler } from './handlers/order-changed.handler';
import { PromoRuleStreamHandler } from './handlers/promo-rule.handler';
import { DiscountRuleStreamHandler } from './handlers/discount-rule.handler';
import { GrantedDiscountStreamHandler } from './handlers/granted-discount.handler';
import { GrantedRetroBonusStreamHandler } from './handlers/granted-retro-bonus.handler';
import { RetroBonusRuleStreamHandler } from './handlers/retro-bonus-rule.handler';
import { VatRateStreamHandler } from './handlers/vat-rate.handler';
import { PointOfSaleStreamHandler } from './handlers/point-of-sale.handler';
import { ContractStreamHandler } from './handlers/contract.handler';
import { ManufacturerStreamHandler } from './handlers/manufacturer.handler';
import { UnitStreamHandler } from './handlers/unit.handler';
import { UnitRecord } from './entities/unit-record.entity';
import { RegionRecord } from './entities/region-record.entity';
import { LegalFormRecord } from './entities/legal-form-record.entity';
import { BankRecord } from './entities/bank-record.entity';
import { BankAccountRecord } from './entities/bank-account-record.entity';
import { BankStreamHandler } from './handlers/bank.handler';
import { BankAccountStreamHandler } from './handlers/bank-account.handler';
import { RegionStreamHandler } from './handlers/region.handler';
import { LegalFormStreamHandler } from './handlers/legal-form.handler';
import { UnitLookupService } from './unit-lookup.service';
import { TaxCategoryAutoCreateService } from './tax-category-auto-create.service';
import { TaxZoneService } from './tax-zone.service';
import { KafkaProducerService } from './kafka-producer.service';
import { SchemaRegistryClient } from './schema-registry.client';
import { OrderSubmittedListener } from './order-submitted.listener';
import { CategoryOverrideRecomputeListener } from './category-override-recompute.listener';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, isEmailOnlyWorker } from './types';
import type { ErpIntegrationPluginOptions } from './types';
import { adminApiExtensions } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';
import { ProductManufacturerService } from './product-manufacturer.service';
import {
    ProductManufacturerResolver,
    SearchResultGalleryResolver,
    SearchResultManufacturerResolver,
} from './product-manufacturer.resolver';
import { ProductGalleryService } from './product-gallery.service';
import { ReconciliationSummaryClient } from './reconciliation-summary.client';
import { ReconciliationLocalCountsService } from './reconciliation-local-counts.service';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationResolver } from './reconciliation.resolver';
import { createReconciliationTask } from './reconciliation.scheduled-task';
import { KafkaLagPollerService } from './kafka-lag-poller.service';
import { createKafkaLagPollTask } from './kafka-lag-poll.scheduled-task';
import { KafkaLagResolver } from './kafka-lag.resolver';
import { IntegrationStreamHealthResolver } from './integration-stream-health.resolver';
import { IntegrationOutboxHealthService } from './integration-outbox-health.service';
import { ContractVersionClient } from './contract-version.client';
import { VariantUnitHealthService } from './variant-unit-health.service';
import { IntegrationEventListResolver } from './integration-event-list.resolver';
import { IntegrationInboxIssueResolver } from './integration-inbox-issue.resolver';
import { IntegrationEventListService } from './integration-event-list.service';
import { IntegrationInboxReplayStateService } from './integration-inbox-replay-state.service';
import { IntegrationInboxReplayService } from './integration-inbox-replay.service';
import { OutboundGateway } from './outbound-gateway';
import { IntegrationOutboxRecoveryService } from './integration-outbox-recovery.service';
import { IntegrationOutboxRecoveryResolver } from './integration-outbox-recovery.resolver';
import { OrderSubmittedBuilder } from './order-submitted.builder';

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
        RetroBonusPlugin,
        AccessControlPlugin,
        CounterpartyPlugin,
        DocumentsPlugin,
        ReservationPlugin,
        NotificationPlugin,
    ],
    entities: [
        StorageLocationAssignment,
        IntegrationOutboxEntry,
        IntegrationInboxEvent,
        KafkaConsumerStatus,
        KafkaConsumerLagEntry,
        ProductTaxCodeFlag,
        ProductCategoryFlag,
        Manufacturer,
        ProductPhoto,
        ProductVariantBarcode,
        ProductCharacteristic,
        ProductManufacturerCode,
        ErpReconciliationIssue,
        UnitRecord,
        RegionRecord,
        LegalFormRecord,
        BankRecord,
        BankAccountRecord,
    ],
    controllers: [KafkaStatusController],
    providers: [
        IntegrationOutboxService,
        IntegrationOutboxProcessorService,
        IntegrationInboxService,
        IntegrationInboxHealthService,
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
        DepartmentStreamHandler,
        PositionStreamHandler,
        CounterpartyStreamHandler,
        CounterpartyCreditBalanceStreamHandler,
        StorageLocationStreamHandler,
        UserStreamHandler,
        OrderRegistrationResultHandler,
        OrderChangedStreamHandler,
        PromoRuleStreamHandler,
        DiscountRuleStreamHandler,
        GrantedDiscountStreamHandler,
        RetroBonusRuleStreamHandler,
        GrantedRetroBonusStreamHandler,
        VatRateStreamHandler,
        PointOfSaleStreamHandler,
        ContractStreamHandler,
        UnitStreamHandler,
        ManufacturerStreamHandler,
        RegionStreamHandler,
        LegalFormStreamHandler,
        BankStreamHandler,
        BankAccountStreamHandler,
        ProductPhotoStreamHandler,
        ProductPhotoSyncService,
        ProductPhotoRecoveryService,
        ResyncReplayClient,
        UnitLookupService,
        TaxCategoryAutoCreateService,
        TaxZoneService,
        KafkaProducerService,
        SchemaRegistryClient,
        OrderSubmittedListener,
        CategoryOverrideRecomputeListener,
        ProductTaxCodeFlagService,
        ProductManufacturerService,
        ProductGalleryService,
        ProductCategoryFlagService,
        ManufacturerService,
        ManufacturerFacetService,
        CharacteristicFacetService,
        ProductAncillaryDataService,
        ReconciliationSummaryClient,
        IntegrationOutboxHealthService,
        ContractVersionClient,
        VariantUnitHealthService,
        IntegrationEventListService,
        IntegrationInboxReplayService,
        IntegrationInboxReplayStateService,
        OutboundGateway,
        IntegrationOutboxRecoveryService,
        OrderSubmittedBuilder,
        ReconciliationLocalCountsService,
        ReconciliationService,
        KafkaLagPollerService,
        {
            provide: ERP_INTEGRATION_PLUGIN_OPTIONS,
            useFactory: (): ErpIntegrationPluginOptions => ErpIntegrationPlugin.options,
        },
    ],
    adminApiExtensions: {
        schema: adminApiExtensions,
        resolvers: [
            IntegrationInboxEventResolver,
            ProductTaxCodeFlagResolver,
            ReconciliationResolver,
            KafkaLagResolver,
            IntegrationStreamHealthResolver,
            IntegrationEventListResolver,
            IntegrationInboxIssueResolver,
            IntegrationOutboxRecoveryResolver,
            ProductPhotoResolver,
        ],
    },
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [
            ProductManufacturerResolver,
            SearchResultManufacturerResolver,
            SearchResultGalleryResolver,
        ],
    },
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        // worker-email.ts never runs erp-integration's own tasks (#149) — see isEmailOnlyWorker.
        if (!isEmailOnlyWorker(config.jobQueueOptions?.activeQueues)) {
            config.schedulerOptions.tasks = [
                ...(config.schedulerOptions.tasks ?? []),
                createIntegrationInboxCriticalTask(ErpIntegrationPlugin.options),
                createIntegrationInboxUserTask(ErpIntegrationPlugin.options),
                createIntegrationInboxBulkTask(ErpIntegrationPlugin.options),
                createIntegrationInboxRetentionTask(ErpIntegrationPlugin.options),
                createIntegrationInboxReplaySweepTask(ErpIntegrationPlugin.options),
                createIntegrationOutboxTask(ErpIntegrationPlugin.options),
                createCollectionFiltersRecomputeTask(ErpIntegrationPlugin.options),
                createCategoryTreeRecomputeTask(ErpIntegrationPlugin.options),
                createCreditLimitRecomputeTask(ErpIntegrationPlugin.options),
                createReconciliationTask(ErpIntegrationPlugin.options),
                createKafkaLagPollTask(ErpIntegrationPlugin.options),
                createProductPhotoRecoveryTask(ErpIntegrationPlugin.options),
            ];
        }
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
