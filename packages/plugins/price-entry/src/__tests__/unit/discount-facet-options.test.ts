import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { describe, expect, it, vi } from 'vitest';

import { groupFacetOptionRows, loadDiscountFacetOptions } from '../../discount-facet-options';

describe('loadDiscountFacetOptions', () => {
    const connectionReturning = (rows: unknown[]) => {
        const query = vi.fn(async () => rows);
        return {
            query,
            connection: { getRepository: () => ({ query }) } as unknown as TransactionalConnection,
        };
    };
    const ctx = { channelId: 1, languageCode: 'en' } as unknown as RequestContext;
    const row = { facetCode: 'f', facetName: 'F', valueCode: 'v', valueName: 'V' };

    it('bounds the read and returns the grouped options within the ceiling', async () => {
        const { connection, query } = connectionReturning([row]);
        const result = await loadDiscountFacetOptions(connection, ctx, 'en', 2);
        expect(result).toHaveLength(1);
        expect(query.mock.calls[0]).toEqual([expect.stringMatching(/LIMIT 3$/), [1, 'en', 'en']]);
    });

    it('fails loudly when the facet values pass the ceiling', async () => {
        const { connection } = connectionReturning([row, row, row]);
        await expect(loadDiscountFacetOptions(connection, ctx, 'en', 2)).rejects.toMatchObject({
            extensions: { code: 'QUERY_TOO_LARGE' },
        });
    });
});

describe('groupFacetOptionRows', () => {
    it('groups ordered rows by facet and keeps facets without values', () => {
        const result = groupFacetOptionRows([
            { facetCode: 'brand', facetName: 'Brand', valueCode: 'a', valueName: 'A' },
            { facetCode: 'brand', facetName: 'Brand', valueCode: 'b', valueName: 'B' },
            { facetCode: 'empty', facetName: 'Empty', valueCode: null, valueName: null },
        ]);
        expect(result).toEqual([
            {
                code: 'brand',
                name: 'Brand',
                values: [
                    { code: 'a', name: 'A' },
                    { code: 'b', name: 'B' },
                ],
            },
            { code: 'empty', name: 'Empty', values: [] },
        ]);
    });

    it('falls back to the code when no translation exists', () => {
        expect(
            groupFacetOptionRows([
                { facetCode: 'f', facetName: null, valueCode: 'v', valueName: null },
            ]),
        ).toEqual([{ code: 'f', name: 'f', values: [{ code: 'v', name: 'v' }] }]);
    });
});
