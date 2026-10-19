export default {
    balance: {
        title: 'Balance & limits',
        subtitle: 'Available limit, deferral, debt, upcoming payments and payment initiation.',
        reconciliationAct: 'Reconciliation act',
        askQuestion: 'Ask a question',
        days: '{n} day | {n} days',
        metrics: {
            available: { label: 'Available limit', note: 'Order without upfront payment' },
            used: { label: 'Used', note: '{percent}% of total credit limit' },
            deferral: { label: 'Deferral', note: 'Under main contract' },
            due: { label: 'Due', note: 'Next payment by {date}' },
        },
        notice: {
            title: 'Limits are managed by your account manager.',
            text: 'Credit limits and payment deferrals are set internally. You can pay, download documents, or create a request.',
        },
        limit: {
            title: 'Limit status',
            sub: 'Overall limit, used portion and remaining balance for new orders.',
            ordersAvailable: 'Orders available',
            usedOf: 'Used {used} of {total}',
            available: 'Available: {amount}',
            overdue: 'Overdue: {amount}',
        },
        contracts: {
            main: { title: 'Main contract', note: 'All active trading points' },
            additional: { title: 'Additional terms', note: 'One-time shipments on agreed items' },
        },
        cells: {
            limit: 'Limit',
            available: 'Available',
            deferral: 'Deferral',
            amount: 'Amount',
            remaining: 'Remaining',
            due: 'Due',
        },
        status: { active: 'Active', nearlyUsed: 'Nearly used', due: 'Due', paid: 'Paid' },
        payments: {
            title: 'Payments & debt',
            sub: 'Amounts, due dates and payment statuses.',
            pay: 'Pay',
            order: 'Order #{number}',
            notes: {
                partial: 'Reservation confirmed · partial payment received',
                unpaid: 'Ready for shipment · no payment received',
                closed: 'Shipped and closed',
            },
        },
        pay: {
            title: 'Payment',
            sub: 'Pay debt, a specific order, or make an advance.',
            amountDue: 'Amount due',
            proceed: 'Proceed to payment',
            advanceTitle: 'Advance payment accepted',
            advanceNote: 'The payment will be credited to your balance and allocated internally.',
            documentsTitle: 'Documents',
            documentsNote:
                'Proforma invoices, UPD and reconciliation acts are available in the Documents section.',
        },
        next: {
            title: 'Next payment',
            dueDate: 'Due date',
            order: 'Order',
            overdue: 'Overdue',
            openOrder: 'Open order',
        },
        restrictions: {
            title: 'Restrictions',
            sub: 'What affects your ability to place orders without upfront payment.',
            nearlyTitle: 'Limit nearly exhausted',
            nearlyNote:
                'If your cart exceeds the available limit, payment or approval request will be required.',
            noOverdueTitle: 'No overdue debt',
            noOverdueNote: 'Placing orders against the credit limit is currently available.',
        },
    },
};
