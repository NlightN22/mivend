import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import type { Order, RequestContext } from '@vendure/core';
import type { LinePriceCheck, LinePriceQuote } from '@mivend/plugin-reservation';

import { discountPercent } from './discount-percent';
import { PriceResolutionService } from './price-resolution.service';

// The same resolution the cart uses for the unit price; a variant without a customer price is not sold to them.
@Injectable()
export class VariantPriceCheck implements LinePriceCheck {
    constructor(private prices: PriceResolutionService) {}

    async hasCustomerPrice(ctx: RequestContext, order: Order, variantId: ID): Promise<boolean> {
        return (await this.quote(ctx, order, variantId)) !== null;
    }

    async quote(ctx: RequestContext, order: Order, variantId: ID): Promise<LinePriceQuote | null> {
        const { customerPrice } = await this.prices.resolve(
            ctx,
            String(variantId),
            { order, quantity: 1 },
            { orderRules: false },
        );
        if (customerPrice === null) return null;
        // A placed line's reference is its list price, which already carries the customer discount.
        return {
            customerPrice,
            referencePrice: customerPrice,
            discountPercent: discountPercent(customerPrice, customerPrice),
        };
    }
}
