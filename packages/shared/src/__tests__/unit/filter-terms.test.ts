import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { QueryTooLargeError } from '../../bounded-read';
import { loadFilterTerms } from '../../filter-terms';

const spec = { table: 'term_table', ownerColumn: 'ownerId' };
const ctx = {} as RequestContext;

function connectionReturning(count: number): {
    connection: Parameters<typeof loadFilterTerms>[0];
    query: ReturnType<typeof vi.fn>;
} {
    const query = vi.fn(async () => new Array(count).fill({ ownerId: 1, side: 'product' }));
    return { connection: { getRepository: () => ({ query }) } as never, query };
}

describe('loadFilterTerms', () => {
    it('bounds the read by the owners passed in and groups terms per owner', async () => {
        const { connection, query } = connectionReturning(400);
        const terms = await loadFilterTerms(connection, ctx, spec, [1, 2]);
        expect(terms.get(1)).toHaveLength(400);
        expect(query.mock.calls[0][0]).toMatch(/LIMIT 401$/);
    });

    it('fails loudly one row past the per-owner allowance', async () => {
        const { connection } = connectionReturning(401);
        await expect(loadFilterTerms(connection, ctx, spec, [1, 2])).rejects.toThrow(
            QueryTooLargeError,
        );
    });

    it('does not query for an empty owner list', async () => {
        const { connection, query } = connectionReturning(0);
        expect((await loadFilterTerms(connection, ctx, spec, [])).size).toBe(0);
        expect(query).not.toHaveBeenCalled();
    });
});
