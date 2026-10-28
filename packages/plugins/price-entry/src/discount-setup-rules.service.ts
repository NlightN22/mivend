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
        const rules = await memoized(
            memo,
            `dsr:${counterparty.erpId}|${contractErpId}|${priceTypeCode ?? ''}`,
            () => this.loadRules(ctx, counterparty.erpId, contractErpId, priceTypeCode, now),
        );
        if (rules.length === 0) return null;

        const productsInPlay = new Set(quantityByProductErpId.keys());
        if (productErpId !== null) productsInPlay.add(productErpId);
        const ids = [...productsInPlay].sort();
        const membersBySetup = await memoized(
            memo,
            `dsm:${rules.map(r => r.id).join(',')}|${ids.join(',')}`,
            async () => {
                const list = await this.loadMembers(ctx, rules, ids);
                const filter = await this.loadFilterMembers(ctx, rules, ids, memo);
                return new Map([...list, ...filter]);
            },
        );
        return bestSetupPercent({
            rules,
            membersBySetup,
            productErpId,
            quantityByProductErpId,
            documentAmount,
        });
    }

    private async loadRules(
        ctx: RequestContext,
        counterpartyErpId: string,
        contractErpId: string,
        priceTypeCode: string | null,
        now: Date,
    ): Promise<LoadedDiscountSetup[]> {
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
    ): Promise<Map<number, Set<string>>> {
        const listRules = rules.filter(isListRule).map(rule => rule.id);
        const members = new Map<number, Set<string>>();
        if (listRules.length === 0 || productErpIds.length === 0) return members;
        const rows = await ctxQuery<Array<{ setupId: number; productErpId: string }>>(
            this.connection,
            ctx,
            `SELECT "setupId", "productErpId" FROM discount_setup_product
             WHERE "setupId" = ANY($1::int[]) AND "productErpId" = ANY($2::text[])`,
            [listRules, productErpIds],
        );
        for (const row of rows) {
            const set = members.get(row.setupId) ?? new Set<string>();
            set.add(row.productErpId);
            members.set(row.setupId, set);
        }
        return members;
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

const isFilterRule = (rule: LoadedDiscountSetup): boolean =>
    !rule.allProducts && rule.productMode === 'filter';
const isListRule = (rule: LoadedDiscountSetup): boolean =>
    !rule.allProducts && rule.productMode !== 'filter';
