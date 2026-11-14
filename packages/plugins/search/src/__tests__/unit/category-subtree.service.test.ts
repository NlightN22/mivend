import { describe, expect, it, vi } from 'vitest';

import { CategorySubtreeService } from '../../category-subtree.service';

function build(rows: unknown[]) {
    const query = vi.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>(async () => rows);
    const connection = { getRepository: () => ({ query }) };
    return { query, service: new CategorySubtreeService(connection as never) };
}

const ctx = {} as never;
const rows = [
    { collectionId: 1, parentId: null, isPrivate: false, facetValueId: 10 },
    { collectionId: 2, parentId: 1, isPrivate: false, facetValueId: 20 },
    { collectionId: 3, parentId: 1, isPrivate: true, facetValueId: 30 },
];

describe('CategorySubtreeService', () => {
    it('does not read the tree when the input has no facet filters', async () => {
        const { query, service } = build(rows);
        const input = { term: 'oil' };
        expect(await service.expand(ctx, input)).toBe(input);
        expect(query).not.toHaveBeenCalled();
    });

    it('reads the tree once for any number of filters and widens them', async () => {
        const { query, service } = build(rows);
        const result = await service.expand(ctx, {
            facetValueFilters: [{ or: ['10'] }, { and: '10' }, { or: ['77'] }],
        });
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][0]).toContain('LIMIT 5001');
        expect(result.facetValueFilters).toEqual([
            { or: ['10', '20'] },
            { and: undefined, or: ['10', '20'] },
            { or: ['77'] },
        ]);
    });
});
