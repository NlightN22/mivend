import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import type { Order, RequestContext } from '@vendure/core';
import type { LinePriceCheck } from '@mivend/plugin-reservation';

import { PriceResolutionService } from './price-resolution.service';

// The same resolution the cart uses for the unit price; a variant without a customer price is not sold to them.
@Injectable()
export class VariantPriceCheck implements LinePriceCheck {
    constructor(private prices: PriceResolutionService) {}

    async hasCustomerPrice(ctx: RequestContext, order: Order, variantId: ID): Promise<boolean> {
        const { customerPrice } = await this.prices.resolve(
            ctx,
            String(variantId),
            { order, quantity: 1 },
            { orderRules: false },
        );
        return customerPrice !== null;
    }
}
