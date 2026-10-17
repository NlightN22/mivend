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
import gql from 'graphql-tag';
import { subscribeAndLog } from 'shared';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderStatusEvent } from './erp-order.events';
import { ErpOrderResolver } from './erp-order.resolver';
import { AdminOrderVisibilityResolver } from './admin-order-visibility.resolver';
import { DraftOrderDeliveryResolver } from './draft-order-delivery.resolver';
import { DraftOrderDeliveryService } from './draft-order-delivery.service';
import { ErpOrderService } from './erp-order.service';
import { ExternalOrderAccessStrategy } from './external-order-access.strategy';
import { ExternalOrderReconcileService } from './external-order-reconcile.service';
import { createExternalOrderReconcileTask } from './external-order-reconcile.scheduled-task';
import { ExternalOrderService } from './external-order.service';
import { ExternalOrderCounterpartyListener } from './external-order-counterparty.listener';
import { externalOrderProcess } from './external-order.guard';
import { freightPointGuard } from './freight-point.guard';
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
import { OrderVisibilityService } from './order-visibility.service';
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
import { shopApiExtensions } from './api/shop.schema';

const adminApiSchema = gql`
    extend type Query {
        visibleOrders(
            options: OrderListOptions
            managerId: ID
            customerId: ID
            search: String
        ): OrderList!
        orderStatuses: [OrderStatusInfo!]!
    }

    type OrderStatusInfo {
        code: String!
        name: String!
        description: String!
        rank: Int!
        customerGroup: String!
        customerVisible: Boolean!
        terminal: Boolean!
        warehouseStarted: Boolean!
        shipped: Boolean!
        delivered: Boolean!
        cancelled: Boolean!
        rejected: Boolean!
    }

    extend type Mutation {
        "Staff pick one of the order client's trading points on a draft order; null means self-pickup."
        setDraftOrderTradingPoint(orderId: ID!, tradingPointId: ID): Boolean!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin, CounterpartyPlugin],
    providers: [
        ErpOrderService,
        OrderStatusHistoryService,
        OrderStatusReferenceService,
        OrderStatusProvisioningService,
        OrderVisibilityService,
        OrderTargetService,
        CoreOrderScopeService,
        { provide: 'APP_INTERCEPTOR', useClass: CoreOrderScopeInterceptor },
        DraftOrderDeliveryService,
        ExternalOrderService,
        ExternalOrderCounterpartyListener,
        ExternalOrderReconcileService,
    ],
    exports: [
        ErpOrderService,
        OrderStatusHistoryService,
        OrderStatusReferenceService,
        OrderVisibilityService,
        ExternalOrderService,
    ],
    entities: [OrderStatusHistoryEntry, OrderStatusReference],
    shopApiExtensions: {
        schema: shopApiExtensions,
        resolvers: [
            ErpOrderResolver,
            OrderStatusHistoryResolver,
            OrderStatusReferenceResolver,
            ShopOrderStatusDictionaryResolver,
        ],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [
            AdminOrderVisibilityResolver,
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
                name: 'erpPaidAmount',
                type: 'float',
                nullable: true,
                readonly: true,
                label: [{ languageCode: LanguageCode.en, value: 'Paid per ERP (minor units)' }],
            },
        ];
        config.orderOptions.process = [
            ...(config.orderOptions.process ?? []),
            externalOrderProcess,
            freightPointGuard,
        ];
        config.orderOptions.orderByCodeAccessStrategy = new ExternalOrderAccessStrategy(
            config.orderOptions.orderByCodeAccessStrategy,
        );
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createExternalOrderReconcileTask(),
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
