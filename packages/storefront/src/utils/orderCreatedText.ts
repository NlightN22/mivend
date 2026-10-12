export const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash',
    'offline-terms': 'Bank proforma invoice',
    'online-stub': 'Card online',
};

export interface OrderCreatedText {
    status: string;
    steps: string[];
    waitingForCashConfirmation: boolean;
}

export function describeOrderCreated(code: string, methodCode: string): OrderCreatedText {
    const created = `Your order ${code} has been created`;
    const notify = "You'll get a notification when the order is ready.";
    if (methodCode === 'cash') {
        return {
            status: `${created}. Waiting for the manager to confirm receipt of your cash payment.`,
            steps: [
                'Hand the cash over on pickup or delivery.',
                'The manager confirms the cash receipt.',
                notify,
            ],
            waitingForCashConfirmation: true,
        };
    }
    if (methodCode === 'offline-terms') {
        return {
            status: `${created}. Pay each proforma invoice via your bank; the order is paid once the payment is received.`,
            steps: [
                'Print the proforma invoices and send them to your bank.',
                'The payment is matched to the order when it arrives.',
                notify,
            ],
            waitingForCashConfirmation: false,
        };
    }
    return {
        status: `${created}.`,
        steps: ['Your order is queued for processing.', 'Goods will be reserved.', notify],
        waitingForCashConfirmation: false,
    };
}
