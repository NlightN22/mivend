import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import DataLoader from 'dataloader';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { DiscountTierVM } from './discount-rule.service';
import { DiscountSetupRulesService } from './discount-setup-rules.service';
import { LookupMemo } from './lookup-memo';
import { preloadVariantFacets } from './order-preload';
import { PriceEntryService } from './price-entry.service';
import { PriceResolutionService, ResolvedPrice } from './price-resolution.service';

export interface CatalogPricing {
    price: ResolvedPrice;
    tiers: DiscountTierVM[];
}

// Catalog cards resolve their price fields one by one; this batches the lookups of one request
// (one ctx = one viewer) into a constant number of queries. Never shared across requests.
@Injectable()
export class CatalogPricingService {
    private loaders = new WeakMap<RequestContext, DataLoader<string, CatalogPricing>>();

    constructor(
        private priceResolutionService: PriceResolutionService,
        private priceEntryService: PriceEntryService,
        private discountSetupRulesService: DiscountSetupRulesService,
        private connection: TransactionalConnection,
    ) {}

    get(ctx: RequestContext, variantId: ID): Promise<CatalogPricing> {
        let loader = this.loaders.get(ctx);
        if (!loader) {
            const memo = new LookupMemo();
            loader = new DataLoader(ids => this.loadBatch(ctx, memo, ids));
            this.loaders.set(ctx, loader);
        }
        return loader.load(String(variantId));
    }

    // A failing variant rejects only its own key; a failing preload rejects the batch.
    private async loadBatch(
        ctx: RequestContext,
        memo: LookupMemo,
        ids: readonly string[],
    ): Promise<Array<CatalogPricing | Error>> {
        await this.preload(
            ctx,
            ids.filter(id => /^\d+$/.test(id)),
            memo,
        );
        return Promise.all(
            ids.map(async id => {
                try {
                    return {
                        price: await this.priceResolutionService.resolve(ctx, id, undefined, {
                            memo,
                        }),
                        tiers: await this.priceResolutionService.resolveTiers(ctx, id, memo),
                    };
                } catch (error) {
                    return error instanceof Error ? error : new Error(String(error));
                }
            }),
        );
    }

    // Seeds the memo like the single-variant path would find it: facets, prices of the user and
    // fallback price types, and the counterparty setup members, each in one query.
    private async preload(ctx: RequestContext, ids: string[], memo: LookupMemo): Promise<void> {
        if (ids.length === 0) return;
        const scope = await this.priceResolutionService.catalogPricingScope(ctx, memo);
        const erpIdByVariant = await preloadVariantFacets(this.connection, ctx, ids, memo);
        const codeByVariant = new Map<string, string>();
        let missing = ids;
        for (const code of new Set([scope.userCode, scope.defaultCode])) {
            if (!code || missing.length === 0) continue;
            const prices = await this.priceEntryService.getForVariants(ctx, missing, code);
            for (const id of missing) {
                memo.set(`price:${id}:${code}`, prices.get(id) ?? null);
                if (prices.has(id)) codeByVariant.set(id, code);
            }
            missing = missing.filter(id => !prices.has(id));
        }
        const erpIdsByCode = new Map<string, Set<string>>();
        for (const [id, code] of codeByVariant) {
            const erpIds = erpIdsByCode.get(code) ?? new Set<string>();
            erpIds.add(erpIdByVariant.get(id) ?? '');
            erpIdsByCode.set(code, erpIds);
        }
        for (const [code, erpIds] of erpIdsByCode) {
            await this.discountSetupRulesService.preloadCatalog(
                ctx,
                scope.counterparty,
                code,
                [...erpIds],
                memo,
            );
        }
    }
}
