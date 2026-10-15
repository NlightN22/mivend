import { PluginCommonModule, RuntimeVendureConfig, Type, VendurePlugin } from '@vendure/core';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { CustomerPricingPlugin } from '@mivend/plugin-customer-pricing';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { RetroBonusPlugin } from '@mivend/plugin-retro-bonus';
import { SettlementPlugin } from '@mivend/plugin-settlement';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { DocumentsPlugin } from '@mivend/plugin-documents';
import { NotificationPlugin } from '@mivend/plugin-notification';
import { OrderIdentityPlugin } from '@mivend/plugin-order-identity';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { ProductPhotoSyncService } from './product-photo-sync.service';
import { ProductPhotoRecoveryService } from './product-photo-recovery.service';
import { createProductPhotoRecoveryTask } from './product-photo-recovery.scheduled-task';
import { ProductPhotoResolver } from './product-photo.resolver';
import { ResyncReplayClient } from './resync-replay.client';
import { ProductTaxCodeFlagService } from './product-tax-code-flag.service';
import { StockOrganizationReadService } from './stock-organization-read.service';
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
import { IntegrationInboxRetentionService } from './integration-inbox-retention.service';
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
import {
    ERP_CALLBACK_DEV_PLACEHOLDER_KEY,
    isRestSurfaceEnabled,
    productionRejectValues,
} from 'shared';
import { MoqPlugin } from '@mivend/plugin-moq';
import { UnitLookupService } from './unit-lookup.service';
import { SearchResultSalesUnitResolver } from './search-result-sales-unit.resolver';
import { SearchResultPackagingLevelsResolver } from './search-result-packaging-levels.resolver';
import { SearchResultPackagingLevelsService } from './search-result-packaging-levels.service';
import { VariantSalesUnitService } from './variant-sales-unit.service';
import { ProductPackagingLevelsResolver } from './product-packaging-levels.resolver';
import { ProductPackagingLevelsService } from './product-packaging-levels.service';
import { TaxCategoryAutoCreateService } from './tax-category-auto-create.service';
import { TaxZoneService } from './tax-zone.service';
import { KafkaProducerService } from './kafka-producer.service';
import { SchemaRegistryClient } from './schema-registry.client';
import { OrderSubmittedListener } from './order-submitted.listener';
import { CategoryOverrideRecomputeListener } from './category-override-recompute.listener';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, isEmailOnlyWorker } from './types';
import type { ErpIntegrationPluginOptions } from './types';
import { PLUGIN_ENTITIES } from './plugin-entities';
import { STREAM_HANDLERS } from './plugin-stream-handlers';
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
import { RejectedOrderHealthService } from './rejected-order-health.service';
import { IntegrationEventListResolver } from './integration-event-list.resolver';
import { IntegrationInboxIssueResolver } from './integration-inbox-issue.resolver';
import { IntegrationEventListService } from './integration-event-list.service';
import { IntegrationInboxReplayStateService } from './integration-inbox-replay-state.service';
import { IntegrationInboxReplayService } from './integration-inbox-replay.service';
import { OrderCancellationAdapter } from './order-cancellation.adapter';
import { OutboundGateway } from './outbound-gateway';
import { IntegrationOutboxRecoveryService } from './integration-outbox-recovery.service';
import { IntegrationOutboxRecoveryResolver } from './integration-outbox-recovery.resolver';
import { OrderSubmittedBuilder } from './order-submitted.builder';

// Instance guards are runtime checks: the decorator runs before init() sets options.instanceType.
// kafkaEnabled gates Kafka even on central: 'central' permits Integration Service, not every run.
@VendurePlugin({
    imports: [
        PluginCommonModule,
        ErpOrderPlugin,
        CustomerPricingPlugin,
        PriceEntryPlugin,
        RetroBonusPlugin,
        SettlementPlugin,
        AccessControlPlugin,
        MoqPlugin,
        CounterpartyPlugin,
        DocumentsPlugin,
        ReservationPlugin,
        OrderIdentityPlugin,
        NotificationPlugin,
    ],
    entities: PLUGIN_ENTITIES,
    exports: [StockOrganizationReadService],
    controllers: isRestSurfaceEnabled('ERP_CALLBACK_ENABLED', 'ERP_CALLBACK_API_KEY', {
        rejectValues: productionRejectValues(ERP_CALLBACK_DEV_PLACEHOLDER_KEY),
    })
        ? [KafkaStatusController]
        : [],
    providers: [
        IntegrationOutboxService,
        IntegrationOutboxProcessorService,
        IntegrationInboxService,
        IntegrationInboxRetentionService,
        IntegrationInboxHealthService,
        IntegrationInboxProcessorService,
        KafkaConsumerService,
        KafkaConsumerBootstrapService,
        ...STREAM_HANDLERS,
        ProductPhotoSyncService,
        ProductPhotoRecoveryService,
        ResyncReplayClient,
        UnitLookupService,
        ProductPackagingLevelsService,
        VariantSalesUnitService,
        SearchResultPackagingLevelsService,
        TaxCategoryAutoCreateService,
        TaxZoneService,
        KafkaProducerService,
        SchemaRegistryClient,
        OrderSubmittedListener,
        OrderCancellationAdapter,
        CategoryOverrideRecomputeListener,
        ProductTaxCodeFlagService,
        StockOrganizationReadService,
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
        RejectedOrderHealthService,
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
            ProductPackagingLevelsResolver,
            SearchResultSalesUnitResolver,
            SearchResultPackagingLevelsResolver,
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
