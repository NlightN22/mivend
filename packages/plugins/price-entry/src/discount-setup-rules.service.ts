import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';
import { ctxQuery } from 'shared';

import { bestSetupPercent } from './discount-setup-evaluation';
import type { DiscountConditionMetric, LoadedDiscountSetup } from './discount-setup-evaluation';
import {
    filterMembers,
    loadProductAttributes,
    loadSetupTerms,
    resolveRefs,
} from './discount-setup-filter-lookup';
import { BatchLoader } from './batch-loader';
import { LookupMemo, memoized } from './lookup-memo';

interface SetupRow {
    id: number;
    percent: number;
    allProducts: boolean;
    productMode: string;
    conditionNumber: number | null;
    metric: DiscountConditionMetric | null;
}

// Read path of the ERP discount setup documents (issue #289/#290). Customer, contract and price type
// are mandatory matches, so a setup can also be a markup; overlap is resolved here at read time.
@Injectable()
export class DiscountSetupRulesService {
    constructor(private connection: TransactionalConnection) {}

    // Without an order (catalog) only setups for the counterparty itself are read, and the empty quantity
    // map and zero amount let just unconditional or threshold-0 setups match, like the price-type ladder.
    async getBestPercent(
        ctx: RequestContext,
        order: Order | undefined,
        counterparty: Counterparty | null,
        priceTypeCode: string | null,
        productErpId: string | null,
        quantityByProductErpId: Map<string, number>,
        documentAmount: number,
        now: Date,
        memo?: LookupMemo,
    ): Promise<number | null> {
        if (!counterparty) return null;
        const contractErpId = order?.customFields.erpContractId ?? '';
        const rules = await this.rulesFor(
            ctx,
            counterparty,
            contractErpId,
            priceTypeCode,
            now,
            memo,
        );
        if (rules.length === 0) return null;

        const productsInPlay = new Set(quantityByProductErpId.keys());
        if (productErpId !== null) productsInPlay.add(productErpId);
        const ids = [...productsInPlay].sort();
        const { membersBySetup, percentBySetup } = await memoized(memo, memberKey(rules, ids), () =>
            this.membersOf(ctx, rules, ids, memo),
        );
        return bestSetupPercent({
            rules,
            membersBySetup,
            percentBySetup,
            productErpId,
            quantityByProductErpId,
            documentAmount,
        });
    }

    private rulesFor(
        ctx: RequestContext,
        counterparty: Counterparty,
        contractErpId: string,
        priceTypeCode: string | null,
        now: Date,
        memo?: LookupMemo,
    ): Promise<LoadedDiscountSetup[]> {
        return memoized(
            memo,
            `dsr:${counterparty.erpId}|${contractErpId}|${priceTypeCode ?? ''}`,
            () => this.loadRules(ctx, counterparty.erpId, contractErpId, priceTypeCode, now),
        );
    }

    private async membersOf(
        ctx: RequestContext,
        rules: LoadedDiscountSetup[],
        ids: string[],
        memo?: LookupMemo,
    ): Promise<SetupMembers> {
        const list = await this.loadMembers(ctx, rules, ids);
        const filter = await this.loadFilterMembers(ctx, rules, ids, memo);
        return {
            membersBySetup: new Map([...list.members, ...filter]),
            percentBySetup: list.percents,
        };
    }

    // Catalog pages price many products at once: seeds the per-product lookups getBestPercent
    // will ask for (no order) from one query per kind.
    async preloadCatalog(
        ctx: RequestContext,
        counterparty: Counterparty | null,
        priceTypeCode: string | null,
        productErpIds: string[],
        memo: LookupMemo,
    ): Promise<void> {
        if (!counterparty) return;
        const rules = await this.rulesFor(ctx, counterparty, '', priceTypeCode, new Date(), memo);
        if (rules.length === 0) return;
        const ids = [...new Set(productErpIds)];
        const all = await this.membersOf(ctx, rules, ids, memo);
        for (const id of ids) memo.set(memberKey(rules, [id]), sliceMembers(all, id));
    }

