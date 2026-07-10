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
    minAmount: number | null;
}

export interface VariantFacetValue {
    facetCode: string;
    valueCode: string;
}

export interface DiscountTierVM {
    percent: number;
    minWeightKg: number | null;
    minAmount: number | null;
    // Not part of the GraphQL `DiscountTier` shape (resolvers only read the three
    // fields above) — kept here so PriceResolutionService can match a tier back to the
    // facet value it aggregates against, without a second query.
    facetCode: string;
    facetValueCode: string;
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

    // Discounts are scoped by price type, not by an individual customer (see DiscountRule —
    // no customerId column). Used by the manager portal's Customers page ("Active discounts"
    // count/list) via the customer's own priceType, and by /discounts.
    async findByPriceType(ctx: RequestContext, priceTypeCode: string): Promise<DiscountRule[]> {
        return this.connection
            .getRepository(ctx, DiscountRule)
            .find({ where: { priceTypeCode }, order: { validTo: 'DESC' } });
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
                    'minAmount',
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
     * `weightByFacet`/`amountByFacet` map `facetCode:valueCode` -> aggregated kg/money
     * purchased for that facet value in the current order (both empty for catalog
     * display, where quantity is unknown). A rule with `minWeightKg` or `minAmount` set
     * only qualifies once that threshold is reached; flat rules (both null) qualify as
     * soon as the facet matches. A rule never sets both metrics at once.
     */
    async getBestPercent(
        ctx: RequestContext,
        priceTypeCode: string,
        variantFacetValues: VariantFacetValue[],
        now: Date,
        weightByFacet: Map<string, number> = new Map(),
        amountByFacet: Map<string, number> = new Map(),
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
            if (rule.minWeightKg === null && rule.minAmount === null) return true;
            if (rule.facetCode === null || rule.facetValueCode === null) return false;
            const key = facetKey(rule.facetCode, rule.facetValueCode);
            if (rule.minWeightKg !== null) {
                return (weightByFacet.get(key) ?? 0) >= rule.minWeightKg;
            }
            return (amountByFacet.get(key) ?? 0) >= (rule.minAmount ?? 0);
        });

        if (matching.length === 0) return null;
        return Math.max(...matching.map(r => r.percent));
    }

    /**
     * Returns the ladder rungs (rules with a threshold set) for a variant's facets,
     * sorted ascending by threshold — for display only, no order context involved.
     * Flat rules (both thresholds null) are excluded; they already surface via
     * `compareAtPrice`/`customerPrice`, not the tier badge.
     */
    async getTiers(
        ctx: RequestContext,
        priceTypeCode: string,
        variantFacetValues: VariantFacetValue[],
        now: Date,
    ): Promise<DiscountTierVM[]> {
        const rules = await this.connection
            .getRepository(ctx, DiscountRule)
            .createQueryBuilder('dr')
            .where('dr.priceTypeCode = :priceTypeCode', { priceTypeCode })
            .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
            .getMany();

        const matching = rules.filter(rule => {
            if (rule.minWeightKg === null && rule.minAmount === null) return false;
            const facetMatches = variantFacetValues.some(
                fv => fv.facetCode === rule.facetCode && fv.valueCode === rule.facetValueCode,
            );
            return facetMatches;
        });

        return matching
            .map(r => ({
                percent: r.percent,
                minWeightKg: r.minWeightKg,
                minAmount: r.minAmount,
                facetCode: r.facetCode as string,
                facetValueCode: r.facetValueCode as string,
            }))
            .sort(
                (a, b) => (a.minWeightKg ?? a.minAmount ?? 0) - (b.minWeightKg ?? b.minAmount ?? 0),
            );
    }
}
