import { CounterpartyService } from '@mivend/plugin-counterparty';
import { LanguageCode, PaymentMethodEligibilityChecker } from '@vendure/core';

import { DEFERRED_PAYMENT_METHOD_CODE } from './constants';

let counterpartyService: CounterpartyService;

// Deferred needs both a computed limit and payment terms days; either at 0 means prepayment.
export const deferredEligibilityChecker = new PaymentMethodEligibilityChecker({
    code: DEFERRED_PAYMENT_METHOD_CODE,
    description: [
        {
            languageCode: LanguageCode.en,
            value: 'Counterparty has a credit limit and payment terms days',
        },
    ],
    args: {},
    init(injector) {
        counterpartyService = injector.get(CounterpartyService);
    },
    check: async (ctx, order) => {
        const customerId = order.customer?.id ?? order.customerId;
        if (!customerId) return false;
        const counterparty = await counterpartyService.getForCustomer(ctx, customerId);
        return Boolean(
            counterparty &&
            Number(counterparty.creditLimit) > 0 &&
            Number(counterparty.paymentDelayDays) > 0,
        );
    },
});
