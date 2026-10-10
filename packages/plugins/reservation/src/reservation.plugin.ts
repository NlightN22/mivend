import { OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    LanguageCode,
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
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderPlugin, ErpOrderStatusEvent } from '@mivend/plugin-erp-order';
import { NotificationPlugin } from '@mivend/plugin-notification';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationReconciliationIssue } from './entities/reservation-reconciliation-issue.entity';
import { OrderContractService } from './order-contract.service';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { DEFAULT_STOCK_TIER_LOW_MAX, DEFAULT_STOCK_TIER_MEDIUM_MAX } from './stock-tier';
import { ProductVariantStockResolver } from './product-variant-stock.resolver';
import { StockLevelService } from './stock-level.service';
import { OrderCancelResultService } from './order-cancel-result.service';
import { OrderErpStatusService } from './order-erp-status.service';
import { OrderCancellationPortRegistry } from './order-cancellation.port';
import { OrderCancellationService } from './order-cancellation.service';
import { ReservationErpSyncService } from './reservation-erp-sync.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { createReservationExpiryTask } from './reservation-expiry.scheduled-task';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { ReservationExtensionService } from './reservation-extension.service';
import { ReservationFailureService } from './reservation-failure.service';
import { ReservationPaymentService } from './reservation-payment.service';
import { ReservationReconciliationIssueService } from './reservation-reconciliation-issue.service';
import { ReservationResolver } from './reservation.resolver';
import { ReservationService } from './reservation.service';
import { ReservationWriteOffSyncService } from './reservation-write-off-sync.service';
import {
    DEFAULT_ORDER_RESERVATION_STATE,
    DEFAULT_RESERVATION_DAYS,
    PAYMENT_CLASSIFICATIONS,
    PAYMENT_CLASSIFICATION_LABELS,
    RESERVATION_PLUGIN_OPTIONS,
    loggerCtx,
} from './types';
import type { ReservationPluginOptions } from './types';

const adminApiSchema = gql`
    type Reservation {
        id: ID!
        orderId: ID!
        orderLineId: ID!
        productVariantId: ID!
        quantity: Int!
        status: String!
        reservedAt: DateTime!
        expiresAt: DateTime!
        releasedAt: DateTime
        stockLocationId: ID!
        creationMethod: String!
        confirmedByAdministratorId: ID
        interventionFlaggedAt: DateTime
        erpOperationId: String!
        erpReleaseOperationId: String
        erpConfirmedAt: DateTime
    }

    type ReservationExtensionLimit {
        roleCode: String!
        maxExtraDays: Int!
    }

    type ReservationReconciliationIssue {
        id: ID!
        issueType: String!
        orderId: ID!
        productVariantId: ID
        localQuantity: Int
        erpQuantity: Int
        externalProductId: String
        orderEntityId: ID!
        detectedAt: DateTime!
        status: String!
    }

    type ReservationReconciliationIssueList {
        items: [ReservationReconciliationIssue!]!
        totalItems: Int!
    }

    input OpenReservationReconciliationIssueListOptions {
        take: Int
        skip: Int
    }

    type OrderContractOption {
        erpId: String!
        name: String
        organizationId: String!
        organizationName: String
        paymentKind: String
        isMain: Boolean!
        isSelected: Boolean!
    }

    extend type Query {
        "Active contracts of the order's counterparty; the one the order is registered under is marked (#205)."
        orderContracts(orderId: ID!): [OrderContractOption!]!
        orderReservations(orderId: ID!): [Reservation!]!
        availableStock(productVariantId: ID!): Int!
        reservationExtensionLimit(roleCode: String!): ReservationExtensionLimit
        "Open reservation/ERP drift issues, newest first — for the manager-portal dashboard's integration-health panel (issue #76)."
        openReservationReconciliationIssues(
            options: OpenReservationReconciliationIssueListOptions
        ): ReservationReconciliationIssueList!
    }

    extend type Mutation {
        confirmOrder(orderId: ID!, reservationDays: Int!): [Reservation!]!
        releaseOrderReservation(orderId: ID!): Int!
        "Change the contract the order is registered under; only before it is reserved (#205)."
        setOrderContract(orderId: ID!, contractId: String!): [OrderContractOption!]!
        extendOrderReservation(orderId: ID!, additionalDays: Int!): [Reservation!]!
        setReservationExtensionLimit(
            roleCode: String!
            maxExtraDays: Int!
        ): ReservationExtensionLimit!
    }
`;

