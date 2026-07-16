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
import { ErpOrderStatusEvent } from '@mivend/plugin-erp-order';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationAvailabilityService } from './reservation-availability.service';
import { ReservationErpSyncService } from './reservation-erp-sync.service';
import { ReservationExpiryService } from './reservation-expiry.service';
import { ReservationExpiryWorker } from './reservation-expiry.worker';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { ReservationExtensionService } from './reservation-extension.service';
import { ReservationPaymentService } from './reservation-payment.service';
import { ReservationResolver } from './reservation.resolver';
import { ReservationService } from './reservation.service';
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

    extend type Query {
        orderReservations(orderId: ID!): [Reservation!]!
        availableStock(productVariantId: ID!): Int!
        reservationExtensionLimit(roleCode: String!): ReservationExtensionLimit
    }

    extend type Mutation {
        confirmOrder(orderId: ID!, reservationDays: Int!): [Reservation!]!
        releaseOrderReservation(orderId: ID!): Int!
        extendOrderReservation(orderId: ID!, additionalDays: Int!): [Reservation!]!
        setReservationExtensionLimit(
            roleCode: String!
            maxExtraDays: Int!
        ): ReservationExtensionLimit!
    }
`;

@VendurePlugin({
    imports: [PluginCommonModule, AccessControlPlugin],
    entities: [Reservation, ReservationExtensionLimit],
    providers: [
        ReservationService,
        ReservationPaymentService,
        ReservationExtensionService,
        ReservationErpSyncService,
        ReservationExpiryService,
        ReservationAvailabilityService,
        ReservationExtensionLimitService,
        ReservationExpiryWorker,
        {
            provide: RESERVATION_PLUGIN_OPTIONS,
            useFactory: (): ReservationPluginOptions => ReservationPlugin.options,
        },
    ],
    exports: [ReservationService],
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

        // 1C's own order-status callback is authoritative — see docs/order-flow.md "1C
        // integration" and this project's explicit decision that 1C wins in conflicts.
        subscribeAndLog(
            this.eventBus,
            ErpOrderStatusEvent,
            event =>
                this.erpSyncService.handleErpOrderStatus(event.ctx, event.orderCode, event.status),
            loggerCtx,
        );
    }
}
