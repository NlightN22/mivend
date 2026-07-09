import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { PriceEntryService } from './price-entry.service';
import { FLOOR_PRICE_TYPE_CODE, PriceAdjustmentDecision } from './types';

// The only code that ever reads the floor-price value — see docs/access-control.md, layer 5
// "Approval gate". Returns a decision only; the raw threshold never leaves this method under
// any code path, so it can never leak to a Manager/Sales caller through an API response or
// error message, even indirectly.
@Injectable()
export class PriceAdjustmentGateService {
    constructor(private priceEntryService: PriceEntryService) {}

    async evaluate(
        ctx: RequestContext,
        variantId: string,
        requestedPrice: number,
    ): Promise<PriceAdjustmentDecision> {
        const floorPrice = await this.priceEntryService.getForVariant(
            ctx,
            variantId,
            FLOOR_PRICE_TYPE_CODE,
        );
        // No floor configured for this variant — conservative default: require approval
        // rather than silently allowing unlimited discounting because ERP hasn't pushed a
        // threshold yet.
        if (floorPrice === null) {
            return 'requires-approval';
        }
        return requestedPrice >= floorPrice ? 'apply-directly' : 'requires-approval';
    }
}
