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
import { categoryErpIdFromSlug, characteristicKeyFromFacetCode } from 'shared';

import { loggerCtx, ShopSearchInput } from './types';

const MANUFACTURER_FACET_CODE = 'manufacturer';
const CATEGORY_FACET_CODE = 'category';

export interface ResolvedSearchFilters {
    categoryId?: string;
    manufacturer: string[];
    characteristics: Array<{ key: string; normalized: string }>;
    warehouseIds?: string[];
    unsatisfiable: boolean;
}

// Translates Vendure ids/slugs in SearchInput into the ERP ids search-service filters on.
// A requested filter that resolves to nothing makes the search unsatisfiable (empty result),
// never an unfiltered one.
@Injectable()
export class SearchFilterResolver {
    constructor(
        private connection: TransactionalConnection,
        private stockLevelService: StockLevelService,
    ) {}

    async resolve(ctx: RequestContext, input: ShopSearchInput): Promise<ResolvedSearchFilters> {
        const fromCollections = await this.categoryIdsFromCollections(ctx, input);
        const categoryIds = fromCollections.ids;
        let unsatisfiable = fromCollections.unresolved;
        const manufacturer: string[] = [];
        const characteristics: Array<{ key: string; normalized: string }> = [];

        const facetValueIds = [
            ...(input.facetValueIds ?? []),
            ...(input.facetValueFilters ?? []).flatMap(f => [
                ...(f.and ? [f.and] : []),
                ...(f.or ?? []),
            ]),
        ];
        const loaded = await this.loadFacetValues(ctx, facetValueIds);
        if (loaded.length < new Set(facetValueIds.map(String)).size) unsatisfiable = true;
        for (const value of loaded) {
            if (value.facet.code === MANUFACTURER_FACET_CODE) manufacturer.push(value.code);
            else if (value.facet.code === CATEGORY_FACET_CODE) categoryIds.push(value.code);
            else if (characteristicKeyFromFacetCode(value.facet.code) !== undefined) {
                characteristics.push({
                    key: characteristicKeyFromFacetCode(value.facet.code) as string,
                    normalized: value.code,
                });
            } else {
                unsatisfiable = true;
                Logger.warn(`unsupported facet filter (${value.facet.code})`, loggerCtx);
            }
        }

        if (categoryIds.length > 1) {
            Logger.warn('search-service supports one category; using the first', loggerCtx);
        }
        return {
            categoryId: categoryIds[0],
            manufacturer: [...new Set(manufacturer)],
            characteristics,
            unsatisfiable,
            ...(input.inStock
                ? { warehouseIds: await this.stockLevelService.getViewerWarehouseErpIds(ctx) }
                : {}),
        };
    }

    private async categoryIdsFromCollections(
        ctx: RequestContext,
        input: ShopSearchInput,
    ): Promise<{ ids: string[]; unresolved: boolean }> {
        let unresolved = false;
        const slugs = [input.collectionSlug, ...(input.collectionSlugs ?? [])];
        const ids = [input.collectionId, ...(input.collectionIds ?? [])].filter(Boolean);
        if (ids.length > 0) {
            const collections = await this.connection
                .getRepository(ctx, Collection)
                .createQueryBuilder('collection')
                .leftJoinAndSelect('collection.translations', 't')
                .whereInIds(ids)
                .getMany();
            if (collections.length < new Set(ids.map(String)).size) unresolved = true;
            slugs.push(...collections.flatMap(c => c.translations.map(t => t.slug)));
        }
        const result: string[] = [];
        for (const slug of slugs.filter(Boolean)) {
            const erpId = categoryErpIdFromSlug(slug as string);
            if (!erpId) unresolved = true;
            else if (!result.includes(erpId)) result.push(erpId);
        }
        return { ids: result, unresolved };
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
