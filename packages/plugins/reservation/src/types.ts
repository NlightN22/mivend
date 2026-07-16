declare module '@vendure/core' {
    interface CustomOrderFields {
        reservationDays?: number | null;
        reservationState?: OrderReservationState;
        // Owned by @mivend/plugin-erp-order (declaration merging) — reserveOrder() reads this to
        // denormalize onto Reservation.branchId without taking a package dependency on
        // erp-order, see docs/access-control.md's branch-scope axis.
        branchId?: string | null;
    }
    interface CustomPaymentMethodFields {
        paymentClassification?: string | null;
        reservationTtlDays?: number | null;
    }
    // Owned by @mivend/plugin-moq (declaration merging) — reserveOrder()'s defense-in-depth
    // multiplicity guard reads this without taking a package dependency on plugin-moq, see
    // docs/order-flow.md "Pack-size / MOQ".
    interface CustomProductVariantFields {
        multiplicity?: number | null;
    }
}

export const loggerCtx = 'ReservationPlugin';

export const RESERVATION_PLUGIN_OPTIONS = Symbol('RESERVATION_PLUGIN_OPTIONS');

// Manual/non-prepaid default per docs/order-flow.md "TTL (decided)" (7 days non-prepaid / 30
// days prepaid — the prepaid default is resolved separately, see
// ReservationService.resolveReservationTtlDays).
export const DEFAULT_RESERVATION_DAYS = 7;
export const DEFAULT_PREPAID_RESERVATION_TTL_DAYS = 30;
export const EXPIRY_POLL_INTERVAL_DEFAULT = 60_000;

export interface ReservationPluginOptions {
    redis: {
        host: string;
        port: number;
        password?: string;
        // Logical Redis DB index — must differ between a central and a branch instance sharing
        // the same physical Redis server, otherwise the fixed-name 'reservation-expiry' BullMQ
        // queue collides and one instance's worker can pick up the other's job.
        db?: number;
    };
    // Staff-facing default shown when confirming an order — see Order.customFields.reservationDays.
    defaultReservationDays?: number;
    expiryPollIntervalMs?: number;
}

// Which path triggered reserveOrder() — see docs/order-flow.md "Single reservation service,
// two triggers". Only 'manual' has a real caller today; 'auto-prepaid'/'auto-trust-rule' are
// kept open for stages 4 and the deferred trusted-customer rule so the signature doesn't need
// to change later.
export type ReservationCreationMethod = 'manual' | 'auto-prepaid' | 'auto-trust-rule';

// Order.customFields.reservationState — an internal technical enum fixed by app logic, not
// ERP business data (see AGENTS.md "Business data must live in the database"). See
// docs/order-flow.md "Reservation state (separate from Order.state)".
export type OrderReservationState =
    | 'NOT_REQUIRED'
    | 'AWAITING_CONFIRMATION'
    | 'RESERVED'
    | 'EXPIRED'
    | 'RELEASED'
    | 'FAILED';

export const DEFAULT_ORDER_RESERVATION_STATE: OrderReservationState = 'NOT_REQUIRED';

// PaymentMethod.customFields.paymentClassification — same exception as OrderReservationState
// above: a fixed, small set of internal technical classes that drive the reservation trigger
// (see docs/order-flow.md "Payment classification (decided)"), not ERP/business data that
// changes without a deploy. Unlike price types/statuses/categories (which DO belong in the
// database per AGENTS.md), adding a genuinely new payment classification is a code change in
// its own right — reservation-payment.service.ts would need new branching logic for it
// regardless of where the label lives, so there is no DB-driven flexibility to gain by moving
// it out of code. Configured per `PaymentMethod` via this fixed dropdown in the native Vendure
// Admin UI (port 3000) — see reservation.plugin.ts's customFields.PaymentMethod definition,
// which must use this same array for its `options` so the two never drift apart.
export const PAYMENT_CLASSIFICATIONS = ['PREPAID', 'CREDIT', 'OFFLINE_TERMS'] as const;
export type PaymentClassification = (typeof PAYMENT_CLASSIFICATIONS)[number];

export const PAYMENT_CLASSIFICATION_LABELS: Record<PaymentClassification, string> = {
    PREPAID: 'Prepaid',
    CREDIT: 'Credit terms',
    OFFLINE_TERMS: 'Offline terms',
};

// A PaymentMethod with no classification configured yet (paymentClassification is nullable —
// see CustomPaymentMethodFields above) is deliberately treated the same as CREDIT/
// OFFLINE_TERMS: non-prepaid, enters the manual AWAITING_CONFIRMATION queue, never
// auto-reserved. This is the safe default (never silently skip a reservation a human should
// review) and is intentional, not a gap to "fix" by requiring configuration up front — see
// ReservationPaymentService.handleOrderPlaced/handlePaymentStateReached, both of which check
// `=== 'PREPAID'` rather than `!== undefined`.
