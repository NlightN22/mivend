import { Injectable } from '@nestjs/common';
import { PriceType } from '@mivend/plugin-customer-pricing';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { PriceEntryService } from './price-entry.service';

// The only place the floor is computed: purchase price x the multiplier stored on the purchase type.
// A variant without a purchase entry, or no multiplier, has no floor (absent from the map).
@Injectable()
export class FloorPriceService {
    constructor(
        private connection: TransactionalConnection,
        private priceEntryService: PriceEntryService,
    ) {}

    async forVariants(ctx: RequestContext, variantIds: string[]): Promise<Map<string, number>> {
        const purchaseType = await this.connection
            .getRepository(ctx, PriceType)
            .findOne({ where: { isPurchase: true, isActive: true } });
        if (!purchaseType?.ceilingMultiplier) return new Map();
        const purchase = await this.priceEntryService.getForVariants(
            ctx,
            variantIds,
            purchaseType.code,
        );
        const floor = new Map<string, number>();
        for (const [variantId, price] of purchase) {
            floor.set(variantId, price * purchaseType.ceilingMultiplier);
        }
        return floor;
    }
}
