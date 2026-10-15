import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';

import { PriceEntryService } from './price-entry.service';
import { FLOOR_PRICE_TYPE_CODE, PriceAdjustmentDecision } from './types';

// Only place that reads the floor price. Returns a decision only: the raw threshold must never
// leak to Manager/Sales via API responses or error messages, even indirectly.
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
        // No floor yet (ERP hasn't pushed one): default to approval, never unlimited discounting.
        if (floorPrice === null) {
            return 'requires-approval';
        }
        return requestedPrice >= floorPrice ? 'apply-directly' : 'requires-approval';
    }
}
