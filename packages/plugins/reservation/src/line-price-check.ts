import type { ID } from '@vendure/common/lib/shared-types';
import type { Order, RequestContext } from '@vendure/core';

export const LINE_PRICE_CHECK = 'MIVEND_LINE_PRICE_CHECK';

// Provided by the pricing plugin (which depends on this one); looked up at call time, never imported.
export interface LinePriceCheck {
    // False when price resolution gives the order's customer no price for the variant.
    hasCustomerPrice(ctx: RequestContext, order: Order, variantId: ID): Promise<boolean>;
}
