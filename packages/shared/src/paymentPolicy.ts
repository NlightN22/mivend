export const DEFAULT_PREPAYMENT_RESERVE_DAYS = 3;

export const PLACEMENT_KEY = 'placement' as const;
export const CREDIT_ACKNOWLEDGED_KEY = 'creditLimitAcknowledged' as const;

export const PAYMENT_FORMS = ['cash', 'bank-transfer', 'card'] as const;
export type PaymentForm = (typeof PAYMENT_FORMS)[number];

export type PlacementRoute = 'erp-now' | 'after-payment' | 'manager-confirmation';

// Stored in Payment.metadata[PLACEMENT_KEY] at checkout; read by reservation and the limit exposure query.
export interface PlacementMetadata {
    route: PlacementRoute;
    countsAgainstLimit: boolean;
    reserveDays: number | null;
}

// Vendure PaymentMethod code per customer-facing form; the codes are fixed by the registered handlers.
export const PAYMENT_FORM_BY_METHOD_CODE: Record<string, PaymentForm> = {
    cash: 'cash',
    'offline-terms': 'bank-transfer',
    'online-stub': 'card',
};
