import { Injectable } from '@nestjs/common';
import { Product, ProductVariant, RequestContext, Translation } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { mapSearchInputToResolveQueryRequest } from './query-mapper';
import { ProductLookupService } from './product-lookup.service';
import { ResolveQueryResponseItem, SearchServiceClient } from './search-service.client';

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
    facetValues: never[];
    collections: never[];
}

// Backend for SEARCH_BACKEND=external (issue #69): resolves the shop-api `search` query against
// search-service instead of Elasticsearch. facetValues/collections have no search-service
// equivalent and are always returned empty (see the storefront facet-sidebar note in the issue).
// Incoming collection/facet-value/sort filters are also unsupported (search-service is
// free-text discovery only) — mapSearchInputToResolveQueryRequest drops them and logs loudly
// (Logger.warn) rather than either silently ignoring them or hard-failing the request (audit
// finding, mivend.audit.70: a hard throw here broke every real storefront facet-filter click
// under SEARCH_BACKEND=external, which is worse than the original silent-drop gap it replaced).
// Category/faceted-filter storefront pages still need their own follow-up design against this
// backend — not covered by issue #69's scope, this is a stopgap that keeps `search` available.
@Injectable()
export class ExternalSearchService {
    constructor(
        private client: SearchServiceClient,
        private productLookup: ProductLookupService,
    ) {}

    async search(ctx: RequestContext, input: SearchInput): Promise<ExternalSearchResponse> {
        const request = mapSearchInputToResolveQueryRequest(input);
        if (!request.query) {
            return { items: [], totalItems: 0, facetValues: [], collections: [] };
        }

        const response = await this.client.resolveQuery(request);

        const items: ExternalSearchResult[] = [];
        for (const item of response.items) {
            const result = await this.toSearchResult(ctx, item);
            if (result) items.push(result);
        }

        return {
            items,
            // Only matched-and-mapped items are counted — a `total` reported by search-service
            // for products not yet synced into this instance would be misleading (see the
            // ID-mapping skip-unmatched rule in issue #69).
            totalItems: items.length,
            facetValues: [],
            collections: [],
        };
    }

    private async toSearchResult(
        ctx: RequestContext,
        item: ResolveQueryResponseItem,
    ): Promise<ExternalSearchResult | null> {
        const product = await this.productLookup.findByExternalId(ctx, item.partOrProductId);
        if (!product) return null;

        const variant = this.productLookup.pickDefaultVariant(product);
        if (!variant) return null;

        return {
            sku: variant.sku,
            slug: translationOf(product, ctx.languageCode)?.slug ?? '',
            productId: String(product.id),
            productName: translationOf(product, ctx.languageCode)?.name ?? item.canonicalName,
            productAsset: toAssetVM(product.featuredAsset),
            productVariantId: String(variant.id),
            productVariantName:
                translationOf(variant, ctx.languageCode)?.name ?? item.canonicalName,
            productVariantAsset: toAssetVM(variant.featuredAsset),
            price: { value: 0 },
            priceWithTax: { value: 0 },
            currencyCode: ctx.channel.defaultCurrencyCode,
            description: item.canonicalName ?? '',
            facetIds: [],
            facetValueIds: [],
            collectionIds: [],
            score: item.score,
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
