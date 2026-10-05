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
    findByExternalIds: ReturnType<typeof vi.fn>;
    pickDefaultVariant: ReturnType<typeof vi.fn>;
} {
    return {
        findByExternalIds: vi
            .fn()
            .mockResolvedValue(new Map(product ? [['ext-001', product]] : [])),
        pickDefaultVariant: vi.fn().mockImplementation((p: Product) => p.variants[0]),
    };
}

const noFilters = {
    resolve: vi.fn().mockResolvedValue({ manufacturer: [], unsatisfiable: false }),
};
const noDb = {};

// Issue #69, test-design coverage areas 2 and 3.
describe('ExternalSearchService.search', () => {
    it('returns no items for a facets-only request (take 0) but keeps the total', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 7 }),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            makeLookup(makeProduct()) as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );
        const result = await service.search(ctx, { term: 'oil', take: 0 } as SearchInput);
        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(7);
    });

    it('skips a search-service item with no matching Product.customFields.externalId, without erroring', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = makeLookup(null);
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );

        const result = await service.search(ctx, { term: 'oil' } as SearchInput);

        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(1);
    });

    it('passes includeDisabled through to the lookup (shop excludes disabled, admin includes)', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = makeLookup(makeProduct());
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );

        await service.search(ctx, { term: 'oil' } as SearchInput);
        await service.search(ctx, { term: 'oil' } as SearchInput, true);

        expect(lookup.findByExternalIds).toHaveBeenNthCalledWith(1, ctx, ['ext-001'], false);
        expect(lookup.findByExternalIds).toHaveBeenNthCalledWith(2, ctx, ['ext-001'], true);
    });

    it('uses search-service total and keeps its ranking order with one batched lookup', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({
                items: [
                    makeItem({ partOrProductId: 'ext-b', score: 2 }),
                    makeItem({ partOrProductId: 'ext-missing', score: 1.8 }),
                    makeItem({ partOrProductId: 'ext-a', score: 1 }),
                ],
                total: 500,
            }),
        };
        const lookup = {
            findByExternalIds: vi.fn().mockResolvedValue(
                new Map([
                    ['ext-a', makeProduct(1)],
                    ['ext-b', makeProduct(2)],
                ]),
            ),
            pickDefaultVariant: vi.fn().mockImplementation((p: Product) => p.variants[0]),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );

        const result = await service.search(ctx, { term: 'oil' } as SearchInput);

        expect(lookup.findByExternalIds).toHaveBeenCalledTimes(1);
        expect(lookup.findByExternalIds).toHaveBeenCalledWith(
            ctx,
            ['ext-b', 'ext-missing', 'ext-a'],
            false,
        );
        expect(result.items.map(i => i.productId)).toEqual(['2', '1']);
        expect(result.totalItems).toBe(500);
    });

    it('maps a matched item to a SearchResult using the product single/default variant', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = makeLookup(makeProduct());
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
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
            findByExternalIds: vi.fn().mockResolvedValue(new Map([['ext-001', makeProduct()]])),
            pickDefaultVariant: vi.fn().mockReturnValue(undefined),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
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
            noFilters as never,
            noDb as never,
        );

        const result = await service.search(ctx, { term: 'no-match-xyz' } as SearchInput);

        expect(result).toEqual({ items: [], totalItems: 0, facetValues: [], collections: [] });
        expect(lookup.findByExternalIds).toHaveBeenCalledWith(ctx, [], false);
    });

    // Audit finding, mivend.audit.70 (round 3, CRITICAL): a prior fix made this path throw,
    // which meant a real storefront visitor selecting any facet filter under
    // SEARCH_BACKEND=external got a hard shop-api failure instead of degraded results.
    it('degrades to a plain free-text search instead of throwing when a facet filter is present', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = makeLookup(makeProduct());
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );

        const result = await service.search(ctx, {
            term: 'oil',
            facetValueFilters: [{ and: 'fv-1' }],
        } as SearchInput);

        expect(result.items).toHaveLength(1);
        expect(client.resolveQuery).toHaveBeenCalledWith(expect.objectContaining({ query: 'oil' }));
    });

    it('browses by category with an empty query and returns mapped manufacturer facets', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({
                items: [makeItem()],
                total: 410,
                facets: { manufacturer: [{ value: 'mfr-1', count: 3 }] },
            }),
        };
        const filters = {
            resolve: vi.fn().mockResolvedValue({ categoryId: 'cat-erp', manufacturer: [] }),
        };
        const facetValue = { id: 7, code: 'mfr-1', translations: [{ name: 'Acme' }] };
        const getMany = vi.fn().mockResolvedValue([facetValue]);
        const qb: Record<string, unknown> = {};
        for (const m of ['leftJoinAndSelect', 'where', 'andWhere']) qb[m] = () => qb;
        qb.getMany = getMany;
        const db = { getRepository: () => ({ createQueryBuilder: () => qb }) };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            makeLookup(makeProduct()) as unknown as ProductLookupService,
            filters as never,
            db as never,
        );

        const result = await service.search(ctx, { collectionSlug: 'cat-erp' } as SearchInput);

        expect(client.resolveQuery).toHaveBeenCalledWith(
            expect.objectContaining({ query: '', categoryId: 'cat-erp' }),
        );
        expect(result.totalItems).toBe(410);
        expect(result.facetValues).toEqual([{ facetValue, count: 3 }]);
    });

    it('lists the catalog from the local DB when there is no query, category or filter', async () => {
        const client = { resolveQuery: vi.fn() };
        const lookup = {
            ...makeLookup(null),
            browse: vi.fn().mockResolvedValue({ products: [makeProduct()], total: 1588 }),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );
        const result = await service.search(ctx, { take: 24, skip: 48 } as SearchInput);
        expect(client.resolveQuery).not.toHaveBeenCalled();
        expect(lookup.browse).toHaveBeenCalledWith(
            ctx,
            { skip: 48, take: 24, sortByName: null },
            false,
        );
        expect(result.totalItems).toBe(1588);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].productName).toBe('Motor Oil');
    });

    it('passes a name sort through to the local listing', async () => {
        const lookup = {
            ...makeLookup(null),
            browse: vi.fn().mockResolvedValue({ products: [], total: 0 }),
        };
        const service = new ExternalSearchService(
            { resolveQuery: vi.fn() } as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );
        await service.search(ctx, { sort: { name: 'DESC' } } as SearchInput);
        expect(lookup.browse).toHaveBeenCalledWith(
            ctx,
            expect.objectContaining({ sortByName: 'DESC' }),
            false,
        );
    });

    it('sends a price range with no query to search-service instead of the local listing', async () => {
        const client = {
            resolveQuery: vi.fn().mockResolvedValue({ items: [makeItem()], total: 1 }),
        };
        const lookup = {
            ...makeLookup(makeProduct()),
            browse: vi.fn(),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            noFilters as never,
            noDb as never,
        );
        await service.search(ctx, {
            priceRangeWithTax: { min: 1000, max: 5000 },
            sort: { price: 'DESC' },
        } as SearchInput);
        expect(lookup.browse).not.toHaveBeenCalled();
        expect(client.resolveQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                sort: 'priceDesc',
                filters: { priceRange: { min: 10, max: 50 } },
            }),
        );
    });

    it('passes the viewer warehouse ids to the local listing when the in-stock filter is on', async () => {
        const client = { resolveQuery: vi.fn() };
        const lookup = {
            ...makeLookup(null),
            browse: vi.fn().mockResolvedValue({ products: [makeProduct()], total: 7 }),
        };
        const filters = {
            resolve: vi.fn().mockResolvedValue({
                manufacturer: [],
                warehouseIds: ['wh-1', 'wh-2'],
                unsatisfiable: false,
            }),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            filters as never,
            noDb as never,
        );
        const result = await service.search(ctx, {
            inStock: true,
            skip: 24,
            take: 12,
            sort: { name: 'ASC' },
        } as SearchInput);
        expect(client.resolveQuery).not.toHaveBeenCalled();
        expect(lookup.browse).toHaveBeenCalledWith(
            ctx,
            { skip: 24, take: 12, sortByName: 'ASC', inStockWarehouseErpIds: ['wh-1', 'wh-2'] },
            false,
        );
        expect(result.totalItems).toBe(7);
        expect(result.items).toHaveLength(1);
    });

    it('returns empty for the bare in-stock catalog when the viewer has no warehouses', async () => {
        const lookup = { ...makeLookup(null), browse: vi.fn() };
        const filters = {
            resolve: vi.fn().mockResolvedValue({
                manufacturer: [],
                warehouseIds: [],
                unsatisfiable: false,
            }),
        };
        const service = new ExternalSearchService(
            { resolveQuery: vi.fn() } as unknown as SearchServiceClient,
            lookup as unknown as ProductLookupService,
            filters as never,
            noDb as never,
        );
        const result = await service.search(ctx, { inStock: true } as SearchInput);
        expect(result.items).toEqual([]);
        expect(result.totalItems).toBe(0);
        expect(lookup.browse).not.toHaveBeenCalled();
    });

    it('returns an empty result without calling search-service when a requested filter is unsatisfiable', async () => {
        const client = { resolveQuery: vi.fn() };
        const filters = {
            resolve: vi.fn().mockResolvedValue({ manufacturer: [], unsatisfiable: true }),
        };
        const service = new ExternalSearchService(
            client as unknown as SearchServiceClient,
            makeLookup(null) as unknown as ProductLookupService,
            filters as never,
            noDb as never,
        );
        const result = await service.search(ctx, {
            term: 'oil',
            collectionSlug: 'bogus',
        } as SearchInput);
        expect(result).toMatchObject({ items: [], totalItems: 0 });
        expect(client.resolveQuery).not.toHaveBeenCalled();
    });
});