    private async loadRules(
        ctx: RequestContext,
        counterpartyErpId: string,
        contractErpId: string,
        priceTypeCode: string | null,
        now: Date,
    ): Promise<LoadedDiscountSetup[]> {
        // unbounded-ok: TRACKED #350 active discount setups on the pricing path are filtered, not bounded
        const rows = await ctxQuery<SetupRow[]>(
            this.connection,
            ctx,
            `SELECT s.id, s.percent, s."allProducts", s."productMode", s."conditionNumber", k.metric
             FROM discount_setup s
             LEFT JOIN discount_condition_kind k ON k."erpName" = s."conditionName"
             WHERE s.active = true
               AND s."validFrom" <= $1 AND (s."validTo" IS NULL OR s."validTo" >= $1)
               AND (s."conditionName" = '' OR k.metric IS NOT NULL)
               AND (s."priceTypeErpId" IS NULL
                    OR s."priceTypeErpId" = (SELECT pt."externalId" FROM price_type pt WHERE pt.code = $4))
               AND EXISTS (SELECT 1 FROM discount_setup_recipient r
                           WHERE r."setupId" = s.id
                             AND r."counterpartyErpId" IN ('', $2) AND r."contractErpId" IN ('', $3))`,
            [now, counterpartyErpId, contractErpId, priceTypeCode],
        );
        return rows.map(row => ({ ...row, percent: Number(row.percent) }));
    }

    private async loadMembers(
        ctx: RequestContext,
        rules: LoadedDiscountSetup[],
        productErpIds: string[],
    ): Promise<{
        members: Map<number, Set<string>>;
        percents: Map<number, Map<string, number>>;
    }> {
        const listRules = rules.filter(isListRule).map(rule => rule.id);
        const members = new Map<number, Set<string>>();
        const percents = new Map<number, Map<string, number>>();
        if (listRules.length === 0 || productErpIds.length === 0) return { members, percents };
        // unbounded-ok: setup members for the setup and product lists passed in
        const rows = await ctxQuery<
            Array<{ setupId: number; productErpId: string; percent: number | null }>
        >(
            this.connection,
            ctx,
            `SELECT "setupId", "productErpId", percent FROM discount_setup_product
             WHERE "setupId" = ANY($1::int[]) AND "productErpId" = ANY($2::text[])`,
            [listRules, productErpIds],
        );
        for (const row of rows) {
            const set = members.get(row.setupId) ?? new Set<string>();
            set.add(row.productErpId);
            members.set(row.setupId, set);
            if (row.percent !== null) {
                const byProduct = percents.get(row.setupId) ?? new Map<string, number>();
                byProduct.set(row.productErpId, Number(row.percent));
                percents.set(row.setupId, byProduct);
            }
        }
        return { members, percents };
    }

    // Filter-mode setups are evaluated lazily over the products in play, the same way for catalog, cart and order.
    private async loadFilterMembers(
        ctx: RequestContext,
        rules: LoadedDiscountSetup[],
        productErpIds: string[],
        memo?: LookupMemo,
    ): Promise<Map<number, Set<string>>> {
        const filterIds = rules.filter(isFilterRule).map(rule => rule.id);
        if (filterIds.length === 0 || productErpIds.length === 0) return new Map();
        const { terms, known } = await memoized(memo, `dst:${filterIds.join(',')}`, async () => {
            const loaded = await loadSetupTerms(this.connection, ctx, filterIds);
            const refs = [...new Set([...loaded.values()].flat().flatMap(t => t.refs))];
            return { terms: loaded, known: await resolveRefs(this.connection, ctx, refs) };
        });
        const attributes = memo
            ? await (
                  await memoized(
                      memo,
                      'dsa-loader',
                      async () =>
                          new BatchLoader(ids => loadProductAttributes(this.connection, ctx, ids)),
                  )
              ).loadAll(productErpIds)
            : await loadProductAttributes(this.connection, ctx, productErpIds);
        return filterMembers(terms, attributes, known, productErpIds);
    }
}

const memberKey = (rules: LoadedDiscountSetup[], ids: string[]): string =>
    `dsm:${rules.map(r => r.id).join(',')}|${ids.join(',')}`;

interface SetupMembers {
    membersBySetup: Map<number, Set<string>>;
    percentBySetup: Map<number, Map<string, number>>;
}

function sliceMembers(all: SetupMembers, id: string): SetupMembers {
    const membersBySetup = new Map<number, Set<string>>();
    for (const [setupId, members] of all.membersBySetup) {
        if (members.has(id)) membersBySetup.set(setupId, new Set([id]));
    }
    const percentBySetup = new Map<number, Map<string, number>>();
    for (const [setupId, byProduct] of all.percentBySetup) {
        const percent = byProduct.get(id);
        if (percent !== undefined) percentBySetup.set(setupId, new Map([[id, percent]]));
    }
    return { membersBySetup, percentBySetup };
}

const isFilterRule = (rule: LoadedDiscountSetup): boolean =>
    !rule.allProducts && rule.productMode === 'filter';
const isListRule = (rule: LoadedDiscountSetup): boolean =>
    !rule.allProducts && rule.productMode !== 'filter';