@VendurePlugin({
    imports: [
        PluginCommonModule,
        AccessControlPlugin,
        CounterpartyPlugin,
        ErpOrderPlugin,
        NotificationPlugin,
    ],
    entities: [Reservation, ReservationExtensionLimit, ReservationReconciliationIssue],
    providers: [
        OrderContractService,
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
        OrderCancelResultService,
        OrderErpStatusService,
        ReservationAvailabilityService,
        StockLevelService,
        ReservationExtensionLimitService,
        {
            provide: RESERVATION_PLUGIN_OPTIONS,
            useFactory: (): ReservationPluginOptions => ReservationPlugin.options,
        },
    ],
    exports: [
        ReservationService,
        ReservationWriteOffSyncService,
        StockLevelService,
        OrderCancellationPortRegistry,
        OrderCancellationService,
        OrderCancelResultService,
    ],
    shopApiExtensions: {
        resolvers: [ProductVariantStockResolver],
    },
    adminApiExtensions: {
        schema: adminApiSchema,
        resolvers: [ReservationResolver],
    },
    configuration: (config: RuntimeVendureConfig) => {
        config.customFields.Order = [
            ...(config.customFields.Order ?? []),
            {
                name: 'reservationDays',
                type: 'int' as const,
                nullable: true,
                defaultValue:
                    ReservationPlugin.options?.defaultReservationDays ?? DEFAULT_RESERVATION_DAYS,
                // Staff-only — never exposed to the customer-facing Shop API, per
                // docs/architecture.md's reservation domain note.
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Reservation period (days)' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'How many days stock is held for this order once confirmed by staff.',
                    },
                ],
            },
            {
                name: 'reservationState',
                type: 'string' as const,
                nullable: false,
                defaultValue: DEFAULT_ORDER_RESERVATION_STATE,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Reservation state' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'NOT_REQUIRED | AWAITING_CONFIRMATION | RESERVED | EXPIRED | RELEASED | FAILED — see docs/order-flow.md.',
                    },
                ],
            },
            {
                name: 'reservationFailureReason',
                type: 'string' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Reservation failure reason' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Why the last automatic reserve failed (INSUFFICIENT_STOCK | ERP_EXPORT_DATA_MISSING | NOT_ELIGIBLE | UNEXPECTED); cleared by a successful reserve.',
                    },
                ],
            },
            {
                name: 'reservationFailureDetail',
                type: 'text' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Reservation failure detail' }],
            },
            {
                name: 'reservationFailedAt',
                type: 'datetime' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Reservation failed at' }],
            },
            {
                name: 'cancelRequestedAt',
                type: 'datetime' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Cancel requested at' }],
            },
            {
                name: 'cancelReason',
                type: 'string' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Cancel reason' }],
            },
            {
                name: 'cancelRequestStatus',
                type: 'string' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Cancel request status' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'REQUESTED | REFUSED | CANCELLED — the ERP answer to the order cancel request.',
                    },
                ],
            },
            {
                name: 'cancelRefusalReason',
                type: 'text' as const,
                nullable: true,
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Cancel refusal reason' }],
            },
        ];
        config.customFields.GlobalSettings = [
            ...(config.customFields.GlobalSettings ?? []),
            {
                name: 'autoReserveOnPlacement',
                type: 'boolean' as const,
                nullable: true,
                public: false,
                defaultValue: false,
                label: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Reserve stock and send to ERP right when the order is placed',
                    },
                ],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Skips manual confirmation for non-prepaid orders.',
                    },
                ],
            },
            {
                name: 'stockTierLowMax',
                type: 'int' as const,
                nullable: true,
                public: false,
                defaultValue: DEFAULT_STOCK_TIER_LOW_MAX,
                label: [
                    { languageCode: LanguageCode.en, value: 'Stock tier: "low" up to (units)' },
                ],
            },
            {
                name: 'stockTierMediumMax',
                type: 'int' as const,
                nullable: true,
                public: false,
                defaultValue: DEFAULT_STOCK_TIER_MEDIUM_MAX,
                label: [
                    { languageCode: LanguageCode.en, value: 'Stock tier: "medium" up to (units)' },
                ],
            },
        ];
        config.customFields.PaymentMethod = [
            ...(config.customFields.PaymentMethod ?? []),
            {
                name: 'paymentClassification',
                type: 'string' as const,
                nullable: true,
                // Built from PAYMENT_CLASSIFICATIONS (types.ts), the single source of truth for
                // this fixed set — never list a value here that isn't in that array, or the
                // Admin UI dropdown and the code's `=== 'PREPAID'` checks can drift apart.
                options: PAYMENT_CLASSIFICATIONS.map(value => ({
                    value,
                    label: [
                        {
                            languageCode: LanguageCode.en,
                            value: PAYMENT_CLASSIFICATION_LABELS[value],
                        },
                    ],
                })),
                public: false,
                label: [{ languageCode: LanguageCode.en, value: 'Payment classification' }],
                // Configured per payment method in the native Vendure Admin UI (port 3000) — see
                // docs/order-flow.md "Payment classification (decided)". Unset (and CREDIT/
                // OFFLINE_TERMS) all resolve to non-prepaid for reservation purposes: until an
                // admin sets online-stub -> PREPAID here, it will also (correctly, by that same
                // rule) enter the AWAITING_CONFIRMATION queue — self-correcting once configured,
                // not a bug to special-case in code.
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'PREPAID auto-reserves on payment (stage 4); CREDIT/OFFLINE_TERMS/unset require manual confirmation.',
                    },
                ],
            },
            {
                name: 'reservationTtlDays',
                type: 'int' as const,
                nullable: true,
                public: false,
                label: [
                    { languageCode: LanguageCode.en, value: 'Reservation TTL override (days)' },
                ],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Falls back to 30 days (PREPAID) / 7 days (non-prepaid) when unset — see docs/order-flow.md "TTL (decided)".',
                    },
                ],
            },
        ];
        config.schedulerOptions.tasks = [
            ...(config.schedulerOptions.tasks ?? []),
            createReservationExpiryTask(ReservationPlugin.options),
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
        // All three subscribers below go through `subscribeAndLog` (packages/shared) so a
        // failure is always logged, never silently swallowed — see that helper's doc comment
        // for why a bare fire-and-forget `.subscribe()` is uniquely dangerous here (a real,
        // previously-hidden bug, 2026-07-15).
        //
        // The first two also use a FRESH RequestContext (`requestContextService.create()`),
        // never `event.ctx` — root-caused live 2026-07-15 alongside the bug above: `event.ctx`
        // is the *same still-open transaction* as the `OrderService.transitionToState()` call
        // that published this event. That outer call does one more unconditional
        // `.save(order, {reload: false})` of its OWN in-memory `order` object *after* publishing
        // (see @vendure/core's order.service.js) — using the stale `customFields` that object
        // was loaded with. Since this subscriber isn't awaited by that outer call, its write can
        // land before that trailing save, which then silently clobbers it back (last write via
        // that shared connection wins) — the `Reservation` row itself was created successfully
        // (different table), but `Order.customFields.reservationState` kept reverting to
        // 'NOT_REQUIRED' no matter what. A fresh ctx runs on its own connection/transaction,
        // sidestepping both the clobber and the underlying single-client concurrent-query hazard
        // (`pg`'s "Calling client.query() when the client is already executing a query" warning,
        // also observed live). See OrderSyncService (`packages/plugins/sync`) for the same
        // established pattern.
        subscribeAndLog(
            this.eventBus,
            OrderPlacedEvent,
            async event => {
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.paymentService.handleOrderPlaced(ctx, event.order);
            },
            loggerCtx,
        );

        // Mirrors Vendure's own DefaultStockAllocationStrategy.shouldAllocateStock guard — same
        // signal, so the auto-prepaid reservation path fires exactly when Vendure's own stock
        // allocation would (see docs/order-flow.md "Prepaid — an EventBus listener...").
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            async event => {
                if (
                    event.fromState !== 'ArrangingPayment' ||
                    (event.toState !== 'PaymentAuthorized' && event.toState !== 'PaymentSettled')
                ) {
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
