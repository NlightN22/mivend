import { Injectable } from '@nestjs/common';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { LookupMemo, memoized } from './lookup-memo';
import { DiscountRule } from './discount-rule.entity';
import { DiscountGrant } from './discount-grant.entity';
import { DiscountRegistryService } from './discount-registry.service';

const loggerCtx = 'DiscountRulePlugin';

// Portal-created rules get their registry entry from DiscountGrantService (approval flow).
// upsert/bulkUpsert must skip upsertFromRule, or it creates a duplicate with no approvalRequestId.
function isPortalOrigin(erpId: string): boolean {
    return erpId.startsWith('portal-');
}

// Promo rules have no priceTypeCode and the registry column is required, so they are skipped.
function isPromoRuleOrigin(rule: Pick<DiscountRule, 'triggerProductErpId'>): boolean {
    return rule.triggerProductErpId != null;
}

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
    // Not in the GraphQL DiscountTier shape; kept so PriceResolutionService can map a tier to its facet
    // value without a second query.
    facetCode: string;
    facetValueCode: string;
}

function facetKey(facetCode: string, valueCode: string): string {
    return `${facetCode}:${valueCode}`;
}

@Injectable()
export class DiscountRuleService {
    constructor(
        private connection: TransactionalConnection,
        private discountRegistryService: DiscountRegistryService,
    ) {}

    async upsert(ctx: RequestContext, input: DiscountRuleInput): Promise<DiscountRule> {
        const repo = this.connection.getRepository(ctx, DiscountRule);
        let record = await repo.findOne({ where: { erpId: input.erpId } });
        if (record) {
            Object.assign(record, input);
        } else {
            record = repo.create(input);
        }
        const saved = await repo.save(record);
        if (!isPortalOrigin(saved.erpId) && !isPromoRuleOrigin(saved)) {
            // DiscountRuleInput never sets validTo; this branch only sees facet/priceType-threshold rules,
            // so priceTypeCode and validTo are non-null despite the nullable entity columns.
            await this.discountRegistryService.upsertFromRule(ctx, {
                ...saved,
                priceTypeCode: saved.priceTypeCode as string,
                validTo: saved.validTo as Date,
            });
        }
        return saved;
    }

    // Promo rules (triggerProductErpId set) are excluded: they have no priceTypeCode to list under.
    // Unfiltered calls (no priceTypeCode) are capped at 200; /discounts no longer calls them that way.
    async findByPriceType(
        ctx: RequestContext,
        priceTypeCode?: string,
        take = 200,
        allowedCodes?: string[],
    ): Promise<DiscountRule[]> {
        const repo = this.connection.getRepository(ctx, DiscountRule);
        if (priceTypeCode) {
            return repo.find({ where: { priceTypeCode }, order: { validTo: 'DESC' } });
        }
        // Counterparty/contract rules (recipientType set) are excluded like promo rules: this listing
        // only shows facet/priceType-threshold rules.
        const qb = repo
            .createQueryBuilder('dr')
            .where('dr.triggerProductErpId IS NULL')
            .andWhere('dr.recipientType IS NULL');
        if (allowedCodes)
            qb.andWhere('dr.priceTypeCode IN (:...allowedCodes)', {
                allowedCodes: allowedCodes.length ? allowedCodes : [''],
            });
        return qb.orderBy('dr.validTo', 'DESC').take(take).getMany();
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

        // INSERT ... ON CONFLICT does not return affected rows portably via the query builder, so re-fetch
        // by erpId to sync the registry; the extra query is cheap at erp-import batch sizes.
        const nonPortalErpIds = entries.map(e => e.erpId).filter(erpId => !isPortalOrigin(erpId));
        if (nonPortalErpIds.length > 0) {
            const saved = await repo.find({ where: { erpId: In(nonPortalErpIds) } });
            for (const rule of saved) {
                // bulkUpsert only writes facet/priceType-threshold rows (no recipientType field), so validTo
                // is guaranteed non-null, as in upsert().
                await this.discountRegistryService.upsertFromRule(ctx, {
                    ...rule,
                    validTo: rule.validTo as Date,
                });
            }
        }

        Logger.verbose(`Bulk upserted ${entries.length} discount rules`, loggerCtx);
        return entries.length;
    }

    // Threshold rules qualify only once the order's aggregate reaches minWeightKg/minAmount;
    // catalog display passes empty maps (quantity unknown), and a rule never sets both metrics.
    async getBestPercent(
        ctx: RequestContext,
        priceTypeCode: string,
        variantFacetValues: VariantFacetValue[],
        now: Date,
        weightByFacet: Map<string, number> = new Map(),
        amountByFacet: Map<string, number> = new Map(),
        counterpartyId: string | null = null,
        memo?: LookupMemo,
    ): Promise<number | null> {
        const rules = await memoized(memo, `dr:${priceTypeCode}`, () =>
            this.connection
                .getRepository(ctx, DiscountRule)
                .createQueryBuilder('dr')
                .where('dr.priceTypeCode = :priceTypeCode', { priceTypeCode })
                .andWhere('dr.validFrom <= :now AND dr.validTo >= :now', { now })
                .getMany(),
        );

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
        const scoped = await this.filterByGrantScope(ctx, matching, counterpartyId, memo);
        if (scoped.length === 0) return null;
        return Math.max(...scoped.map(r => r.percent));
    }

    // DiscountRule has no counterparty column, so a grant-materialized rule must filter by the grant's
    // counterparties; the grant join was display-only and once applied to every customer on the price type.
    private async filterByGrantScope(
        ctx: RequestContext,
        rules: DiscountRule[],
        counterpartyId: string | null,
        memo?: LookupMemo,
    ): Promise<DiscountRule[]> {
        if (rules.length === 0) return rules;
        const ruleIds = rules.map(r => String(r.id));
        const grants = await memoized(memo, `grants:${ruleIds.join(',')}`, () =>
            this.connection.getRepository(ctx, DiscountGrant).find({
                where: { discountRuleId: In(ruleIds) },
                relations: ['counterparties'],
            }),
        );
        const grantByRuleId = new Map<string, DiscountGrant>();
        for (const grant of grants ?? []) {
            grantByRuleId.set(grant.discountRuleId, grant);
        }
        return rules.filter(rule => {
            const grant = grantByRuleId.get(String(rule.id));
            if (!grant || grant.scopeType === 'all') return true;
            if (!counterpartyId) return false;
            return grant.counterparties.some(c => String(c.id) === counterpartyId);
        });
    }

    // Flat rules are excluded: they already show via compareAtPrice/customerPrice, not the tier badge.
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
