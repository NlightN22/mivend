import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    Type,
    VendurePlugin,
} from '@vendure/core';
import gql from 'graphql-tag';
import { AccessControlPlugin } from '@mivend/plugin-access-control';

import { ReservationExtensionLimit } from './entities/reservation-extension-limit.entity';
import { Reservation } from './entities/reservation.entity';
import { ReservationExpiryWorker } from './reservation-expiry.worker';
import { ReservationExtensionLimitService } from './reservation-extension-limit.service';
import { ReservationResolver } from './reservation.resolver';
import { ReservationService } from './reservation.service';
import { DEFAULT_RESERVATION_DAYS, RESERVATION_PLUGIN_OPTIONS } from './types';
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
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class ReservationPlugin {
    static options: ReservationPluginOptions;

    static init(options: ReservationPluginOptions): Type<ReservationPlugin> {
        this.options = options;
        return ReservationPlugin;
    }
}
