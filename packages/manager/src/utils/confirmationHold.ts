import { tr } from './lazyLabels';

interface PaymentWithPlacement {
    metadata?: { placement?: { confirmationHold?: boolean; confirmationCase?: string } } | null;
}

const PART_KEYS: Record<string, string> = {
    deferred: 'deferred',
    'no-terms': 'noTerms',
    cash: 'cash',
    pickup: 'pickup',
    courier: 'courier',
};

// "payment.confirmation.cash.pickup.no-terms" -> "cash, pickup, no deferred terms".
export function confirmationCaseLabel(code: string): string {
    return code
        .replace(/^payment\.confirmation\./, '')
        .split('.')
        .map(part =>
            PART_KEYS[part]
                ? tr(`orderDetail.holdCase.${PART_KEYS[part]}`)
                : part.replace(/-/g, ' '),
        )
        .join(', ');
}

// The matrix case (payment.confirmation.*) that sent the order to manager confirmation, if any.
export function heldConfirmationCase(payments: PaymentWithPlacement[]): string | null {
    for (const payment of payments) {
        const placement = payment.metadata?.placement;
        if (placement?.confirmationHold === true && placement.confirmationCase) {
            return confirmationCaseLabel(placement.confirmationCase);
        }
    }
    return null;
}
