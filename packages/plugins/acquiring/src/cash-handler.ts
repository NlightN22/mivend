import { CreditPlacementService } from '@mivend/plugin-deferred-payment';
import { Injector, LanguageCode, PaymentMethodHandler } from '@vendure/core';

export const CASH_METHOD_CODE = 'cash';

let creditPlacementService: CreditPlacementService;

// Cash is taken outside Vendure: Authorized only lets the order be placed, a manager marks it
// Settled with the "cash received" action. The credit policy decides the route.
export const cashPaymentHandler = new PaymentMethodHandler({
    code: CASH_METHOD_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Cash' }],
    args: {},
    init(injector: Injector) {
        creditPlacementService = injector.get(CreditPlacementService);
    },
    createPayment: async (ctx, order, _amount, _args, inputMetadata) => {
        const placement = await creditPlacementService.place(ctx, order, 'cash', inputMetadata);
        return {
            amount: placement.amount,
            state: 'Authorized' as const,
            metadata: placement.metadata,
        };
    },
    settlePayment: () => ({ success: true }),
});
