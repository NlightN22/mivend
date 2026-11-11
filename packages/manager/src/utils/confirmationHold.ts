interface PaymentWithPlacement {
    metadata?: { placement?: { confirmationHold?: boolean; confirmationCase?: string } } | null;
}

// The matrix case (payment.confirmation.*) that sent the order to manager confirmation, if any.
export function heldConfirmationCase(payments: PaymentWithPlacement[]): string | null {
    for (const payment of payments) {
        const placement = payment.metadata?.placement;
        if (placement?.confirmationHold === true && placement.confirmationCase) {
            return placement.confirmationCase;
        }
    }
    return null;
}
