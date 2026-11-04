import { describe, expect, it, vi } from 'vitest';
import { ElasticsearchService } from '@vendure/elasticsearch-plugin/lib/src/elasticsearch.service';

import { InternalCodeMatchesService } from '../../internal-code-matches.service';

function setup(totalItems = 2) {
    const search = vi.fn().mockResolvedValue({
        items: [
            { sku: '48.3855', productId: '1' },
            { sku: '48.3855X', productId: '2' },
        ].slice(0, totalItems),
        totalItems,
    });
    const totalHits = vi.fn().mockResolvedValue(totalItems);
    const get = vi.fn().mockReturnValue({ search, totalHits });
    return { service: new InternalCodeMatchesService({ get } as never), search, totalHits, get };
}
const ctx = {} as never;

describe('InternalCodeMatchesService', () => {
    it('returns null without calling Elasticsearch for a pure-text or empty term', async () => {
        const { service, search, get } = setup();
        expect(await service.find(ctx, { term: 'oil filter' }, 'sku', true)).toBeNull();
        expect(await service.find(ctx, {}, 'sku', true)).toBeNull();
        expect(search).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
    });

    it('first page: up to 100 hits, same filters, term replaced by the code scope', async () => {
        const { service, search } = setup();
        const input = { term: '483855', take: 24, inStock: true, collectionSlug: 'oils' };
        const result = await service.find(ctx, input, 'sku', true);
        const [, sent, enabledOnly] = search.mock.calls[0];
        expect(sent).toMatchObject({
            term: '',
            inStock: true,
            collectionSlug: 'oils',
            groupByProduct: true,
            skip: 0,
            take: 100,
            codeScope: { kind: 'sku', codes: ['483855'] },
        });
        expect(enabledOnly).toBe(true);
        expect(result?.total).toBe(2);
        expect(result?.items.map(i => i.matchReasons)).toEqual([
            ['exactNormalizedSku'],
            ['prefixSku'],
        ]);
    });

    it('later pages and facets-only requests: no items, exact total', async () => {
        const { service, search, totalHits } = setup(5);
        for (const input of [
            { term: '483855', skip: 24, take: 24 },
            { term: '483855', take: 0 },
        ]) {
            expect(await service.find(ctx, input, 'sku', false)).toEqual({ items: [], total: 5 });
        }
        expect(search).not.toHaveBeenCalled();
        expect(totalHits).toHaveBeenCalledTimes(2);
        expect(totalHits.mock.calls[0][2]).toBe(false);
    });

    it('returns null when the group is empty and gives no reasons for other kinds', async () => {
        const empty = setup(0);
        expect(await empty.service.find(ctx, { term: '1' }, 'sku', true)).toBeNull();
        expect(await empty.service.find(ctx, { term: '1', skip: 5 }, 'sku', true)).toBeNull();
        const { service } = setup();
        const oem = await service.find(ctx, { term: '483855' }, 'manufacturerCode', true);
        expect(oem?.items.every(i => i.matchReasons === undefined)).toBe(true);
    });

    it('resolves the real ElasticsearchService class with strict:false', async () => {
        const { service, get } = setup();
        await service.find(ctx, { term: '1' }, 'partNumber', true);
        expect(get).toHaveBeenCalledWith(ElasticsearchService, { strict: false });
    });
});
