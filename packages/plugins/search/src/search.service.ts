import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PriceEntryService } from '@mivend/plugin-price-entry';

@Injectable()
export class SearchService {
    constructor(private priceEntryService: PriceEntryService) {}

    async getCustomerPrice(ctx: RequestContext, variantId: string): Promise<number | null> {
        const priceTypeCode = await this.priceEntryService.getPriceTypeCodeForUser(ctx);
        if (!priceTypeCode) return null;
        return this.priceEntryService.getForVariant(ctx, variantId, priceTypeCode);
    }
}
