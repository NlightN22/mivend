export const DEFAULT_PREPAYMENT_RESERVE_DAYS = 3;

export const PLACEMENT_KEY = 'placement' as const;
export const CREDIT_ACKNOWLEDGED_KEY = 'creditLimitAcknowledged' as const;
// Public payment metadata flag: the order waits for a manager before it goes to the ERP.
export const AWAITING_MANAGER_KEY = 'awaitingManagerConfirmation' as const;

// Card amount (kopecks) the customer saw; a different recomputed amount declines the payment with this code.
export const EXPECTED_AMOUNT_KEY = 'expectedAmountKopecks' as const;
export const CARD_AMOUNT_CHANGED_CODE = 'CARD_AMOUNT_CHANGED' as const;

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
