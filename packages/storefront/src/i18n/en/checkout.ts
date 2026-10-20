export default {
    checkout: {
        title: 'Checkout',
        yourOrder: 'Your order',
        edit: 'Edit',
        cardNotice:
            'After clicking "Pay online" you will be redirected to the payment service. Order status is updated via webhook, not only on customer return.',
        placeFailed: 'Could not place order',
        credit: {
            waitsForManager:
                'The credit limit is exceeded: the order will wait for your manager to confirm it.',
            acknowledge: 'I understand the limit is exceeded',
        },
        summary: {
            goods: 'Goods',
            availableCredit: 'Available credit',
            overLimit: 'Over the limit by',
            toPayOnline: 'To pay online',
            includesDebt:
                'Includes {amount} of debt above your credit limit; paying online clears it together with this order.',
            processing: 'Processing…',
            payAmount: 'Pay {amount} →',
            payOnline: 'Pay online →',
            placeWithProforma: 'Place order & get proforma invoice',
            place: 'Place order',
            placeFailedRetry: 'Could not place order, please try again or contact support',
            legal: 'By clicking the button, you are redirected to the payment service and agree to the {terms}.',
            terms: 'payment terms',
        },
    },
    delivery: {
        title: 'Delivery',
        subtitle: 'Choose delivery method for your order.',
        courier: 'Courier',
        courierNeedsPoint: 'Courier delivery needs a trading point.',
        courierNeedsPointBlocker: 'Select a trading point to use courier delivery',
        courierNote: 'Delivery to the trading point, per contract terms.',
        addPoint: 'Add trading point',
        pickup: 'Self-pickup',
        pickupNote: 'Available after assembly confirmation.',
        point: 'Trading point for delivery',
        notSelected: 'Not selected',
        change: 'Change',
        selectPoint: 'Select trading point',
        noPoints: 'No trading points found.',
    },
    payment: {
        title: 'Payment method',
        subtitle: 'Choose how to pay for the order.',
        none: 'No payment method is available for your account. Please contact your manager.',
        methods: {
            'bank-transfer': {
                title: 'Bank proforma invoice',
                note: 'We generate a proforma invoice for each organization of the order; pay via bank.',
                badge: 'Printable proforma invoice',
            },
            card: {
                title: 'Card online',
                note: 'Pay by card on the payment page right after placing the order.',
                badge: 'Quick confirmation',
            },
            cash: {
                title: 'Cash',
                note: 'Pay cash on pickup or delivery; a manager confirms the receipt.',
                badge: 'Manager confirms receipt',
            },
        },
    },
    orderCreated: {
        title: 'Order placed',
        loading: 'Loading order…',
        statusTitle: 'Order created',
        created: 'Your order {code} has been created',
        status: {
            cash: '{created}. Waiting for the manager to confirm receipt of your cash payment.',
            offlineTerms:
                '{created}. Pay each proforma invoice via your bank; the order is paid once the payment is received.',
            default: '{created}.',
        },
        steps: {
            notify: "You'll get a notification when the order is ready.",
            cashHandOver: 'Hand the cash over on pickup or delivery.',
            cashConfirm: 'The manager confirms the cash receipt.',
            bankPrint: 'Print the proforma invoices and send them to your bank.',
            bankMatch: 'The payment is matched to the order when it arrives.',
            queued: 'Your order is queued for processing.',
            reserved: 'Goods will be reserved.',
        },
        methods: {
            cash: 'Cash',
            offlineTerms: 'Bank proforma invoice',
            onlineStub: 'Card online',
        },
        waitingCash:
            'Waiting for the manager to confirm the cash receipt. The order moves on once the manager has confirmed it.',
        awaitingManager:
            'Your credit limit is exceeded. Please wait for your manager to confirm the order.',
        limitAcknowledged:
            'Your credit limit is exceeded; the order was accepted with your acknowledgement.',
        openOrder: 'Open order',
        printProforma: 'Print proforma invoice {number}',
        continueShopping: 'Continue shopping',
        details: 'Order details',
        orderNumber: 'Order number',
        next: "What's next",
    },
    paymentResult: {
        title: 'Payment result',
        success: {
            title: 'Payment successful',
            text: 'Payment for order #{number} has been processed. The order is confirmed.',
            textNoNumber: 'The payment has been processed. The order is confirmed.',
        },
        pending: {
            title: 'Awaiting confirmation',
            text: 'Payment is being processed. This may take a few minutes. Order status will update automatically.',
        },
        fail: {
            title: 'Payment failed',
            text: 'The payment could not be processed. Your order has not been confirmed. You can try again or choose a different payment method.',
        },
        tryAgain: 'Try again',
        anotherMethod: 'Choose another method',
        details: 'Payment details',
        paymentId: 'Payment ID',
        order: 'Order',
        amount: 'Amount',
        method: 'Method',
        orderUnknown: 'Order details are unavailable. Open the order list to check its status.',
    },
    paymentStub: {
        title: 'Payment',
        subtitle: 'Demo payment service — for testing only',
        warning:
            'This is a stub page. In production this will be replaced by a real payment provider redirect.',
        order: 'Order #{number} · {amount}',
        success: 'Payment successful',
        pending: 'Payment pending',
        fail: 'Payment failed',
        back: '← Back to checkout',
        noOrder: 'There is no order to pay. Return to the cart.',
        amountChanged: 'The amount to pay has changed. Please review it and confirm again.',
    },
};
