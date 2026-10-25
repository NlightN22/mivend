import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { DiscountRuleService, DiscountSetupService } from '@mivend/plugin-price-entry';
import type { CounterpartyDiscountRuleRecord, DiscountRuleRecord } from '../types';

@Injectable()
export class DiscountRuleHandler {
    constructor(
        private readonly discountRuleService: DiscountRuleService,
        private readonly discountSetupService: DiscountSetupService,
    ) {}

    async upsert(ctx: RequestContext, record: DiscountRuleRecord): Promise<void> {
        await this.discountRuleService.upsert(ctx, {
            erpId: record.erpId,
            priceTypeCode: record.priceTypeCode,
            facetCode: record.facetCode,
            facetValueCode: record.facetValueCode,
            percent: record.percent,
            validFrom: new Date(record.validFrom),
            validTo: new Date(record.validTo),
            minWeightKg: record.minWeightKg ?? null,
            minAmount: record.minAmount != null ? Math.round(record.minAmount * 100) : null,
        });
    }

    // Dev/test seeding of a discount setup document; the version grows per call so a re-seed applies.
    async upsertCounterparty(
        ctx: RequestContext,
        record: CounterpartyDiscountRuleRecord,
    ): Promise<void> {
        await this.discountSetupService.apply(ctx, {
            setup: {
                erpId: record.erpId,
                documentNumber: '',
                percent: record.percent,
                conditionName: record.condition,
                conditionNumber: record.conditionValue,
                priceTypeErpId: null,
                limitPercent: null,
                validFrom: new Date(record.validFrom),
                validTo: record.validTo ? new Date(record.validTo) : null,
                active: true,
                inactiveReason: null,
                allProducts: !record.productErpId,
                productMode: 'list',
                productFilter: null,
                sourceVersion: String(Date.now()),
            },
            recipients: [{ counterpartyErpId: record.counterpartyErpId, contractErpId: '' }],
            productErpIds: record.productErpId ? [record.productErpId] : [],
        });
    }
}
