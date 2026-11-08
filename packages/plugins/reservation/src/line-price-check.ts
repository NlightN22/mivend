import type { ID } from '@vendure/common/lib/shared-types';
import type { Order, RequestContext } from '@vendure/core';

export const LINE_PRICE_CHECK = 'MIVEND_LINE_PRICE_CHECK';

export interface LinePriceQuote {
    customerPrice: number;
    referencePrice: number;
}

// Provided by the pricing plugin (which depends on this one); looked up at call time, never imported.
export interface LinePriceCheck {
    // False when price resolution gives the order's customer no price for the variant.
    hasCustomerPrice(ctx: RequestContext, order: Order, variantId: ID): Promise<boolean>;
    // The unit price for a line of this quantity, with the order's tier and promotion rules; null without a price.
    quote(
        ctx: RequestContext,
        order: Order,
        variantId: ID,
        quantity: number,
    ): Promise<LinePriceQuote | null>;
}
