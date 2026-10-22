import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CustomerPricingService, type PriceTypeVisibility } from '@mivend/plugin-customer-pricing';
import type { PriceTypeRecord } from '../types';

const VISIBILITIES: readonly PriceTypeVisibility[] = ['customer', 'confidential'];

@Injectable()
export class PriceTypeHandler {
    constructor(private readonly customerPricing: CustomerPricingService) {}

    async upsert(ctx: RequestContext, record: PriceTypeRecord): Promise<void> {
        if (!VISIBILITIES.includes(record.visibility))
            throw new Error(`Price type ${record.code}: unknown visibility "${record.visibility}"`);
        const isPurchase = record.isPurchase === true;
        await this.customerPricing.upsertPriceTypeByCode(
            ctx,
            record.code,
            record.name,
            record.visibility,
            {
                isPurchase,
                ceilingMultiplier: isPurchase ? (record.ceilingMultiplier ?? null) : null,
            },
        );
    }
}
