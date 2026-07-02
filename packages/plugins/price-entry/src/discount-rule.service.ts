import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { DiscountRule } from './discount-rule.entity';

const loggerCtx = 'DiscountRulePlugin';

export interface DiscountRuleInput {
    erpId: string;
    priceTypeCode: string;
    facetCode: string | null;
    facetValueCode: string | null;
    percent: number;
    validFrom: Date;
    validTo: Date;
}

export interface VariantFacetValue {
    facetCode: string;
    valueCode: string;
}

@Injectable()
export class DiscountRuleService {
    constructor(private connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, input: DiscountRuleInput): Promise<DiscountRule> {
        const repo = this.connection.getRepository(ctx, DiscountRule);
        let record = await repo.findOne({ where: { erpId: input.erpId } });
        if (record) {
            Object.assign(record, input);
        } else {
            record = repo.create(input);
        }
        return repo.save(record);
    }

    async bulkUpsert(ctx: RequestContext, entries: DiscountRuleInput[]): Promise<number> {
        if (entries.length === 0) return 0;
        const repo = this.connection.getRepository(ctx, DiscountRule);
        await repo
            .createQueryBuilder()
            .insert()
            .into(DiscountRule)
            .values(entries)
            .orUpdate(
                ['priceTypeCode', 'facetCode', 'facetValueCode', 'percent', 'validFrom', 'validTo'],
                ['erpId'],
            )
            .execute();
        Logger.verbose(`Bulk upserted ${entries.length} discount rules`, loggerCtx);
        return entries.length;
    }

    async getBestDiscountPercent(
        ctx: RequestContext,
        priceTypeCode: string,
        variantFacetValues: VariantFacetValue[],
        now: Date,
    ): Promise<number | null> {
        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where('dr.priceTypeCode = :priceTypeCode', { priceTypeCode })
            .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
            .getMany();

        const matching = rules.filter(rule => {
            if (rule.facetCode === null && rule.facetValueCode === null) return true;
            return variantFacetValues.some(
                fv => fv.facetCode === rule.facetCode && fv.valueCode === rule.facetValueCode,
            );
        });

        if (matching.length === 0) return null;
        return Math.max(...matching.map(r => r.percent));
    }
}
