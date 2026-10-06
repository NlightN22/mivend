import { CounterpartyService } from '@mivend/plugin-counterparty';
import { LanguageCode, PaymentMethodEligibilityChecker } from '@vendure/core';

import { DEFERRED_PAYMENT_METHOD_CODE } from './deferred-payment-handler';

let counterpartyService: CounterpartyService;

// A counterparty without a credit limit is a prepayment customer — deferred is hidden for them.
export const deferredEligibilityChecker = new PaymentMethodEligibilityChecker({
    code: DEFERRED_PAYMENT_METHOD_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Counterparty has a credit limit' }],
    args: {},
    init(injector) {
        counterpartyService = injector.get(CounterpartyService);
    },
    check: async (ctx, order) => {
        const customerId = order.customer?.id ?? order.customerId;
        if (!customerId) return false;
        const counterparty = await counterpartyService.getForCustomer(ctx, customerId);
        return Boolean(counterparty && Number(counterparty.creditLimit) > 0);
    },
});
