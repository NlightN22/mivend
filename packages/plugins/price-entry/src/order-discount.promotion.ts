import { Injector, LanguageCode, PromotionCondition, PromotionItemAction } from '@vendure/core';

import { OrderDiscountService, OrderDiscountState } from './order-discount.service';

export const ORDER_DISCOUNT_CONDITION_CODE = 'mivend-order-discount-condition';
export const ORDER_DISCOUNT_ACTION_CODE = 'mivend-order-discount';

let service: OrderDiscountService;

// Order-dependent ladders and promo rules (docs/pricing.md): the condition evaluates the whole order
// once, the action reads the line's share. A single action keeps "highest percent wins" instead of stacking.
export const orderDiscountCondition = new PromotionCondition({
    code: ORDER_DISCOUNT_CONDITION_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Order-dependent discount rules apply' }],
    args: {},
    init(injector: Injector): void {
        service = injector.get(OrderDiscountService);
    },
    async check(ctx, order): Promise<false | { discounts: OrderDiscountState }> {
        // Read-only ERP orders carry the ERP's prices; field owned by erp-order, which this plugin cannot import.
        if ((order.customFields as { isExternal?: boolean } | undefined)?.isExternal) return false;
        const discounts = await service.stateFor(ctx, order);
        return discounts.size > 0 ? { discounts } : false;
    },
});

export const orderDiscountAction = new PromotionItemAction({
    code: ORDER_DISCOUNT_ACTION_CODE,
    description: [{ languageCode: LanguageCode.en, value: 'Order-dependent line discount' }],
    args: {},
    conditions: [orderDiscountCondition],
    execute(_ctx, orderLine, _args, state): number {
        const perUnit = state[ORDER_DISCOUNT_CONDITION_CODE].discounts.get(String(orderLine.id));
        return perUnit ? -perUnit : 0;
    },
});
