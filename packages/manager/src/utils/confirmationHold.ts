interface PaymentWithPlacement {
    metadata?: { placement?: { confirmationHold?: boolean; confirmationCase?: string } } | null;
}

const TERMS_LABEL: Record<string, string> = {
    deferred: 'deferred terms',
    'no-terms': 'no deferred terms',
};

// "payment.confirmation.cash.pickup.no-terms" -> "cash, pickup, no deferred terms".
export function confirmationCaseLabel(code: string): string {
    return code
        .replace(/^payment\.confirmation\./, '')
        .split('.')
        .map(part => TERMS_LABEL[part] ?? part.replace(/-/g, ' '))
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
