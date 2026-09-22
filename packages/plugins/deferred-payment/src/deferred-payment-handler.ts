import { LanguageCode, PaymentMethodHandler } from '@vendure/core';

export const DEFERRED_PAYMENT_METHOD_CODE = 'deferred-payment';

// Groundwork for issue #142 (real credit-limit check via plugin-approval-workflow's
// creditTermApproval gate) — deliberately unchecked for now, mirroring
// offlineTermsPaymentHandler's own "settle straight to Authorized, money collection
// happens outside Vendure" reasoning. This is NOT a policy decision that deferred
// payment is unconditionally allowed forever; #142 adds the real gate on top.
export const deferredPaymentHandler = new PaymentMethodHandler({
    code: DEFERRED_PAYMENT_METHOD_CODE,
    description: [
        { languageCode: LanguageCode.en, value: 'Deferred payment (credit-limit gated, see #142)' },
    ],
    args: {},
    createPayment: async (_ctx, order) => {
        return {
            amount: order.totalWithTax,
            state: 'Authorized' as const,
            metadata: {},
        };
    },
    settlePayment: () => ({ success: true }),
});
