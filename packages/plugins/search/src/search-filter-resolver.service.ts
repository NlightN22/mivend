import { Injectable } from '@nestjs/common';
import {
    Collection,
    FacetValue,
    Logger,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { ID } from '@vendure/common/lib/shared-types';
import { StockLevelService } from '@mivend/plugin-reservation';
import { categoryErpIdFromSlug } from 'shared';

import { loggerCtx, ShopSearchInput } from './types';

const MANUFACTURER_FACET_CODE = 'manufacturer';
const CATEGORY_FACET_CODE = 'category';

export interface ResolvedSearchFilters {
    categoryId?: string;
    manufacturer: string[];
    warehouseIds?: string[];
}

// Translates Vendure ids/slugs in SearchInput into the ERP ids search-service filters on.
// Unknown or unsupported values are dropped with a warning, never failed.
@Injectable()
export class SearchFilterResolver {
    constructor(
        private connection: TransactionalConnection,
        private stockLevelService: StockLevelService,
    ) {}

    async resolve(ctx: RequestContext, input: ShopSearchInput): Promise<ResolvedSearchFilters> {
        const categoryIds = await this.categoryIdsFromCollections(ctx, input);
        const manufacturer: string[] = [];

        const facetValueIds = [
            ...(input.facetValueIds ?? []),
            ...(input.facetValueFilters ?? []).flatMap(f => [
                ...(f.and ? [f.and] : []),
                ...(f.or ?? []),
            ]),
        ];
        for (const value of await this.loadFacetValues(ctx, facetValueIds)) {
            if (value.facet.code === MANUFACTURER_FACET_CODE) manufacturer.push(value.code);
            else if (value.facet.code === CATEGORY_FACET_CODE) categoryIds.push(value.code);
            else
                Logger.warn(
                    `ignoring unsupported facet value filter (${value.facet.code})`,
                    loggerCtx,
                );
        }

        if (categoryIds.length > 1) {
            Logger.warn('search-service supports one category; using the first', loggerCtx);
        }
        return {
            categoryId: categoryIds[0],
            manufacturer: [...new Set(manufacturer)],
            ...(input.inStock
                ? { warehouseIds: await this.stockLevelService.getViewerWarehouseErpIds(ctx) }
                : {}),
        };
    }

    private async categoryIdsFromCollections(
        ctx: RequestContext,
        input: ShopSearchInput,
    ): Promise<string[]> {
        const slugs = [input.collectionSlug, ...(input.collectionSlugs ?? [])];
        const ids = [input.collectionId, ...(input.collectionIds ?? [])].filter(Boolean);
        if (ids.length > 0) {
            const collections = await this.connection
                .getRepository(ctx, Collection)
                .createQueryBuilder('collection')
                .leftJoinAndSelect('collection.translations', 't')
                .whereInIds(ids)
                .getMany();
            slugs.push(...collections.flatMap(c => c.translations.map(t => t.slug)));
        }
        const result: string[] = [];
        for (const slug of slugs) {
            const erpId = slug ? categoryErpIdFromSlug(slug) : undefined;
            if (erpId && !result.includes(erpId)) result.push(erpId);
        }
        return result;
    }

    private async loadFacetValues(ctx: RequestContext, ids: ID[]): Promise<FacetValue[]> {
        if (ids.length === 0) return [];
        return this.connection
            .getRepository(ctx, FacetValue)
            .createQueryBuilder('fv')
            .leftJoinAndSelect('fv.facet', 'facet')
            .whereInIds([...new Set(ids)])
            .getMany();
    }
}
