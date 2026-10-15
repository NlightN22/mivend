import { LanguageCode, RuntimeVendureConfig } from '@vendure/core';

import { DEFAULT_STOCK_TIER_LOW_MAX, DEFAULT_STOCK_TIER_MEDIUM_MAX } from './stock-tier';
import { DEFAULT_ORDER_RESERVATION_STATE, DEFAULT_RESERVATION_DAYS } from './types';
import type { ReservationPluginOptions } from './types';

export function addReservationCustomFields(
    config: RuntimeVendureConfig,
    options: ReservationPluginOptions,
): void {
    config.customFields.Order = [
        ...(config.customFields.Order ?? []),
        {
            name: 'reservationDays',
            type: 'int' as const,
            nullable: true,
            defaultValue: options.defaultReservationDays ?? DEFAULT_RESERVATION_DAYS,
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
            label: [{ languageCode: LanguageCode.en, value: 'Stock tier: "low" up to (units)' }],
        },
        {
            name: 'stockTierMediumMax',
            type: 'int' as const,
            nullable: true,
            public: false,
            defaultValue: DEFAULT_STOCK_TIER_MEDIUM_MAX,
            label: [{ languageCode: LanguageCode.en, value: 'Stock tier: "medium" up to (units)' }],
        },
    ];
}
