import { LanguageCode, PaymentMethodHandler, PaymentMetadata } from '@vendure/core';

// Invoice/deferred are offline payment terms — the customer doesn't pay through
// Vendure at checkout time, so the handler settles the payment step immediately
// on the "Authorized" state to move the order out of ArrangingPayment. Actual
// money collection happens outside Vendure (per contract), tracked via the
// existing ERP status sync (see plugin-erp-order), not via Vendure's payment flow.
export const offlineTermsPaymentHandler = new PaymentMethodHandler({
    code: 'offline-terms',
    description: [
        { languageCode: LanguageCode.en, value: 'Invoice / deferred payment (offline terms)' },
    ],
    args: {},
    createPayment: (_ctx, order) => ({
        amount: order.totalWithTax,
        state: 'Authorized' as const,
        metadata: {},
    }),
    settlePayment: () => ({ success: true }),
});

// Stand-in for a real payment gateway until plugin-acquiring exists (see
// PROJECT_CONTEXT.md planned work). PaymentStubPage.vue's success/pending/fail
// buttons map directly to this handler's result via the `status` metadata arg.
export const onlineStubPaymentHandler = new PaymentMethodHandler({
    code: 'online-stub',
    description: [{ languageCode: LanguageCode.en, value: 'Online payment (demo stub)' }],
    args: {},
    createPayment: (
        _ctx,
        order,
        _amount,
        _args,
        metadata: PaymentMetadata & { status?: string },
    ) => {
        if (metadata?.status === 'fail') {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                metadata,
            };
        }
        return {
            amount: order.totalWithTax,
            state: metadata?.status === 'pending' ? ('Authorized' as const) : ('Settled' as const),
            metadata,
        };
    },
    settlePayment: () => ({ success: true }),
});
