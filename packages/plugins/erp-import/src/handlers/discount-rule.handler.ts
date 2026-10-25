import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { CounterpartyDiscountRuleService, DiscountRuleService } from '@mivend/plugin-price-entry';
import type { CounterpartyDiscountRuleRecord, DiscountRuleRecord } from '../types';

@Injectable()
export class DiscountRuleHandler {
    constructor(
        private readonly discountRuleService: DiscountRuleService,
        private readonly counterpartyDiscountRuleService: CounterpartyDiscountRuleService,
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

    async upsertCounterparty(
        ctx: RequestContext,
        record: CounterpartyDiscountRuleRecord,
    ): Promise<void> {
        await this.counterpartyDiscountRuleService.upsertCounterpartyRule(ctx, {
            erpId: record.erpId,
            recipientType: 'counterparty',
            recipientErpId: record.counterpartyErpId,
            productErpId: record.productErpId ?? null,
            condition: record.condition,
            conditionValue: record.conditionValue,
            percent: record.percent,
            limitAmount: null,
            validFrom: new Date(record.validFrom),
            validTo: record.validTo ? new Date(record.validTo) : null,
            sourceVersion: '1',
        });
    }
}
