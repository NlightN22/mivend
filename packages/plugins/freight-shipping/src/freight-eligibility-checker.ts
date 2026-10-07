import { CounterpartyService, TradingPointService } from '@mivend/plugin-counterparty';
import { LanguageCode, ShippingEligibilityChecker } from '@vendure/core';

let counterpartyService: CounterpartyService;
let tradingPointService: TradingPointService;

export const freightEligibilityChecker = new ShippingEligibilityChecker({
    code: 'freight-eligibility-checker',
    description: [
        { languageCode: LanguageCode.en, value: 'Counterparty has an active trading point' },
    ],
    args: {},
    init(injector) {
        counterpartyService = injector.get(CounterpartyService);
        tradingPointService = injector.get(TradingPointService);
    },
    check: async (ctx, order) => {
        const customerId = order.customer?.id ?? order.customerId;
        if (!customerId) return false;
        const counterparty = await counterpartyService.getForCustomer(ctx, customerId);
        if (!counterparty) return false;
        const points = await tradingPointService.findVisibleForCounterparty(ctx, counterparty.id);
        return points.length > 0;
    },
});
