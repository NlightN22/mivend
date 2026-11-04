import { Injectable } from '@nestjs/common';
import {
    Product,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    Translation,
} from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import type { ResolveQueryCodeGroup, ResolveQueryResponseItem } from './search-service.client';
import { ExternalCollectionResult, mapFacetsToCollections } from './category-facet-mapper';
import { mapFacetsToFacetValues, ExternalFacetValueResult } from './facet-mapper';
import {
    hasBrowseCriteria,
    hasPriceCriteria,
    mapSearchInputToResolveQueryRequest,
} from './query-mapper';
import { SearchFilterResolver } from './search-filter-resolver.service';
import { ProductLookupService } from './product-lookup.service';
import { SearchPriceTypeService } from './search-price-type.service';
import { SearchServiceClient } from './search-service.client';

interface SearchResultAssetVM {
    id: string;
    preview: string;
    focalPoint?: { x: number; y: number } | null;
}

export interface ExternalSearchResult {
    sku: string;
    slug: string;
    productId: string;
    productName: string;
    productAsset: SearchResultAssetVM | null;
    productVariantId: string;
    productVariantName: string;
    productVariantAsset: SearchResultAssetVM | null;
    price: { value: number };
    priceWithTax: { value: number };
    currencyCode: string;
    description: string;
    facetIds: string[];
    facetValueIds: string[];
    collectionIds: string[];
    score: number;
    matchReasons: string[];
}

export interface ExternalCodeMatches {
    items: ExternalSearchResult[];
    total: number;
}

export interface ExternalSearchResponse {
    items: ExternalSearchResult[];
    totalItems: number;
    skuMatches?: ExternalCodeMatches;
    partNumberMatches?: ExternalCodeMatches;
    manufacturerCodeMatches?: ExternalCodeMatches;
    facetValues: ExternalFacetValueResult[];
    collections: ExternalCollectionResult[];
}

// Collections carry counts only; the category tree must come from the Collection query.
@Injectable()
export class ExternalSearchService {
    constructor(
        private client: SearchServiceClient,
        private productLookup: ProductLookupService,
        private filterResolver: SearchFilterResolver,
        private connection: TransactionalConnection,
        private priceTypes: SearchPriceTypeService,
    ) {}

    async search(
        ctx: RequestContext,
        input: SearchInput,
        includeDisabled = false,
    ): Promise<ExternalSearchResponse> {
        const resolved = await this.filterResolver.resolve(ctx, input);
        const priceTypeId = hasPriceCriteria(input)
            ? await this.priceTypes.resolveExternalId(ctx)
            : null;
        const request = {
            ...mapSearchInputToResolveQueryRequest(input, resolved, priceTypeId),
            ...(includeDisabled ? {} : { requireOrganization: true }),
        };
        const empty = { items: [], totalItems: 0, facetValues: [], collections: [] };
        if (resolved.unsatisfiable) return empty;
        if (!hasBrowseCriteria(request)) {
            if (resolved.warehouseIds?.length === 0) return empty;
            return this.browseLocally(ctx, input, includeDisabled, resolved.warehouseIds);
        }

        const response = await this.client.resolveQuery(request);

        const groups = {
            skuMatches: response.skuMatches,
            partNumberMatches: response.partNumberMatches,
            manufacturerCodeMatches: response.manufacturerCodeMatches,
        };
        const hits = [
            ...Object.values(groups).flatMap(group => group?.items ?? []),
            ...response.items,
        ];
        const products = await this.productLookup.findByExternalIds(
            ctx,
            hits.map(item => item.partOrProductId),
            includeDisabled,
        );
        // search-service keeps the parts disjoint; the guard keeps a card from ever showing twice.
        const seen = new Set<string>();
        const toResults = (source: ResolveQueryResponseItem[]): ExternalSearchResult[] => {
            const results: ExternalSearchResult[] = [];
            for (const item of source) {
                if (seen.has(item.partOrProductId)) continue;
                const result = this.toSearchResult(
                    ctx,
                    item.canonicalName,
                    item.score,
                    products.get(item.partOrProductId),
                    item.matchReasons,
                );
                if (!result) continue;
                seen.add(item.partOrProductId);
                results.push(result);
            }
            return results;
        };
        const codeMatches: Partial<Record<keyof typeof groups, ExternalCodeMatches>> = {};
        for (const [key, group] of Object.entries(groups) as Array<
            [keyof typeof groups, ResolveQueryCodeGroup | undefined]
        >) {
            if (group) codeMatches[key] = { items: toResults(group.items), total: group.total };
        }
        const items = input.take === 0 ? [] : toResults(response.items);

        return {
            items,
            ...codeMatches,
            // search-service's total, so pagination works; hits not synced into this instance
            // are skipped from `items`, which can leave a page shorter than `take`.
            totalItems: response.total,
            facetValues: await mapFacetsToFacetValues(this.connection, ctx, response.facets),
            collections: await mapFacetsToCollections(this.connection, ctx, response.facets),
        };
    }

    // No query/category/filter: search-service has nothing to rank, so list straight from our DB.
    private async browseLocally(
        ctx: RequestContext,
        input: SearchInput,
        includeDisabled: boolean,
        inStockWarehouseErpIds?: string[],
    ): Promise<ExternalSearchResponse> {
        const { products, total } = await this.productLookup.browse(
            ctx,
            {
                skip: input.skip ?? 0,
                take: input.take ?? 24,
                sortByName: input.sort?.name ?? null,
                inStockWarehouseErpIds,
            },
            includeDisabled,
        );
        const items: ExternalSearchResult[] = [];
        for (const product of products) {
            const name = translationOf(product, ctx.languageCode)?.name ?? '';
            const result = this.toSearchResult(ctx, name, 0, product);
            if (result) items.push(result);
        }
        return { items, totalItems: total, facetValues: [], collections: [] };
    }

    private toSearchResult(
        ctx: RequestContext,
        canonicalName: string,
        score: number,
        product: Product | undefined,
        matchReasons: string[] = [],
    ): ExternalSearchResult | null {
        if (!product) return null;

        const variant = this.productLookup.pickDefaultVariant(product);
        if (!variant) return null;

        return {
            sku: variant.sku,
            slug: translationOf(product, ctx.languageCode)?.slug ?? '',
            productId: String(product.id),
            productName: translationOf(product, ctx.languageCode)?.name ?? canonicalName,
            productAsset: toAssetVM(product.featuredAsset),
            productVariantId: String(variant.id),
            productVariantName: translationOf(variant, ctx.languageCode)?.name ?? canonicalName,
            productVariantAsset: toAssetVM(variant.featuredAsset),
            price: { value: 0 },
            priceWithTax: { value: 0 },
            currencyCode: ctx.channel.defaultCurrencyCode,
            description: canonicalName,
            facetIds: [],
            facetValueIds: [],
            collectionIds: [],
            score,
            matchReasons,
        };
    }
}

function translationOf<T extends Product | ProductVariant>(
    entity: T,
    languageCode: string,
): Translation<T> | undefined {
    const translations = entity.translations as unknown as Array<Translation<T>>;
    return translations.find(t => t.languageCode === languageCode) ?? translations[0] ?? undefined;
}

function toAssetVM(
    asset: { id: unknown; preview: string; focalPoint?: unknown } | null | undefined,
): SearchResultAssetVM | null {
    if (!asset) return null;
    return {
        id: String(asset.id),
        preview: asset.preview,
        focalPoint: (asset.focalPoint as { x: number; y: number } | null) ?? null,
    };
}
