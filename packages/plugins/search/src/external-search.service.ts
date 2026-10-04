import { Injectable } from '@nestjs/common';
import {
    Product,
    ProductVariant,
    RequestContext,
    TransactionalConnection,
    Translation,
} from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { mapFacetsToFacetValues, ExternalFacetValueResult } from './facet-mapper';
import { hasBrowseCriteria, mapSearchInputToResolveQueryRequest } from './query-mapper';
import { SearchFilterResolver } from './search-filter-resolver.service';
import { ProductLookupService } from './product-lookup.service';
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
}

export interface ExternalSearchResponse {
    items: ExternalSearchResult[];
    totalItems: number;
    facetValues: ExternalFacetValueResult[];
    collections: never[];
}

// Backend for SEARCH_BACKEND=external (issue #69, #164): resolves the shop-api `search` query
// against search-service. Only the manufacturer facet is mapped; collections stay empty (the
// category tree comes from the Collection query).
@Injectable()
export class ExternalSearchService {
    constructor(
        private client: SearchServiceClient,
        private productLookup: ProductLookupService,
        private filterResolver: SearchFilterResolver,
        private connection: TransactionalConnection,
    ) {}

    async search(
        ctx: RequestContext,
        input: SearchInput,
        includeDisabled = false,
    ): Promise<ExternalSearchResponse> {
        const resolved = await this.filterResolver.resolve(ctx, input);
        const request = mapSearchInputToResolveQueryRequest(input, resolved);
        const empty = { items: [], totalItems: 0, facetValues: [], collections: [] };
        if (resolved.unsatisfiable) return empty;
        if (!hasBrowseCriteria(request)) {
            if (resolved.warehouseIds) return empty;
            return this.browseLocally(ctx, input, includeDisabled);
        }

        const response = await this.client.resolveQuery(request);

        const products = await this.productLookup.findByExternalIds(
            ctx,
            response.items.map(item => item.partOrProductId),
            includeDisabled,
        );
        const items: ExternalSearchResult[] = [];
        for (const item of response.items) {
            const result = this.toSearchResult(
                ctx,
                item.canonicalName,
                item.score,
                products.get(item.partOrProductId),
            );
            if (result) items.push(result);
        }

        return {
            items,
            // search-service's total, so pagination works; hits not synced into this instance
            // are skipped from `items`, which can leave a page shorter than `take`.
            totalItems: response.total,
            facetValues: await mapFacetsToFacetValues(this.connection, ctx, response.facets),
            collections: [],
        };
    }

    // No query/category/filter: search-service has nothing to rank, so list straight from our DB.
    private async browseLocally(
        ctx: RequestContext,
        input: SearchInput,
        includeDisabled: boolean,
    ): Promise<ExternalSearchResponse> {
        const { products, total } = await this.productLookup.browse(
            ctx,
            {
                skip: input.skip ?? 0,
                take: input.take ?? 24,
                sortByName: input.sort?.name ?? null,
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
