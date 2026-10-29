import { Injectable, Logger } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { PriceEntryService } from '@mivend/plugin-price-entry';
import type { PriceRecord } from '../types';

const loggerCtx = 'ErpPriceHandler';

@Injectable()
export class PriceHandler {
    constructor(private readonly priceEntryService: PriceEntryService) {}

    async upsert(ctx: RequestContext, record: PriceRecord): Promise<void> {
        await this.priceEntryService.upsertByProduct(
            ctx,
            record.productExternalId,
            record.priceTypeCode,
            Math.round(record.price * 100),
        );
        Logger.verbose(
            `Upserted price product=${record.productExternalId} type=${record.priceTypeCode}`,
            loggerCtx,
        );
    }
}
