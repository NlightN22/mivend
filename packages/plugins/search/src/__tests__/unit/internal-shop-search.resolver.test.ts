import { describe, expect, it, vi } from 'vitest';
import { ElasticsearchService } from '@vendure/elasticsearch-plugin/lib/src/elasticsearch.service';

import { InternalShopSearchResolver } from '../../internal-shop-search.resolver';

describe('InternalShopSearchResolver', () => {
    function build(hiddenIds: string[]) {
        const search = vi.fn().mockResolvedValue({ items: [], totalItems: 0 });
        const get = vi.fn().mockReturnValue({ search });
        const hidden = { hiddenFacetValueIds: vi.fn().mockResolvedValue(hiddenIds) };
        return {
            search,
            get,
            resolver: new InternalShopSearchResolver({ get } as never, hidden as never),
        };
    }

    it('searches as the shop (enabledOnly) with the hidden category values on the input', async () => {
        const { search, get, resolver } = build(['4', '8']);
        const ctx = {} as never;
        const result = await resolver.search(ctx, { term: 'oil' });
        expect(get).toHaveBeenCalledWith(ElasticsearchService, { strict: false });
        const scoped = { term: 'oil', hiddenFacetValueIds: ['4', '8'] };
        expect(search).toHaveBeenCalledWith(ctx, scoped, true);
        expect(result.input).toEqual(scoped);
    });

    it('passes an empty list when no category is hidden', async () => {
        const { search, resolver } = build([]);
        await resolver.search({} as never, { term: 'oil' });
        expect(search.mock.calls[0][1]).toMatchObject({ hiddenFacetValueIds: [] });
    });
});
