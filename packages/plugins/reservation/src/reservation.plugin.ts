import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    OrderPlacedEvent,
    OrderStateTransitionEvent,
    PluginCommonModule,
    RequestContextService,
    RuntimeVendureConfig,
    Type,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { subscribeAndLog } from 'shared';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ChecksPlugin } from '@mivend/plugin-checks';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderPlugin, ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import { MoqPlugin } from '@mivend/plugin-moq';
import { NotificationPlugin } from '@mivend/plugin-notification';

import { ErpOrderReserve } from './entities/erp-order-reserve.entity';
import { OrderCheckFailure } from './entities/order-check-failure.entity';
import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';
import { OrderCheckStaleService } from './order-check-stale.service';
import { OrderCheckSubjectLoader } from './order-check-subject-loader.service';
import { OrderCheckSubjectRegistrar } from './order-check-subject.registrar';
import { OrderChecksListener } from './order-checks.listener';
import { OrderChecksResolver } from './order-checks.resolver';
import { adminOrderChecksSchema } from './order-checks.schema';
import { OrderChecksService } from './order-checks.service';
import { OrderContractService } from './order-contract.service';
import { addReservationCustomFields } from './reservation-custom-fields';
import { adminApiSchema } from './reservation.schema';
import { ReservationSettings } from './reservation-settings';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ProductVariantStockResolver } from './product-variant-stock.resolver';
import { StockLevelService } from './stock-level.service';
import { OrderCancelResultService } from './order-cancel-result.service';
import { OrderErpStatusService } from './order-erp-status.service';
import { OrderCancellationPortRegistry } from './order-cancellation.port';
import { OrderCancellationService } from './order-cancellation.service';
import { OrderCancelEntryService } from './order-cancel-entry.service';
import { adminCancelOrderSchema, shopCancelOrderSchema } from './order-cancel.schema';
import {
    AdminCancelOrderResolver,
    OrderCancelResultResolver,
    ShopCancelOrderResolver,
} from './order-cancel.resolver';
import { OrderCancellableResolver } from './order-cancellable.resolver';
import { ReservationErpSyncService } from './reservation-erp-sync.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { createReservationExpiryTask } from './reservation-expiry.scheduled-task';
import { createOrderCheckFailurePruneTask } from './order-check-failure-prune.scheduled-task';
import { ErpOrderReserveService } from './erp-order-reserve.service';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { OrderLineReservationResolver, ReservationViewResolver } from './reservation-view.resolver';
import { adminReservationViewSchema, shopReservationViewSchema } from './reservation-view.schema';
import { OrderLineShortfall } from './entities/order-line-shortfall.entity';
import { OrderLineAvailabilityPortRegistry } from './order-line-availability.port';
import { OrderLineEditGuard } from './order-line-edit.guard';
import { OrderLineStockSyncService } from './order-line-stock-sync.service';
import { OrderLinesEditPortRegistry } from './order-line-edit.port';
import { OrderLineEditResolver } from './order-line-edit.resolver';
import { adminOrderLineEditSchema } from './order-line-edit.schema';
import { OrderLineEditService } from './order-line-edit.service';
import { OrderLineShortfallService } from './order-line-shortfall.service';
import { ReservationViewService } from './reservation-view.service';
import { ReservationExtensionService } from './reservation-extension.service';
import { ReservationFailureService } from './reservation-failure.service';
import { ReservationPaymentService } from './reservation-payment.service';
import { ReservationReconciliationIssueService } from './reservation-reconciliation-issue.service';
import { ReservationResolver } from './reservation.resolver';
import { ReservationService } from './reservation.service';
import { ReservationWriteOffSyncService } from './reservation-write-off-sync.service';
import { RESERVATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ReservationPluginOptions } from './types';

