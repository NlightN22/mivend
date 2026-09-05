import { describe, expect, it, vi } from 'vitest';
import type { Product, RequestContext } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { ExternalSearchService } from '../../external-search.service';
import { ProductLookupService } from '../../product-lookup.service';
import { ResolveQueryResponseItem, SearchServiceClient } from '../../search-service.client';

function makeItem(overrides: Partial<ResolveQueryResponseItem> = {}): ResolveQueryResponseItem {
    return {
        partOrProductId: 'ext-001',
        sku: 'MOT-5W30-4L',
        canonicalName: 'Motor Oil 5W-30',
        categoryPath: [],
        manufacturerCodes: [],
        hasAvailableOffer: true,
        hasPrice: true,
        matchReasons: ['exactSku'],
        score: 1.5,
        ...overrides,
    };
}

const ctx = {
    languageCode: 'en',
    channel: { defaultCurrencyCode: 'RUB' },
} as unknown as RequestContext;

function makeProduct(id = 1): Product {
    return {
        id,
        translations: [{ languageCode: 'en', name: 'Motor Oil', slug: 'motor-oil' }],
        featuredAsset: null,
        variants: [
            {
                id: 10,
                sku: 'MOT-5W30-4L',
                enabled: true,
                translations: [{ languageCode: 'en', name: 'Motor Oil 4L' }],
                featuredAsset: null,
            },
        ],
    } as unknown as Product;
}

function makeLookup(product: Product | null): {
    findByExternalId: ReturnType<typeof vi.fn>;
    pickDefaultVariant: ReturnType<typeof vi.fn>;
} {
    return {
        findByExternalId: vi.fn().mockResolvedValue(product),
        pickDefaultVariant: vi.fn().mockImplementation((p: Product) => p.variants[0]),
    };
}

// Issue #69, test-design coverage areas 2 and 3.
describe('ExternalSearchService.search', () => {
    it('skips a search-service item with no matching Product.customFields.externalId, without erroring', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = makeLookup(null);
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
        );

        const result = await service.search(ctx, { term: 'oil' } as SearchInput);

        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(0);
    });

    it('maps a matched item to a SearchResult using the product single/default variant', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = makeLookup(makeProduct());
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
        );

        const result = await service.search(ctx, { term: 'oil' } as SearchInput);

        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
            sku: 'MOT-5W30-4L',
            productId: '1',
            productVariantId: '10',
            productName: 'Motor Oil',
            slug: 'motor-oil',
            price: { value: 0 },
            priceWithTax: { value: 0 },
            currencyCode: 'RUB',
            facetIds: [],
            facetValueIds: [],
            collectionIds: [],
            score: 1.5,
        });
    });

    it('skips a matched product with no enabled variant (audit finding, mivend.audit.70)', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = {
            findByExternalId: vi.fn().mockResolvedValue(makeProduct()),
            pickDefaultVariant: vi.fn().mockReturnValue(undefined),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
        );

        const result = await service.search(ctx, { term: 'oil' } as SearchInput);

        expect(result.items).toEqual([]);
    });

    it('returns an empty, valid SearchResponse for an empty search-service result', async () => {
        const client = { resolveQuery: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
        const lookup = makeLookup(null);
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
        );

        const result = await service.search(ctx, { term: 'no-match-xyz' } as SearchInput);

        expect(result).toEqual({ items: [], totalItems: 0, facetValues: [], collections: [] });
        expect(lookup.findByExternalId).not.toHaveBeenCalled();
    });

    it('returns an empty response without calling search-service when the term is empty', async () => {
        const client = { resolveQuery: vi.fn() };
        const lookup = makeLookup(null);
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
        );

        const result = await service.search(ctx, {} as SearchInput);

        expect(result).toEqual({ items: [], totalItems: 0, facetValues: [], collections: [] });
        expect(client.resolveQuery).not.toHaveBeenCalled();
    });
});
