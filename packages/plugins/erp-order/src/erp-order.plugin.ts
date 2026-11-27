import { concatAST } from 'graphql';
import { StaffSearchPlugin } from '@mivend/plugin-staff-search';
import { OrderSearchProvider } from './order-search.provider';
import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    LanguageCode,
    FulfillmentStateTransitionEvent,
    OrderPlacedEvent,
    OrderStateTransitionEvent,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { subscribeAndLog } from 'shared';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { SessionManagementPlugin } from '@mivend/plugin-session-management';
import { ErpOrderStatusEvent } from './erp-order.events';
import { ErpOrderResolver } from './erp-order.resolver';
import { AdminOrderVisibilityResolver } from './admin-order-visibility.resolver';
import { DraftOrderDeliveryResolver } from './draft-order-delivery.resolver';
import { DraftOrderDeliveryService } from './draft-order-delivery.service';
import { addPickingWorkStagesField } from './picking-stages-custom-field';
import { ErpOrderService } from './erp-order.service';
import { ExternalOrderAccessStrategy } from './external-order-access.strategy';
import { ExternalOrderReconcileService } from './external-order-reconcile.service';
import { createExternalOrderReconcileTask } from './external-order-reconcile.scheduled-task';
import { createExternalOrderRetentionTask } from './external-order-retention.scheduled-task';
import {
    DEFAULT_EXTERNAL_ORDER_RETENTION_MONTHS,
    ExternalOrderRetentionService,
} from './external-order-retention.service';
import { ExternalOrderService } from './external-order.service';
import { OrderEventVersionService } from './order-event-version.service';
import { ExternalOrderCounterpartyListener } from './external-order-counterparty.listener';
import { externalOrderProcess } from './external-order.guard';
import { freightPointGuard } from './freight-point.guard';
import { placementDenormalizeProcess } from './placement-denormalize.process';
import { ERP_DOCUMENT_ENTITIES } from './erp-documents/erp-document-entities';
import { ErpDocumentWriter } from './erp-documents/erp-document-writer.service';
import { AdminOrderStatusHistoryResolver } from './admin-order-status-history.resolver';
import { OrderStatusHistoryEntry } from './entities/order-status-history-entry.entity';
import { OrderStatusHistoryResolver } from './order-status-history.resolver';
import { OrderStatusHistoryService } from './order-status-history.service';
import { OrderStatusReference } from './entities/order-status-reference.entity';
import {
    OrderStatusDictionaryResolver,
    ShopOrderStatusDictionaryResolver,
} from './order-status-dictionary.resolver';
import { OrderStatusProvisioningService } from './order-status-provisioning.service';
import { OrderStatusReferenceResolver } from './order-status-reference.resolver';
import { OrderStatusReferenceService } from './order-status-reference.service';
import { OrdersAttentionResolver } from './orders-attention.resolver';
import { OrdersAttentionService } from './orders-attention.service';
import { OrderVisibilityService } from './order-visibility.service';
import { OrderVisibilityAggregatesService } from './order-visibility-aggregates.service';
import { OrderVisibilityAggregatesResolver } from './order-visibility-aggregates.resolver';
import { CoreOrderScopeInterceptor } from './core-order-scope/core-order-scope.interceptor';
import { OrderTargetService } from './core-order-scope/order-target.service';
import { CoreOrderScopeService } from './core-order-scope/core-order-scope.service';
import {
    ScopedAllocationOrderLineResolver,
    ScopedCancellationOrderLineResolver,
    ScopedCustomerOrdersResolver,
    ScopedOrderLineOrderResolver,
    ScopedOrdersResolver,
} from './core-order-scope/scoped-order-list.resolver';
import { AdminOrderCounterpartyResolver } from './admin-order-counterparty.resolver';
import { OrderCounterpartyLoader } from './order-counterparty.loader';
import { adminApiSchema } from './api/admin.schema';
import { shopApiExtensions } from './api/shop.schema';
import {
    adminLineChangesSchema,
    shopLineChangesSchema,
} from './order-line-changes/order-line-changes.schema';
import {
    AdminOrderLineChangesResolver,
    ShopOrderLineChangesResolver,
} from './order-line-changes/order-line-changes.resolver';
import { OrderLineChangesService } from './order-line-changes/order-line-changes.service';
import { SalesDocumentSourcesService } from './order-line-changes/sales-document-sources.service';
import { orderListSchema } from './api/order-list.schema';
import { OrderListService } from './order-list.service';
import { erpDocumentListSchema } from './erp-document-list/erp-document-list.schema';
import { ErpDocumentLineSummaryService } from './erp-document-list/erp-document-line-summary.service';
import { ErpDocumentListResolver } from './erp-document-list/erp-document-list.resolver';
import { ErpDocumentListService } from './erp-document-list/erp-document-list.service';