@VendurePlugin({
    imports: [
        PluginCommonModule,
        AccessControlPlugin,
        ChecksPlugin,
        CounterpartyPlugin,
        ErpOrderPlugin,
        MoqPlugin,
        NotificationPlugin,
    ],
    entities: [
        Reservation,
        ReservationExtensionLimit,
        ReservationReconciliationIssue,
        ErpOrderReserve,
        OrderCheckFailure,
        OrderLineShortfall,
    ],
    providers: [
        OrderContractService,
        OrderLineEditService,
        OrderLineShortfallService,
        OrderLinesEditPortRegistry,
        OrderLineStockSyncService,
        OrderLineEditGuard,
        OrderLineAvailabilityPortRegistry,
        OrderCheckSubjectLoader,
        OrderCheckSubjectRegistrar,
        OrderChecksService,
        OrderCheckStaleService,
        OrderChecksListener,
        ReservationService,
        ReservationFailureService,
        ReservationPaymentService,
        ReservationExtensionService,
        ReservationErpSyncService,
        ReservationReconciliationIssueService,
        ReservationWriteOffSyncService,
        ReservationExpiryService,
        OrderCancellationPortRegistry,
        OrderCancellationService,
        OrderCancelEntryService,
        OrderCancelResultService,
        OrderErpStatusService,
        ReservationAvailabilityService,
        StockLevelService,
        ReservationExtensionLimitService,
        ErpOrderReserveService,
        ReservationViewService,
        ReservationSettings,
        {
            provide: RESERVATION_PLUGIN_OPTIONS,
            useFactory: (): ReservationPluginOptions => ReservationPlugin.options,
        },
    ],
    exports: [
        ReservationService,
        ReservationAvailabilityService,
        OrderCheckSubjectLoader,
        OrderLineAvailabilityPortRegistry,
        OrderLinesEditPortRegistry,
        OrderChecksService,
        OrderCheckStaleService,
        ReservationWriteOffSyncService,
        StockLevelService,
        OrderCancellationPortRegistry,
        OrderCancellationService,
        OrderCancelResultService,
    ],
    shopApiExtensions: {
        schema: gql`
            ${shopCancelOrderSchema}
            ${shopReservationViewSchema}
        `,
        resolvers: [
            OrderLineReservationResolver,
            ProductVariantStockResolver,
            ShopCancelOrderResolver,
            OrderCancelResultResolver,
            OrderCancellableResolver,
        ],
    },
    adminApiExtensions: {
        schema: gql`
            ${adminApiSchema}
            ${adminCancelOrderSchema}
            ${adminReservationViewSchema}
            ${adminOrderChecksSchema}
            ${adminOrderLineEditSchema}
        `,
        resolvers: [
            ReservationResolver,
            OrderChecksResolver,
            OrderLineEditResolver,
            ReservationViewResolver,
            AdminCancelOrderResolver,
            OrderCancelResultResolver,
            OrderCancellableResolver,
        ],
    },
    configuration: (config: RuntimeVendureConfig) => {
        addReservationCustomFields(config, ReservationPlugin.options);
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createReservationExpiryTask(ReservationPlugin.options),
            createOrderCheckFailurePruneTask(),
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class ReservationPlugin implements OnApplicationBootstrap {
    static options: ReservationPluginOptions;

    static init(options: ReservationPluginOptions): Type<ReservationPlugin> {
        this.options = options;
        return ReservationPlugin;
    }

    constructor(
        private eventBus: EventBus,
        private paymentService: ReservationPaymentService,
        private erpSyncService: ReservationErpSyncService,
        private requestContextService: RequestContextService,
    ) {}

    onApplicationBootstrap(): void {
        // Subscribers use subscribeAndLog (never a bare subscribe) and a fresh RequestContext, not
        // event.ctx: docs/order-flow.md "Event subscribers and the stale order save".
        subscribeAndLog(
            this.eventBus,
            OrderPlacedEvent,
            async event => {
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.paymentService.handleOrderPlaced(ctx, event.order);
            },
            loggerCtx,
        );

        // Order became paid: first Authorized/Settled out of ArrangingPayment, or any later PaymentSettled.
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            async event => {
                const firstPayment =
                    event.fromState === 'ArrangingPayment' &&
                    (event.toState === 'PaymentAuthorized' || event.toState === 'PaymentSettled');
                if (!firstPayment && event.toState !== 'PaymentSettled') {
                    return;
                }
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.paymentService.handlePaymentStateReached(ctx, event.order);
            },
            loggerCtx,
        );

        // The ERP's own order-status callback is authoritative — see docs/order-flow.md "ERP
        // integration" and this project's explicit decision that the ERP wins in conflicts.
        subscribeAndLog(
            this.eventBus,
            ErpOrderStatusEvent,
            event =>
                this.erpSyncService.handleErpOrderStatus(event.ctx, event.orderCode, event.status),
            loggerCtx,
        );
    }
}
