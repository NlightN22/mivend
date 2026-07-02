import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DiscountRuleService } from '@mivend/plugin-price-entry';
import type { DiscountRuleRecord } from '../types';

@Injectable()
export class DiscountRuleHandler {
    constructor(private readonly discountRuleService: DiscountRuleService) {}

    async upsert(ctx: RequestContext, record: DiscountRuleRecord): Promise<void> {
        await this.discountRuleService.upsert(ctx, {
            erpId: record.erpId,
            priceTypeCode: record.priceTypeCode,
            facetCode: record.facetCode,
            facetValueCode: record.facetValueCode,
            percent: record.percent,
            validFrom: new Date(record.validFrom),
            validTo: new Date(record.validTo),
        });
    }
}
