import { describe, expect, it } from 'vitest';
import type { Type } from '@nestjs/common';
import { getPluginAPIExtensions } from '@vendure/core/dist/plugin/plugin-metadata';

import { InternalShopSearchResolver } from '../../internal-shop-search.resolver';
import { searchPlugins } from '../../search.plugin';

type Extension = { resolvers?: Type<unknown>[] | (() => Type<unknown>[]) };

function definesSearchQuery(resolver: Type<unknown>): boolean {
    const method = (resolver.prototype as { search?: object }).search;
    return method !== undefined && Reflect.getMetadata('graphql:resolver_type', method) === 'Query';
}

// The assembled shop API, in plugin order, as Vendure builds its resolver modules.
describe('shop search resolver precedence on the internal backend', () => {
    const resolvers = (getPluginAPIExtensions(searchPlugins as never, 'shop') as Extension[])
        .flatMap(ext =>
            typeof ext.resolvers === 'function' ? ext.resolvers() : (ext.resolvers ?? []),
        )
        .filter(definesSearchQuery);

    it('has the hidden-category-aware resolver and the Elasticsearch one competing for Query.search', () => {
        expect(resolvers.map(r => r.name)).toEqual([
            InternalShopSearchResolver.name,
            'ShopElasticSearchResolver',
        ]);
    });

    it('registers the hidden-category-aware resolver first, as the plugin order documents', () => {
        expect(resolvers[0]).toBe(InternalShopSearchResolver);
    });
});
