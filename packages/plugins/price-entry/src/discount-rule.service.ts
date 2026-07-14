import { Injectable } from '@nestjs/common';
import { Logger, PaginatedList, RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets, WhereExpressionBuilder } from 'typeorm';

import { DiscountRule } from './discount-rule.entity';
import { DiscountGrant } from './discount-grant.entity';

export type DiscountRuleStatus = 'active' | 'expiring-soon' | 'expired';

export interface DiscountRuleListOptions {
    take?: number;
    skip?: number;
    search?: string;
    priceTypeCode?: string;
    status?: DiscountRuleStatus;
}

// Same threshold as the frontend's ruleStatus() classifier (api/discounts.ts) — kept in sync by
// hand since one lives in SQL and the other in a computed display column.
const EXPIRING_SOON_DAYS = 14;

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
    // priceTypeCode omitted lists every discount rule across all price types — the manager
    // portal's /discounts page (docs/ai/manager-portal-pages/09-discounts.md); provided, it's
    // the customer-detail page's per-customer-price-type view (inherently small, exempt from
    // issue #39's pagination rule — a handful of rules per single price type).
    //
    // The unfiltered (no priceTypeCode) case IS in scope for issue #39 — bounded here at 200 as
    // an interim stopgap, same pattern as fetchAllCustomersCapped/fetchCustomerOptions in
    // api/customers.ts/api/orderCreate.ts. NOT a true fix: the /discounts page merges this with
    // DiscountGrant and discountGrantApproval ApprovalRequest rows client-side
    // (buildDiscountRows in api/discounts.ts) into one sorted table — a real paginated fix would
    // need a single backend query unioning all three sources server-side, which wasn't
    // attempted this session (ApprovalRequest.payload is stored as plain text, not jsonb, so a
    // SQL-side UNION would need fragile JSON-in-SQL parsing; deferred, see issue #39).
    async findByPriceType(
        ctx: RequestContext,
        priceTypeCode?: string,
        take = 200,
    ): Promise<DiscountRule[]> {
        return this.connection.getRepository(ctx, DiscountRule).find({
            where: priceTypeCode ? { priceTypeCode } : {},
            order: { validTo: 'DESC' },
            take: priceTypeCode ? undefined : take,
        });
    }

    // Real server-side pagination for the /discounts registry's materialized-grants section —
    // this is the part of that page that genuinely grows over the business's lifetime (issue
    // #39). Deliberately does NOT try to also union in discountGrantApproval ApprovalRequests
    // (pending/rejected rows) into this same query — ApprovalRequest.payload is plain text, not
    // jsonb, so extracting priceTypeCode/facetValueCode from it in SQL would be fragile. The
    // manager portal instead fetches those via the already-paginated
    // ApprovalRequestService.findByRequestType as a second, separate paginated section — see
    // DiscountsPage.vue.
    async findAllPaginated(
        ctx: RequestContext,
        options: DiscountRuleListOptions = {},
    ): Promise<PaginatedList<DiscountRule>> {
        const qb = this.connection.getRepository(ctx, DiscountRule).createQueryBuilder('rule');

        if (options.priceTypeCode) {
            qb.andWhere('rule.priceTypeCode = :priceTypeCode', {
                priceTypeCode: options.priceTypeCode,
            });
        }

        if (options.status) {
            const now = new Date();
            const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
            if (options.status === 'expired') {
                qb.andWhere('rule.validTo < :now', { now });
            } else if (options.status === 'expiring-soon') {
                qb.andWhere('rule.validTo >= :now AND rule.validTo < :soon', { now, soon });
            } else {
                qb.andWhere('rule.validTo >= :soon', { soon });
            }
        }

        if (options.search) {
            const term = `%${options.search}%`;
            // Matches the rule's own columns, plus the customer(s) a materialized grant applies
            // to — via the real ORM relation (DiscountGrant.counterparties), not a raw table
            // join, so this stays substitutable in integration tests the same way every other
            // query in this codebase is (see approval-request.service.ts's subquery gotcha).
            // Alias intentionally not "grant" — GRANT is a reserved SQL keyword in Postgres and
            // produces a raw syntax error when used unquoted as a table alias.
            const grantMatch = this.connection
                .getRepository(ctx, DiscountGrant)
                .createQueryBuilder('dgrant')
                .innerJoin('dgrant.counterparties', 'counterparty')
                .select('1')
                .where('dgrant."discountRuleId" = CAST(rule.id AS TEXT)')
                .andWhere(
                    new Brackets((bqb: WhereExpressionBuilder) => {
                        bqb.where('counterparty.legalName ILIKE :term', { term }).orWhere(
                            'counterparty.shortName ILIKE :term',
                            { term },
                        );
                    }),
                )
                .getQuery();
            qb.andWhere(
                new Brackets((bqb: WhereExpressionBuilder) => {
                    bqb.where('rule.priceTypeCode ILIKE :term', { term })
                        .orWhere('rule.facetValueCode ILIKE :term', { term })
                        .orWhere('rule.facetCode ILIKE :term', { term })
                        .orWhere(`EXISTS (${grantMatch})`, { term });
                }),
            );
        }

        qb.orderBy('rule.validTo', 'DESC')
            .take(options.take ?? 20)
            .skip(options.skip ?? 0);

        const [items, totalItems] = await qb.getManyAndCount();
        return { items, totalItems };
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
