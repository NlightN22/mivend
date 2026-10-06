import { CounterpartyService, CreditLimitCheckService } from '@mivend/plugin-counterparty';
import { LanguageCode, PaymentMethodHandler } from '@vendure/core';
import { CREDIT_LIMIT_EXCEEDED_KEY } from 'shared';

import { OpenDeferredExposureService } from './open-deferred-exposure.service';

export const DEFERRED_PAYMENT_METHOD_CODE = 'deferred-payment';

let counterpartyService: CounterpartyService;
let creditLimitCheckService: CreditLimitCheckService;
let exposureService: OpenDeferredExposureService;

// An overrun never blocks the order: it is placed and flagged in public payment metadata so the
// storefront can warn the customer; approval/confirmation happens on the ERP/manager side.
export const deferredPaymentHandler = new PaymentMethodHandler({
    code: DEFERRED_PAYMENT_METHOD_CODE,
    description: [
        { languageCode: LanguageCode.en, value: 'Deferred payment (credit-limit aware)' },
    ],
    args: {},
    init(injector) {
        counterpartyService = injector.get(CounterpartyService);
        creditLimitCheckService = injector.get(CreditLimitCheckService);
        exposureService = injector.get(OpenDeferredExposureService);
    },
    createPayment: async (ctx, order) => {
        const customerId = order.customer?.id ?? order.customerId;
        const counterparty = customerId
            ? await counterpartyService.getForCustomer(ctx, customerId)
            : null;
        if (!counterparty) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: 'Customer has no counterparty — deferred payment is unavailable',
                metadata: {},
            };
        }
        const open = await exposureService.sumUnconfirmedRubles(ctx, counterparty.id, order.id);
        const decision = creditLimitCheckService.decide(
            counterparty,
            null,
            open + order.totalWithTax / 100,
        );
        return {
            amount: order.totalWithTax,
            state: 'Authorized' as const,
            metadata: { public: { [CREDIT_LIMIT_EXCEEDED_KEY]: !decision.withinLimit } },
        };
    },
    settlePayment: () => ({ success: true }),
});
