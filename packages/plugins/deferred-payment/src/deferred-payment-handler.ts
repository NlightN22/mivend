import { LanguageCode, PaymentMethodHandler } from '@vendure/core';
import { CREDIT_LIMIT_EXCEEDED_KEY } from 'shared';

import { DEFERRED_PAYMENT_METHOD_CODE } from './constants';
import { DeferredCreditAssessmentService } from './deferred-credit-assessment.service';

let assessmentService: DeferredCreditAssessmentService;

// An overrun never blocks the order: it is placed and flagged in public payment metadata so the
// storefront can warn the customer; approval/confirmation happens on the ERP/manager side.
export const deferredPaymentHandler = new PaymentMethodHandler({
    code: DEFERRED_PAYMENT_METHOD_CODE,
    description: [
        { languageCode: LanguageCode.en, value: 'Deferred payment (credit-limit aware)' },
    ],
    args: {},
    init(injector) {
        assessmentService = injector.get(DeferredCreditAssessmentService);
    },
    createPayment: async (ctx, order) => {
        const assessment = await assessmentService.assess(ctx, order);
        if (!assessment) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: 'Customer has no counterparty — deferred payment is unavailable',
                metadata: {},
            };
        }
        return {
            amount: order.totalWithTax,
            state: 'Authorized' as const,
            metadata: { public: { [CREDIT_LIMIT_EXCEEDED_KEY]: assessment.exceeded } },
        };
    },
    settlePayment: () => ({ success: true }),
});
