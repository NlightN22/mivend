import { describe, expect, it, vi } from 'vitest';
import { getPluginAPIExtensions } from '@vendure/core';
import { ElasticsearchService } from '@vendure/elasticsearch-plugin/lib/src/elasticsearch.service';

type Cls = abstract new (...args: never[]) => unknown;
const reflect = Reflect as unknown as { getMetadata(key: string, target: object): unknown };

// Order decides which SearchResponse resolver wins; ours must come before Elasticsearch's own.
describe('SearchResponse resolver precedence (internal backend)', () => {
    it('registers our SearchResponse resolver before the Elasticsearch one', async () => {
        vi.resetModules();
        process.env.SEARCH_BACKEND = 'internal';
        const { searchPlugins } = await import('../../search.plugin');
        const { ShopSearchFacetValuesResolver } =
            await import('../../shop-search-facet-values.resolver');
        const resolvers = getPluginAPIExtensions(searchPlugins, 'shop').flatMap(
            e => (typeof e.resolvers === 'function' ? e.resolvers() : (e.resolvers ?? [])) as Cls[],
        );
        const forSearchResponse = resolvers.filter(
            r => reflect.getMetadata('graphql:resolver_type', r) === 'SearchResponse',
        );
        expect(forSearchResponse.length).toBeGreaterThan(1);
        expect(forSearchResponse[0]).toBe(ShopSearchFacetValuesResolver);
    }, 20000);

    it('keeps the deep-imported ElasticsearchService with the methods our resolver calls', () => {
        expect(ElasticsearchService.prototype.facetValues).toBeTypeOf('function');
        expect(ElasticsearchService.prototype.collections).toBeTypeOf('function');
    });

    it('asks ModuleRef for the ElasticsearchService class with strict:false', async () => {
        const { ShopSearchFacetValuesResolver } =
            await import('../../shop-search-facet-values.resolver');
        const facetValues = vi.fn().mockResolvedValue([]);
        const get = vi.fn().mockReturnValue({ facetValues });
        const resolver = new ShopSearchFacetValuesResolver(
            { findHiddenIds: async () => new Set() } as never,
            { get } as never,
        );
        await resolver.facetValues({} as never, { input: {} as never });
        expect(get).toHaveBeenCalledWith(ElasticsearchService, { strict: false });
        expect(facetValues).toHaveBeenCalledOnce();
    }, 20000);
});