@VendurePlugin({
    imports: [
        StaffSearchPlugin,
        PluginCommonModule,
        AccessControlPlugin,
        ApprovalWorkflowPlugin,
        CounterpartyPlugin,
        SessionManagementPlugin,
    ],
    providers: [
        OrderSearchProvider,
        ErpDocumentWriter,
        ExternalOrderRetentionService,
        ErpOrderService,
        OrderStatusHistoryService,
        OrderLineChangesService,
        SalesDocumentSourcesService,
        OrderStatusReferenceService,
        OrderStatusProvisioningService,
        OrderVisibilityService,
        OrderListService,
        ErpDocumentListService,
        ErpDocumentLineSummaryService,
        OrderVisibilityAggregatesService,
        OrderCounterpartyLoader,
        OrdersAttentionService,
        OrderTargetService,
        CoreOrderScopeService,
        { provide: 'APP_INTERCEPTOR', useClass: CoreOrderScopeInterceptor },
        DraftOrderDeliveryService,
        ExternalOrderService,
        OrderEventVersionService,
        ExternalOrderCounterpartyListener,
        ExternalOrderReconcileService,
    ],
    exports: [
        ErpDocumentWriter,
        ErpOrderService,
        OrderStatusHistoryService,
        OrderStatusReferenceService,
        OrderVisibilityService,
        ExternalOrderService,
        OrderEventVersionService,
    ],
    entities: [OrderStatusHistoryEntry, OrderStatusReference, ...ERP_DOCUMENT_ENTITIES],
    shopApiExtensions: {
        schema: concatAST([shopApiExtensions, shopLineChangesSchema]),
        resolvers: [
            ShopOrderLineChangesResolver,
            ErpOrderResolver,
            OrderStatusHistoryResolver,
            OrderStatusReferenceResolver,
            ShopOrderStatusDictionaryResolver,
        ],
    },
    adminApiExtensions: {
        schema: concatAST([
            adminApiSchema,
            orderListSchema,
            erpDocumentListSchema,
            adminLineChangesSchema,
        ]),
        resolvers: [
            AdminOrderVisibilityResolver,
            ErpDocumentListResolver,
            AdminOrderStatusHistoryResolver,
            AdminOrderLineChangesResolver,
            AdminOrderCounterpartyResolver,
            OrderStatusReferenceResolver,
            OrderVisibilityAggregatesResolver,
            OrdersAttentionResolver,
            OrderStatusDictionaryResolver,
            DraftOrderDeliveryResolver,
            ScopedOrdersResolver,
            ScopedCustomerOrdersResolver,
            ScopedOrderLineOrderResolver,
            ScopedAllocationOrderLineResolver,
            ScopedCancellationOrderLineResolver,
        ],
    },
    configuration: (config: RuntimeVendureConfig): RuntimeVendureConfig => {
        config.customFields.Order = [
            ...(config.customFields.Order ?? []),
            {
                name: 'isExternal',
                type: 'boolean',
                nullable: false,
                defaultValue: false,
                label: [{ languageCode: LanguageCode.en, value: 'From ERP' }],
            },
            {
                name: 'counterpartyId',
                type: 'string',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Counterparty' }],
            },
            {
                name: 'pendingCounterpartyErpId',
                type: 'string',
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Pending counterparty ERP ID' }],
            },
            {
                name: 'externalLinesIncomplete',
                type: 'boolean',
                nullable: false,
                defaultValue: false,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Lines incomplete' }],
            },
            {
                name: 'erpChangedVersion',
                type: 'string',
                nullable: true,
                public: false,
                readonly: true,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Newest order-changed version applied',
                    },
                ],
            },
            {
                name: 'erpStateVersion',
                type: 'string',
                nullable: true,
                public: false,
                readonly: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Newest order-state version applied' },
                ],
            },
            {
                name: 'erpIsPosted',
                type: 'boolean',
                nullable: true,
                public: false,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Posted in the ERP' }],
            },
            {
                name: 'erpMarkedForDeletion',
                type: 'boolean',
                nullable: true,
                public: false,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Marked for deletion in the ERP' }],
            },
            {
                name: 'erpStatusBeforeUnposted',
                type: 'string',
                nullable: true,
                public: false,
                readonly: true,
                label: [
                    { languageCode: LanguageCode.en, value: 'Status before not-posted cancel' },
                ],
            },
            {
                name: 'erpPaidAmount',
                type: 'float',
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Paid per ERP (minor units)' }],
            },
            {
                // Kept on the order because the reserve rows arrive on a separate stream.
                name: 'erpReserveUntil',
                type: 'datetime',
                nullable: true,
                public: false,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'ERP reserve until' }],
            },
            ...(
                [
                    ['erpAccounting', 'ERP accounting flags (JSON)'],
                    ['erpLinkedDocuments', 'ERP linked document flags (JSON)'],
                    ['erpShippedInSettlements', 'ERP shipped in settlements per line (JSON)'],
                ] as const
            ).map(([name, value]) => ({
                name,
                type: 'text' as const,
                nullable: true,
                public: false,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value }],
            })),
        ];
        addPickingWorkStagesField(config);
        config.orderOptions.process = [
            ...(config.orderOptions.process ?? []),
            externalOrderProcess,
            freightPointGuard,
            placementDenormalizeProcess,
        ];
        config.orderOptions.orderByCodeAccessStrategy = new ExternalOrderAccessStrategy(
            config.orderOptions.orderByCodeAccessStrategy,
        );
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createExternalOrderReconcileTask(),
            createExternalOrderRetentionTask(),
        ];
        config.customFields.GlobalSettings = [
            ...(config.customFields.GlobalSettings ?? []),
            {
                name: 'externalOrderRetentionMonths',
                type: 'int' as const,
                nullable: true,
                public: false,
                defaultValue: DEFAULT_EXTERNAL_ORDER_RETENTION_MONTHS,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'ERP orders marked for deletion: keep for (months after the order date)',
                    },
                ],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class ErpOrderPlugin implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly erpOrderService: ErpOrderService,
    ) {}

    onApplicationBootstrap(): void {
        // Branch visibility must not wait for payment: OrderPlacedEvent fires only after payment is settled.
        // AddingItems and Draft both denormalize branchId; admin-created orders skip AddingItems entirely.
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            event => {
                if (event.fromState !== 'AddingItems' && event.fromState !== 'Draft') {
                    return Promise.resolve();
                }
                return this.erpOrderService.onOrderPlaced(event.ctx, event.order);
            },
            'ErpOrderPlugin',
        );

        subscribeAndLog(
            this.eventBus,
            OrderPlacedEvent,
            event => this.erpOrderService.onOrderPlaced(event.ctx, event.order),
            'ErpOrderPlugin',
        );

        subscribeAndLog(
            this.eventBus,
            FulfillmentStateTransitionEvent,
            event => this.erpOrderService.onFulfillmentStateChanged(event.ctx, event.fulfillment),
            'ErpOrderPlugin',
        );

        subscribeAndLog(
            this.eventBus,
            ErpOrderStatusEvent,
            event =>
                this.erpOrderService.updateStatus(event.ctx, {
                    orderCode: event.orderCode,
                    status: event.status,
                    erpOrderId: event.erpOrderId,
                }),
            'ErpOrderPlugin',
        );
    }
}
