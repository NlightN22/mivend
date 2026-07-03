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
    minWeightKg: number | null;
}

export interface VariantFacetValue {
    facetCode: string;
    valueCode: string;
}

function facetKey(facetCode: string, valueCode: string): string {
    return `${facetCode}:${valueCode}`;
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
                [
                    'priceTypeCode',
                    'facetCode',
                    'facetValueCode',
                    'percent',
                    'validFrom',
                    'validTo',
                    'minWeightKg',
                ],
                ['erpId'],
            )
            .execute();
        Logger.verbose(`Bulk upserted ${entries.length} discount rules`, loggerCtx);
        return entries.length;
    }

    /**
     * Returns the highest matching discount percent, or null if none match.
     *
     * `weightByFacet` maps `facetCode:valueCode` -> aggregated kg purchased for that
     * facet value in the current order (empty for catalog display, where quantity is
     * unknown). A rule with `minWeightKg` set only qualifies once that threshold is
     * reached; flat rules (`minWeightKg` null) qualify as soon as the facet matches.
     */
    async getBestPercent(
        ctx: RequestContext,
        priceTypeCode: string,
        variantFacetValues: VariantFacetValue[],
        now: Date,
        weightByFacet: Map<string, number> = new Map(),
    ): Promise<number | null> {
        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where('dr.priceTypeCode = :priceTypeCode', { priceTypeCode })
            .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
            .getMany();

        const matching = rules.filter(rule => {
            const facetMatches =
                (rule.facetCode === null && rule.facetValueCode === null) ||
                variantFacetValues.some(
                    fv => fv.facetCode === rule.facetCode && fv.valueCode === rule.facetValueCode,
                );
            if (!facetMatches) return false;
            if (rule.minWeightKg === null) return true;
            if (rule.facetCode === null || rule.facetValueCode === null) return false;
            const weight = weightByFacet.get(facetKey(rule.facetCode, rule.facetValueCode)) ?? 0;
            return weight >= rule.minWeightKg;
        });

        if (matching.length === 0) return null;
        return Math.max(...matching.map(r => r.percent));
    }
}
