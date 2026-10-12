export const DEFAULT_PREPAYMENT_RESERVE_DAYS = 3;

export const PLACEMENT_ROUTE_KEY = 'placementRoute' as const;
export const COUNTS_AGAINST_LIMIT_KEY = 'countsAgainstLimit' as const;
export const CREDIT_ACKNOWLEDGED_KEY = 'creditLimitAcknowledged' as const;

export const PAYMENT_FORMS = ['cash', 'bank-transfer', 'card'] as const;
export type PaymentForm = (typeof PAYMENT_FORMS)[number];

export type PlacementRoute = 'erp-now' | 'after-payment' | 'manager-confirmation';

// Vendure PaymentMethod code per customer-facing form; the codes are fixed by the registered handlers.
export const PAYMENT_FORM_BY_METHOD_CODE: Record<string, PaymentForm> = {
    cash: 'cash',
    'offline-terms': 'bank-transfer',
    'online-stub': 'card',
};
