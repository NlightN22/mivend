import { CounterpartyService } from '@mivend/plugin-counterparty';
import { LanguageCode, PaymentMethodHandler } from '@vendure/core';

import { exceedsCreditLimit, formatOverrunMessage } from './credit-limit-decision';

export const DEFERRED_PAYMENT_METHOD_CODE = 'deferred-payment';

let counterpartyService: CounterpartyService;

export const deferredPaymentHandler = new PaymentMethodHandler({
    code: DEFERRED_PAYMENT_METHOD_CODE,
    description: [
        { languageCode: LanguageCode.en, value: 'Deferred payment (credit-limit gated)' },
    ],
    args: {},
    init(injector) {
        counterpartyService = injector.get(CounterpartyService);
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
        const overrun = exceedsCreditLimit(counterparty, order.totalWithTax);
        if (overrun) {
            return {
                amount: order.totalWithTax,
                state: 'Declined' as const,
                errorMessage: formatOverrunMessage(overrun),
                metadata: {},
            };
        }
        return { amount: order.totalWithTax, state: 'Authorized' as const, metadata: {} };
    },
    settlePayment: () => ({ success: true }),
});
