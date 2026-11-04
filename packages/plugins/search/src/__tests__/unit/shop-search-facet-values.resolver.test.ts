import { describe, expect, it, vi } from 'vitest';

import { ShopSearchFacetValuesResolver } from '../../shop-search-facet-values.resolver';

function setup() {
    const facetValues = vi.fn().mockResolvedValue([]);
    const collections = vi.fn().mockResolvedValue([]);
    const hidden = {
        findHiddenIds: vi.fn().mockResolvedValue(new Set()),
        findPrivateCollectionIds: vi.fn().mockResolvedValue(new Set()),
    };
    const moduleRef = { get: () => ({ facetValues, collections }) };
    const resolver = new ShopSearchFacetValuesResolver(hidden as never, moduleRef as never);
    return { resolver, facetValues, collections };
}
const ctx = {} as never;

describe('ShopSearchFacetValuesResolver union input (#307)', () => {
    it('asks Elasticsearch for the union flag, keeping the rest of the input', async () => {
        const { resolver, facetValues, collections } = setup();
        const input = { term: '483855', facetValueFilters: [{ and: '7' }] };
        await resolver.facetValues(ctx, { input });
        await resolver.collections(ctx, { input });
        expect(facetValues.mock.calls[0][1]).toEqual({ ...input, facetUnion: true });
        expect(collections.mock.calls[0][1]).toEqual({ ...input, facetUnion: true });
        expect(input).not.toHaveProperty('facetUnion');
    });

    it('uses the parent lists as is (external backend)', async () => {
        const { resolver, facetValues } = setup();
        await resolver.facetValues(ctx, { input: {}, facetValues: [] });
        expect(facetValues).not.toHaveBeenCalled();
    });
});
